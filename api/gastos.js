// Función serverless de Vercel: recibe un gasto desde el iPhone y lo deja
// en la bandeja de "por revisar" de Finanzas personales.
//
// El flujo: Javier paga con Apple Pay -> una automatización de Atajos se
// dispara con la transacción -> el atajo hace un POST acá -> el gasto
// aparece en la app sin categoría y sin contar todavía, hasta que él lo
// revisa. Ver database/125_gastos_desde_el_telefono.sql.
//
// TRES DECISIONES DE SEGURIDAD, porque esto abre una puerta a datos
// privados:
//
//  1. SOLO ESCRIBE. Nunca devuelve un gasto, ni una lista, ni un total.
//     Si alguien se hiciera del token, lo peor que puede hacer es meter
//     gastos falsos en la bandeja — no puede leer un solo peso.
//  2. El dueño NO viene en la petición. Se lee de GASTOS_USUARIO_EMAIL,
//     una variable de entorno. Aunque alguien mande otro correo en el
//     cuerpo, se ignora: no hay forma de escribir en los gastos de otra
//     persona desde acá.
//  3. Entra a la bandeja (confirmado = false), no a las cuentas. Un
//     cobro raro, una devolución o una prueba no mueven el "te queda
//     limpio" sin que Javier lo mire primero.
//
// La tabla tiene RLS atada al correo de la sesión (migración 123). Esta
// función usa la service role key, que la salta, y por eso fija el correo
// explícitamente en vez de dejar que el default del token lo resuelva.
import { createClient } from "@supabase/supabase-js";

// Las 7 categorías que iOS le pone a cada compra, traducidas a las 7 de
// Finanzas personales. Las de Apple se ven en la pantalla de la
// automatización: Alimentos y bebidas, Compras, Viajes, Servicios,
// Entretenimiento, Salud, Transporte.
//
// "Servicios" cae en "casa" porque los gastos de casa de Javier son
// arriendo, luz, gastos comunes e internet — todos servicios. Y "compras"
// cae en "personal", que es el cajón donde ya tiene cosas como los gatos.
// Si alguna no calza, se corrige al revisar el gasto en la app.
const CATEGORIA_DESDE_IOS = {
  "alimentos y bebidas": "comida",
  "comida y bebida": "comida",
  "comida": "comida",
  "transporte": "transporte",
  "viajes": "transporte",
  "salud": "salud",
  "servicios": "casa",
  "entretenimiento": "personal",
  "compras": "personal",
};

function sinTildes(texto) {
  return String(texto || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// El monto viene en pesos chilenos, que no tienen centavos. Puede llegar
// como número (600), o como texto: "$600", "$1.234", "1,234", "600.00".
//
// El punto y la coma son ambiguos y acá el error se paga caro: leer
// "1.234" como 1,234 pesos, o "600.00" como 60.000, son errores de dos y
// tres órdenes de magnitud en un dato de plata. La regla que los desarma:
//
//  - Un separador final seguido de EXACTAMENTE 2 dígitos son centavos y
//    se descartan ("600.00" -> 600, "1.234,56" -> 1.234).
//  - Cualquier otro separador es de miles y se borra ("1.234" -> 1234).
//
// Funciona porque en el formato chileno los grupos de miles son de 3
// dígitos, así que un ".34" al final nunca puede ser un grupo de miles.
export function parsearMonto(valor) {
  if (typeof valor === "number" && Number.isFinite(valor)) return Math.round(Math.abs(valor));
  const texto = String(valor || "");
  // El primer número que aparezca, con o sin separadores.
  const m = texto.match(/-?\d[\d.,]*/);
  if (!m) return null;
  const limpio = m[0]
    .replace(/[.,]\d{2}$/, "")   // centavos, si vinieran
    .replace(/[.,]/g, "");        // separadores de miles
  const n = Number(limpio);
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : null;
}

// De un texto suelto como "$600 en EL CERRO SPA" saca el comercio: lo que
// queda al quitarle el monto y las palabras de relleno. Si no queda nada
// legible, se devuelve el texto completo — es preferible una descripción
// fea a una vacía, porque igual la va a revisar una persona.
export function parsearComercio(texto) {
  const bruto = String(texto || "").replace(/\s+/g, " ").trim();
  if (!bruto) return "";
  const sinMonto = bruto
    .replace(/\$\s*\d[\d.,]*/g, " ")
    .replace(/\b\d[\d.,]*\b/g, " ")
    .replace(/\b(en|por|con|tu|el|la|de|clp|pesos|compraste|compra)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return sinMonto.length >= 3 ? sinMonto : bruto;
}

// Una fecha "YYYY-MM-DD" válida, o null. No se acepta cualquier cosa: si
// el atajo manda algo raro, mejor que el gasto quede con la fecha de hoy
// a que quede con una fecha inventada en otro mes.
function fechaValida(valor) {
  const s = String(valor || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenEsperado = process.env.GASTOS_TOKEN;
  const dueno = process.env.GASTOS_USUARIO_EMAIL;
  if (!supabaseUrl || !serviceRoleKey || !tokenEsperado || !dueno) {
    res.status(500).json({ error: "Falta configuración del servidor" });
    return;
  }

  // El token puede venir por cabecera (lo normal) o dentro del cuerpo,
  // porque según cómo quede armado el atajo una u otra es más cómoda.
  const cuerpo = typeof req.body === "string" ? intentarJson(req.body) : (req.body || {});
  const token = req.headers["x-howria-token"] || cuerpo.token;
  if (token !== tokenEsperado) {
    // Mismo mensaje para token ausente y token equivocado: no hay que
    // ayudar a distinguir "casi lo tenías" de "ni cerca".
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  // El atajo puede mandar los campos por separado o un texto suelto con
  // toda la transacción. Se aceptan las dos formas: mientras no sepamos
  // con qué nombres exactos los entrega iOS, el texto crudo garantiza que
  // el gasto igual entra y que nada se pierde.
  const textoCrudo = typeof req.body === "string" ? req.body : (cuerpo.texto || cuerpo.transaccion || "");
  const monto = parsearMonto(cuerpo.monto ?? cuerpo.amount ?? textoCrudo);
  if (!monto) {
    res.status(400).json({ error: "No se pudo leer el monto" });
    return;
  }

  const comercio = String(cuerpo.comercio || cuerpo.merchant || "").trim() || parsearComercio(textoCrudo) || "Compra con el teléfono";
  const categoriaIos = sinTildes(cuerpo.categoria || cuerpo.category || "");
  const categoria = CATEGORIA_DESDE_IOS[categoriaIos] || "otros";
  const fecha = fechaValida(cuerpo.fecha || cuerpo.date) || new Date().toISOString().slice(0, 10);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await admin.from("gastos_personales").insert({
    usuario_email: dueno,
    descripcion: comercio.slice(0, 120),
    monto,
    categoria,
    fecha,
    fijo: false,
    origen: "apple_pay",
    confirmado: false,
    origen_texto: String(textoCrudo || JSON.stringify(cuerpo)).slice(0, 500),
  });

  if (error) {
    res.status(500).json({ error: "No se pudo guardar el gasto" });
    return;
  }

  // A propósito no se devuelve el gasto guardado ni ningún total: esta
  // puerta es de una sola dirección.
  res.status(200).json({ ok: true });
}

function intentarJson(texto) {
  try {
    const v = JSON.parse(texto);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}
