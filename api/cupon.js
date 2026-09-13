// Función serverless de Vercel: el aviso de 10% que sale al entrar a
// howria.cl (src/PromoCupon.jsx). Recibe un correo, le asigna un código
// de cupón, lo deja como prospecto en Seguimiento y le manda el mail.
//
// Quien lo llena no tiene sesión (todavía no es nadie para la app), así
// que esto usa la service role key como único punto de confianza, igual
// que api/solicitud-registro.js y api/_lib/citas-agenda.js.
//
// OJO CON EL CUPO DE FUNCIONES: el plan Hobby de Vercel permite 12
// funciones serverless por deploy y cada archivo de api/ cuenta como una.
// Con esta van 11. Si hace falta una más, el patrón para juntarlas está
// en api/citas.js (un despachador por ?op=).
//
// TRES COSAS QUE ESTA FUNCIÓN HACE A PROPÓSITO:
//
//  1. UN CORREO = UN CUPÓN, PARA SIEMPRE. El mismo correo que vuelve a
//     pedirlo recibe el código que ya tenía (`email` es unique en la
//     tabla). Sin eso, darle al botón cinco veces creaba cinco cupones y
//     cinco prospectos duplicados.
//  2. NO REENVÍA EL MAIL si ya se envió una vez. El código vuelve igual
//     en la respuesta y la página lo muestra en pantalla, así que la
//     persona no queda sin él — pero nadie puede usar este formulario
//     para llenarle la bandeja a un tercero escribiendo su dirección y
//     apretando en loop.
//  3. SI EL CORREO NO SALE, EL CUPÓN IGUAL QUEDA — pero sin marcar. El
//     cupón y el prospecto se crean primero (el lead ya vale, aunque el
//     mail falle) y `email_enviado` se marca recién cuando Resend acepta,
//     igual que en api/_lib/citas-confirmar.js. Un cupón marcado como
//     enviado que nunca llegó es peor que uno sin marcar, porque nadie
//     vuelve a mirarlo. Y a la persona no se le deja con las manos
//     vacías: la pantalla le muestra el código aunque el correo falle.
import { createClient } from "@supabase/supabase-js";
import { randomInt } from "node:crypto";

const NAVY = "#122A40";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";
const GOLD = "#C9962F";

// Lo que dice el cupón. ESTÁ ACÁ Y EN src/PromoCupon.jsx (la pantalla):
// son los dos lugares donde la promesa se le muestra a la persona, y
// tienen que decir lo mismo. Si cambia el porcentaje o la condición, hay
// que tocar los dos.
const PROMO_TITULO = "10% de descuento en tu plan mensual de paseos";

// Sin I, O, 0 ni 1: el código se dicta por teléfono y se escribe a mano
// en la boleta, y esas cuatro se confunden entre sí.
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generarCodigo() {
  let sufijo = "";
  for (let i = 0; i < 5; i++) sufijo += ALFABETO[randomInt(ALFABETO.length)];
  return `PASEO10-${sufijo}`;
}

function fechaLegible(iso) {
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    day: "numeric", month: "long", year: "numeric",
  }).format(new Date(`${iso}T12:00:00-04:00`));
}

