// Función serverless de Vercel: cancela o rechaza una cita y le avisa al
// cliente por correo. Gemela de api/confirmar-cita.js — mismo esquema de
// verificación (service role key, relee la cita de la base, no confía en
// nada que mande el navegador) y mismo diseño de correo.
//
// Son dos casos distintos y el texto cambia:
//   "rechazar"  — la persona pidió hora por el link público y nunca se le
//                 confirmó. Nunca tuvo cita; se le avisa que no pudimos
//                 tomarla y se la invita a elegir otra.
//   "cancelar"  — la cita YA estaba confirmada y se cae. Ahí sí hubo un
//                 compromiso que se rompe, y el correo lo dice así.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";
const ZONA_CHILE = "America/Santiago";
const NOMBRES_TIPO = { evaluacion: "Evaluación", clase: "Clase de adiestramiento" };

// Mismo motivo que en confirmar-cita.js: este código corre en los
// servidores de Vercel, que están en UTC. Sin timeZone explícito una cita
// de la tarde-noche cambia de día en el correo.
function fechaEnChile(iso) {
  const f = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_CHILE,
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function renderCorreo(cita, accion, urlAgenda) {
  const fechaCap = fechaEnChile(cita.fecha_hora);
  const tipoNombre = (NOMBRES_TIPO[cita.tipo] || cita.tipo).toLowerCase();
  const esRechazo = accion === "rechazar";
  const titulo = esRechazo ? "No pudimos tomar tu hora" : "Tu cita fue cancelada";
  const intro = esRechazo
    ? `Hola ${cita.cliente_nombre.split(" ")[0]}, gracias por escribirnos. No pudimos tomar la hora que pediste para tu ${tipoNombre}, así que quedó sin agendar.`
    : `Hola ${cita.cliente_nombre.split(" ")[0]}, tuvimos que cancelar tu ${tipoNombre} con ${cita.adiestrador}. Lamentamos el inconveniente.`;

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
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">${titulo}</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">${intro}</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">${esRechazo ? "Hora que habías pedido" : "Hora cancelada"}</p>
                      <p style="margin:0 0 14px; font-size:15px; font-weight:bold; color:${NAVY}; text-decoration:line-through;">${fechaCap}</p>
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Tipo</p>
                      <p style="margin:0; font-size:15px; color:${NAVY};">${NOMBRES_TIPO[cita.tipo] || cita.tipo}${cita.perro ? ` · 🐾 ${cita.perro}` : ""}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:22px 0 16px; font-size:14px; color:#5C5442; line-height:1.6;">
                  Puedes elegir otra hora cuando quieras, sin costo:
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center" style="background:${NAVY}; border-radius:24px;">
                      <a href="${urlAgenda}" style="display:inline-block; padding:12px 26px; font-size:14px; font-weight:bold; color:${CREAM}; text-decoration:none;">Elegir otra hora</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0; font-size:12.5px; color:#8A7E5C; line-height:1.6;">
                  Si prefieres que lo veamos juntos, respóndenos este correo y te ayudamos.
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

  const { data: perfil } = await admin.from("usuarios").select("rol,nombre").eq("email", userData.user.email).maybeSingle();
  const esStaff = perfil && ["coordinador", "administrador"].includes(perfil.rol);
  const esEntrenador = perfil && perfil.rol === "entrenador";
  if (!perfil || (!esStaff && !esEntrenador)) {
    res.status(403).json({ error: "Sin permiso para cancelar citas" });
    return;
  }

  const { citaId, accion } = req.body || {};
  if (!citaId || !["cancelar", "rechazar"].includes(accion)) {
    res.status(400).json({ error: "Falta citaId o la acción no es válida" });
    return;
  }

  const { data: cita, error: citaErr } = await admin
    .from("citas_agenda")
    .select("id, cliente_id, prospecto_id, cliente_nombre, perro, tipo, adiestrador, fecha_hora, estado, clientes(email), prospectos(email)")
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

  // Rechazar es para lo que nunca se confirmó; cancelar, para lo que sí.
  // Que cada acción exija su estado de partida evita, por ejemplo,
  // "rechazar" una cita que el cliente ya tiene confirmada y a la que
  // quizá ya se preparó para ir.
  const estadoEsperado = accion === "rechazar" ? "pendiente" : "agendada";
  const estadoNuevo = accion === "rechazar" ? "rechazada" : "cancelada";
  if (cita.estado !== estadoEsperado) {
    res.status(409).json({
      error: accion === "rechazar"
        ? "Esta cita ya no está pendiente — si ya la confirmaron, hay que cancelarla."
        : "Solo se puede cancelar una cita confirmada.",
    });
    return;
  }

  // Guard atómico: solo cambia si seguía en el estado esperado en este
  // mismo instante, para que dos personas no la cancelen a la vez y se
  // manden dos correos.
  const { data: actualizada, error: updErr } = await admin
    .from("citas_agenda")
    .update({ estado: estadoNuevo })
    .eq("id", citaId)
    .eq("estado", estadoEsperado)
    .select("id")
    .maybeSingle();
  if (updErr) {
    res.status(500).json({ error: "No se pudo cancelar la cita" });
    return;
  }
  if (!actualizada) {
    res.status(409).json({ error: "Otra persona acaba de cambiar esta cita" });
    return;
  }

  // Una cita ya pasada se cancela por orden, no porque el cliente vaya a
  // dejar de venir: escribirle sobre una hora de hace semanas confunde
  // más de lo que informa. Se limpia en silencio.
  if (new Date(cita.fecha_hora).getTime() < Date.now()) {
    res.status(200).json({ ok: true, aviso: "Cita ya pasada — se cerró sin avisarle al cliente." });
    return;
  }

  const clienteEmail = cita.clientes?.email || cita.prospectos?.email;
  if (!clienteEmail) {
    res.status(200).json({ ok: true, aviso: "Cita cancelada, pero el cliente no tiene correo registrado: avísale tú." });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    res.status(200).json({ ok: true, aviso: "Cita cancelada, pero falta configurar RESEND_API_KEY: no se envió el correo." });
    return;
  }

  const urlAgenda = `https://${req.headers.host || "www.howria.cl"}/agendaadiestrador`;
  const asunto = accion === "rechazar" ? "No pudimos tomar tu hora con Howria" : "Tu cita con Howria fue cancelada";
  const html = renderCorreo(cita, accion, urlAgenda);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Howria <citas@howria.cl>", to: [clienteEmail], subject: asunto, html }),
  });

  if (!resendResp.ok) {
    const detalle = await resendResp.text().catch(() => "");
    res.status(502).json({ error: "La cita quedó cancelada, pero el correo no se pudo enviar", detalle });
    return;
  }

  await admin.from("correos").insert({
    direccion: "saliente",
    remitente: "citas@howria.cl",
    destinatario: clienteEmail,
    asunto,
    cuerpo_html: html,
    cliente_id: cita.cliente_id,
    prospecto_id: cita.prospecto_id,
  });

  res.status(200).json({ ok: true });
}
