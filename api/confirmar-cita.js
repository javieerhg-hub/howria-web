// Función serverless de Vercel (no pasa por Vite). Dos confirmaciones
// distintas de una misma cita, en un archivo porque el plan Hobby de
// Vercel permite máximo 12 funciones serverless por deploy y cada
// archivo de api/ cuenta como una:
//
//   1. La del EQUIPO — el adiestrador/staff la llama desde el panel al
//      hacer clic en "Confirmar" sobre una cita pendiente. Pide sesión.
//   2. La del CLIENTE — la persona llega desde el botón del correo a la
//      página /confirmar-cita. No pide sesión: la llave es el token de
//      la cita. Solo puede escribir confirmada_cliente_en, y solo en la
//      fila de ese token.
//
// La rama pública va primero y siempre retorna, así que nunca cae en la
// verificación de sesión de la otra.
//
// Sobre (1): el adiestrador/staff la llama desde el panel al hacer clic
// en "Confirmar" sobre una cita pendiente. Verifica quién llama con la service role key (nunca expuesta
// al navegador), vuelve a leer la cita desde la base (no confía en nada
// que mande el cliente) y, si corresponde, envía el correo de confirmación
// con diseño Howria vía Resend.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";

const NOMBRES_TIPO = { evaluacion: "Evaluación", clase: "Clase de adiestramiento" };

function fmtCLP(n) {
  return Number(n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

// Este código corre en los servidores de Vercel, que están en UTC. Sin
// `timeZone` explícito, Intl formatea en UTC: una cita de las 15:00 en
// Chile salía como 18:00 en el correo, y una de la tarde-noche cambiaba
// derechamente de DÍA (22:00 del lunes → "01:00 del martes"). El cliente
// recibía una fecha distinta a la que había elegido. api/cliente-agenda.js
// ya lo hacía bien; este correo era el único que faltaba.
const ZONA_CHILE = "America/Santiago";

function renderCorreoConfirmacion(cita) {
  const fecha = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_CHILE,
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(cita.fecha_hora));
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  const tipoNombre = NOMBRES_TIPO[cita.tipo] || cita.tipo;

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
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">¡Tu cita fue confirmada! 🐾</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">
                  Hola ${cita.cliente_nombre.split(" ")[0]}, tu ${tipoNombre.toLowerCase()} con ${cita.adiestrador} quedó agendada. Te esperamos.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Fecha y hora</p>
                      <p style="margin:0 0 14px; font-size:15px; font-weight:bold; color:${NAVY};">${fechaCap}</p>
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Tipo</p>
                      <p style="margin:0 0 14px; font-size:15px; color:${NAVY};">${tipoNombre}${cita.perro ? ` · 🐾 ${cita.perro}` : ""}</p>
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Adiestrador</p>
                      <p style="margin:0${cita.precio > 0 ? " 0 14px" : ""}; font-size:15px; color:${NAVY};">${cita.adiestrador}</p>
                      ${cita.precio > 0 ? `<p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Precio</p>
                      <p style="margin:0; font-size:15px; color:${NAVY};">${fmtCLP(cita.precio)}</p>` : ""}
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0; font-size:12.5px; color:#8A7E5C; line-height:1.6;">
                  Si necesitas cambiar la hora, contáctanos y lo vemos contigo.
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:18px; border-top:1px solid #EDE4CE;">
                <p style="margin:0; font-size:11.5px; color:${RUST};">Howria · Paseos y adiestramiento canino</p>
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
  // Rama pública: si viene un token de cita, es el cliente desde el
  // correo, no alguien del equipo con sesión abierta.
  const tokenPublico = req.method === "GET" ? req.query?.t : req.body?.token;
  if (tokenPublico) return manejarConfirmacionCliente(req, res, tokenPublico);

  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "No autenticado" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  const email = userData.user.email;

  const { data: perfil } = await admin.from("usuarios").select("rol,nombre").eq("email", email).maybeSingle();
  const esStaff = perfil && ["coordinador", "administrador"].includes(perfil.rol);
  const esEntrenador = perfil && perfil.rol === "entrenador";
  if (!perfil || (!esStaff && !esEntrenador)) {
    res.status(403).json({ error: "Sin permiso para confirmar citas" });
    return;
  }

  const { citaId } = req.body || {};
  if (!citaId) {
    res.status(400).json({ error: "Falta citaId" });
    return;
  }

  const { data: cita, error: citaErr } = await admin
    .from("citas_agenda")
    .select("id, cliente_id, prospecto_id, cliente_nombre, perro, tipo, adiestrador, fecha_hora, duracion_min, estado, precio, clientes(email), prospectos(email)")
    .eq("id", citaId)
    .maybeSingle();
  if (citaErr || !cita) {
    res.status(404).json({ error: "Cita no encontrada" });
    return;
  }
  if (esEntrenador && cita.adiestrador !== perfil.nombre) {
    res.status(403).json({ error: "Esta cita no es tuya" });
    return;
  }
  if (cita.estado !== "pendiente") {
    res.status(409).json({ error: "La cita ya no está pendiente de confirmación" });
    return;
  }
  const clienteEmail = cita.clientes?.email || cita.prospectos?.email;
  if (!clienteEmail) {
    res.status(422).json({ error: "El cliente no tiene correo registrado" });
    return;
  }

  // Guard atómico contra doble confirmación/doble envío: solo actualiza si
  // seguía en 'pendiente' en este mismo instante. email_enviado se deja
  // fuera a propósito — recién se marca true más abajo, después de que
  // Resend confirme que aceptó el correo, para que nunca quede en true
  // sin haberse enviado de verdad.
  const { data: actualizada, error: updErr } = await admin
    .from("citas_agenda")
    .update({ estado: "agendada", confirmada_en: new Date().toISOString() })
    .eq("id", citaId)
    .eq("estado", "pendiente")
    .select("id")
    .maybeSingle();
  if (updErr) {
    res.status(500).json({ error: "No se pudo confirmar la cita" });
    return;
  }
  if (!actualizada) {
    res.status(409).json({ error: "La cita ya fue confirmada por otra persona" });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    // La cita ya quedó agendada — el adiestrador confirmó igual, avisamos
    // que falta el correo para que el equipo lo revise manualmente.
    res.status(200).json({ ok: true, aviso: "Cita confirmada, pero falta configurar RESEND_API_KEY: no se envió el correo." });
    return;
  }

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Howria <citas@howria.cl>",
      to: [clienteEmail],
      subject: "Tu cita con Howria fue confirmada",
      html: renderCorreoConfirmacion(cita),
    }),
  });

  if (!resendResp.ok) {
    const detalle = await resendResp.text().catch(() => "");
    res.status(502).json({ error: "La cita quedó confirmada, pero el correo no se pudo enviar", detalle });
    return;
  }

  await admin.from("citas_agenda").update({ email_enviado: true }).eq("id", citaId);

  await admin.from("correos").insert({
    direccion: "saliente",
    remitente: "citas@howria.cl",
    destinatario: clienteEmail,
    asunto: "Tu cita con Howria fue confirmada",
    cuerpo_html: renderCorreoConfirmacion(cita),
    cliente_id: cita.cliente_id,
    prospecto_id: cita.prospecto_id,
  });

  res.status(200).json({ ok: true });
}

function clienteAdmin() {
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

async function manejarConfirmacionCliente(req, res, token) {
  const db = clienteAdmin();
  if (!db) {
    res.status(500).json({ error: "Falta configuración del servidor" });
    return;
  }

  // Un token con forma rara ni siquiera llega a consultar la base.
  if (!/^[0-9a-f-]{36}$/i.test(String(token))) {
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