function renderCorreoCupon({ nombre, codigo, validoHasta }) {
  const saludo = nombre ? `Hola ${nombre.split(" ")[0]}` : "Hola";
  return `<!doctype html>
<html lang="es">
  <body style="margin:0; padding:0; background:${CREAM_SOFT}; font-family:Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; padding:32px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#FFFFFF; border-radius:10px; overflow:hidden; max-width:480px; width:100%;">
            <tr>
              <td align="center" style="background:${NAVY}; padding:24px;">
                <img src="https://howria.cl/logo-howria.png" alt="Howria" height="40" style="display:block;" />
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">Acá está tu cupón 🐾</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">
                  ${saludo}, gracias por interesarte en Howria. Este es tu código para un <strong>${PROMO_TITULO}</strong>.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td align="center" style="padding:22px 18px;">
                      <p style="margin:0 0 8px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Tu código</p>
                      <p style="margin:0 0 10px; font-size:26px; font-weight:bold; letter-spacing:2px; color:${NAVY}; font-family:'Courier New', Courier, monospace;">${codigo}</p>
                      <p style="margin:0; font-size:12.5px; color:#8A7E5C;">Válido hasta el ${fechaLegible(validoHasta)}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 0; font-size:14px; color:#5C5442; line-height:1.6;">
                  Para usarlo, escríbenos por WhatsApp con tu código y coordinamos el primer paseo de tu perro.
                </p>
                <p style="margin:22px 0 0;" align="center">
                  <a href="https://wa.me/56992471504" style="background:${GOLD}; color:${NAVY}; padding:13px 26px; border-radius:8px; font-weight:bold; font-size:14px; text-decoration:none; display:inline-block;">
                    Escribirnos por WhatsApp
                  </a>
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px; border-top:1px solid #EDE4CE;">
                <p style="margin:0; font-size:11.5px; color:${RUST};">Howria · Paseos y adiestramiento canino · Santiago</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { email, nombre, sitioWeb } = req.body || {};

  // Trampa para bots: es un campo que en la pantalla está escondido, así
  // que una persona nunca lo llena. Se responde 200 para no darle al bot
  // la señal de que fue detectado, pero no se crea ni se manda nada.
  if (sitioWeb) {
    res.status(200).json({ ok: true, codigo: null });
    return;
  }

  const emailLimpio = String(email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(emailLimpio)) {
    res.status(400).json({ error: "Escribe un correo válido para enviarte el cupón" });
    return;
  }
  const nombreLimpio = String(nombre || "").trim().slice(0, 80) || null;

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  let cupon = await buscarCupon(admin, emailLimpio);

  // Ya lo tenía y ya le llegó: se le devuelve el mismo código y no se
  // reenvía nada (ver la decisión 2 del encabezado).
  if (cupon?.email_enviado) {
    res.status(200).json({ ok: true, codigo: cupon.codigo, validoHasta: cupon.valido_hasta, yaEnviado: true });
    return;
  }

  if (!cupon) {
    const creado = await crearCupon(admin, { email: emailLimpio, nombre: nombreLimpio });
    if (creado.error) {
      res.status(500).json({ error: "No pudimos generar tu cupón. Intenta de nuevo en un momento." });
      return;
    }
    cupon = creado.cupon;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // El cupón existe y el lead ya quedó en Seguimiento. Se le muestra el
    // código en pantalla (que es lo que necesita) y se avisa que el mail
    // no salió, en vez de fingir que sí.
    res.status(200).json({
      ok: true, codigo: cupon.codigo, validoHasta: cupon.valido_hasta, correoEnviado: false,
    });
    return;
  }

  const html = renderCorreoCupon({
    nombre: nombreLimpio, codigo: cupon.codigo, validoHasta: cupon.valido_hasta,
  });
  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Howria <promociones@howria.cl>",
      // Si contestan el cupón, la respuesta tiene que caer en la bandeja
      // que el equipo sí lee (la de la pestaña Mail), no en un buzón
      // inventado para enviar.
      reply_to: "contacto@howria.cl",
      to: [emailLimpio],
      subject: `Tu cupón de ${PROMO_TITULO}`,
      html,
    }),
  });

  if (!resendResp.ok) {
    res.status(200).json({
      ok: true, codigo: cupon.codigo, validoHasta: cupon.valido_hasta, correoEnviado: false,
    });
    return;
  }

  await admin.from("cupones_promocion").update({ email_enviado: true }).eq("id", cupon.id);

  // A diferencia del correo de confirmación de citas, este NO se guarda en
  // la tabla `correos`: son envíos automáticos que pueden ser muchos, y
  // llenarían la pestaña Mail tapando los correos reales de clientes. El
  // lead ya queda visible donde corresponde, que es Seguimiento.
  res.status(200).json({ ok: true, codigo: cupon.codigo, validoHasta: cupon.valido_hasta, correoEnviado: true });
}

async function buscarCupon(admin, email) {
  const { data } = await admin
    .from("cupones_promocion")
    .select("id, codigo, valido_hasta, email_enviado")
    .eq("email", email)
    .maybeSingle();
  return data || null;
}

// Crea el prospecto y el cupón. El código se reintenta un par de veces por
// si sale uno repetido (32^5 combinaciones, así que es raro, pero `codigo`
// es unique y un choque dejaría a la persona sin cupón por nada).
async function crearCupon(admin, { email, nombre }) {
  // El lead entra a Seguimiento como cualquier otro contacto nuevo. Sin
  // nombre se usa lo que va antes del @, que es mejor que una fila en
  // blanco: `prospectos.nombre` es not null.
  const { data: prospecto } = await admin
    .from("prospectos")
    .insert({
      nombre: nombre || email.split("@")[0],
      email,
      origen: "Cupón 10%",
      tipo_servicio: ["paseos"],
      estado: "nuevo",
    })
    .select("id")
    .maybeSingle();

  for (let intento = 0; intento < 3; intento++) {
    const { data, error } = await admin
      .from("cupones_promocion")
      .insert({
        email,
        nombre,
        codigo: generarCodigo(),
        prospecto_id: prospecto?.id || null,
      })
      .select("id, codigo, valido_hasta, email_enviado")
      .maybeSingle();

    if (data) return { cupon: data };

    // 23505 = unique_violation. Puede ser por el código (se reintenta) o
    // por el correo: dos envíos a la vez del mismo formulario, donde el
    // otro ganó la carrera. En ese caso el cupón que sirve es el suyo.
    if (error?.code === "23505") {
      const existente = await buscarCupon(admin, email);
      if (existente) return { cupon: existente };
      continue;
    }
    return { error: error || new Error("No se pudo crear el cupón") };
  }
  return { error: new Error("No se pudo generar un código único") };
}
