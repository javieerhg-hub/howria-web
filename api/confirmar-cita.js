// Función serverless de Vercel (no pasa por Vite): el adiestrador/staff la
// llama desde el panel al hacer clic en "Confirmar" sobre una cita
// pendiente. Verifica quién llama con la service role key (nunca expuesta
// al navegador), vuelve a leer la cita desde la base (no confía en nada
// que mande el cliente) y, si corresponde, envía el correo de confirmación
// con diseño Howria vía Resend.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";

const NOMBRES_TIPO = { evaluacion: "Evaluación", clase: "Clase de adiestramiento" };

function renderCorreoConfirmacion(cita) {
  const fecha = new Intl.DateTimeFormat("es-CL", {
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
                      <p style="margin:0; font-size:15px; color:${NAVY};">${cita.adiestrador}</p>
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
    .select("id, cliente_id, cliente_nombre, perro, tipo, adiestrador, fecha_hora, duracion_min, estado, clientes(email)")
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
  const clienteEmail = cita.clientes?.email;
  if (!clienteEmail) {
    res.status(422).json({ error: "El cliente no tiene correo registrado" });
    return;
  }

  // Guard atómico contra doble confirmación/doble envío: solo actualiza si
  // seguía en 'pendiente' en este mismo instante.
  const { data: actualizada, error: updErr } = await admin
    .from("citas_agenda")
    .update({ estado: "agendada", confirmada_en: new Date().toISOString(), email_enviado: true })
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

  res.status(200).json({ ok: true });
}
