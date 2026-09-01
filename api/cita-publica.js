// Función serverless de Vercel para la página pública de confirmación
// de una clase (/confirmar-cita?t=TOKEN). No pide sesión: quien tiene el
// enlace del correo es el cliente.
//
// Dos operaciones:
//   GET  ?t=TOKEN  → datos mínimos de la cita, para mostrarle qué está
//                    confirmando antes de que apriete nada.
//   POST {token}   → la marca como confirmada por el cliente.
//
// Por qué confirmar es POST y no un enlace directo: muchos clientes de
// correo y antivirus ABREN los enlaces de un mensaje para revisarlos.
// Si confirmar fuera un GET, la cita quedaría confirmada sola sin que la
// persona la haya visto. Por eso el correo lleva a una página, y recién
// el botón de esa página confirma.
import { createClient } from "@supabase/supabase-js";

const ZONA_CHILE = "America/Santiago";
const NOMBRES_TIPO = { evaluacion: "Evaluación", clase: "Clase de adiestramiento" };

function admin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Solo lo que la persona necesita ver para reconocer su cita. Nada de
// ids internos, precios ni datos de otros: la URL es adivinable por
// quien reciba el correo reenviado.
function paraElCliente(cita) {
  return {
    clienteNombre: cita.cliente_nombre,
    perro: cita.perro,
    // La evaluación incluida en un plan se guarda con tipo "clase" y
    // numero_clase 0 (así la trata el checklist de Alumnos). Al cliente
    // hay que nombrarla por lo que es.
    tipo: cita.numero_clase === 0 ? NOMBRES_TIPO.evaluacion : (NOMBRES_TIPO[cita.tipo] || cita.tipo),
    tema: cita.tema || null,
    adiestrador: cita.adiestrador,
    fechaTexto: new Intl.DateTimeFormat("es-CL", {
      timeZone: ZONA_CHILE,
      weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
    }).format(new Date(cita.fecha_hora)),
    estado: cita.estado,
    yaConfirmada: !!cita.confirmada_cliente_en,
  };
}

export default async function handler(req, res) {
  const db = admin();
  if (!db) {
    res.status(500).json({ error: "Falta configuración del servidor" });
    return;
  }

  const token = req.method === "GET" ? req.query?.t : req.body?.token;
  // Un token con forma rara ni siquiera llega a consultar la base.
  if (!token || !/^[0-9a-f-]{36}$/i.test(String(token))) {
    res.status(400).json({ error: "Enlace inválido" });
    return;
  }

  const { data: cita, error } = await db
    .from("citas_agenda")
    .select("id, cliente_nombre, perro, tipo, tema, adiestrador, fecha_hora, estado, confirmada_cliente_en, numero_clase")
    .eq("token_confirmacion", token)
    .maybeSingle();

  if (error || !cita) {
    res.status(404).json({ error: "No encontramos esta cita. Puede que el enlace ya no sirva." });
    return;
  }

  if (req.method === "GET") {
    res.status(200).json({ cita: paraElCliente(cita) });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  if (cita.estado === "cancelada" || cita.estado === "rechazada") {
    res.status(409).json({ error: "Esta hora fue cancelada. Escríbenos y coordinamos otra." });
    return;
  }
  // Confirmar dos veces no es un error: la persona puede volver a abrir
  // el correo. Se responde igual que la primera vez.
  if (cita.confirmada_cliente_en) {
    res.status(200).json({ ok: true, cita: paraElCliente(cita) });
    return;
  }

  const { error: updErr } = await db
    .from("citas_agenda")
    .update({ confirmada_cliente_en: new Date().toISOString() })
    .eq("id", cita.id);
  if (updErr) {
    res.status(500).json({ error: "No pudimos guardar tu confirmación. Intenta de nuevo." });
    return;
  }

  res.status(200).json({ ok: true, cita: { ...paraElCliente(cita), yaConfirmada: true } });
}
