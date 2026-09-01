// Función serverless de Vercel: mueve una cita a otra fecha y le avisa al
// cliente. Hermana de confirmar-cita.js y cancelar-cita.js — mismo
// esquema de verificación (service role key, relee la cita de la base, no
// confía en nada que mande el navegador) y mismo diseño de correo.
//
// Solo se reprograma una cita CONFIRMADA. Una que todavía está pendiente
// no tiene hora comprometida con nadie: ahí lo que corresponde es
// confirmarla en el horario que sirva, o rechazarla.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";
const ZONA_CHILE = "America/Santiago";
const NOMBRES_TIPO = { evaluacion: "Evaluación", clase: "Clase de adiestramiento" };

// Sin timeZone explícito, Intl formatea en UTC — el servidor de Vercel
// corre ahí, y una cita de la tarde-noche cambiaría de día en el correo.
function fechaEnChile(iso) {
  const f = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_CHILE,
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function renderCorreo(cita, fechaNueva) {
  const antes = fechaEnChile(cita.fecha_hora);
  const ahora = fechaEnChile(fechaNueva);
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
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">Tu cita cambió de hora 🐾</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">
                  Hola ${cita.cliente_nombre.split(" ")[0]}, movimos tu ${tipoNombre.toLowerCase()} con ${cita.adiestrador} a una hora nueva. Toma nota:
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Antes era</p>
                      <p style="margin:0 0 14px; font-size:14px; color:#8A7E5C; text-decoration:line-through;">${antes}</p>
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Ahora es</p>
                      <p style="margin:0 0 14px; font-size:16px; font-weight:bold; color:${NAVY};">${ahora}</p>
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Tipo</p>
                      <p style="margin:0; font-size:15px; color:${NAVY};">${tipoNombre}${cita.perro ? ` · 🐾 ${cita.perro}` : ""}</p>
                    </td>
                  </tr>
                </table>
                <p style="margin:20px 0 0; font-size:12.5px; color:#8A7E5C; line-height:1.6;">
                  Si esa hora no te sirve, respóndenos este correo y lo vemos contigo.
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
    res.status(403).json({ error: "Sin permiso para reprogramar citas" });
    return;
  }

  const { citaId, fechaNueva } = req.body || {};
  if (!citaId || !fechaNueva || Number.isNaN(new Date(fechaNueva).getTime())) {
    res.status(400).json({ error: "Falta citaId o la fecha nueva no es válida" });
    return;
  }
  if (new Date(fechaNueva).getTime() <= Date.now()) {
    res.status(400).json({ error: "La fecha nueva tiene que ser en el futuro" });
    return;
  }

  const { data: cita, error: citaErr } = await admin
    .from("citas_agenda")
    .select("id, cliente_id, prospecto_id, cliente_nombre, perro, tipo, adiestrador, fecha_hora, duracion_min, estado, clientes(email), prospectos(email)")
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
  if (cita.estado !== "agendada") {
    res.status(409).json({ error: "Solo se puede reprogramar una cita confirmada." });
    return;
  }

  // Choque de horario del mismo adiestrador. El navegador ya avisa antes
  // de llegar acá, pero se revalida en el servidor: es lo único que ve
  // TODAS las citas, incluidas las que otra persona acaba de crear.
  const inicioNuevo = new Date(fechaNueva).getTime();
  const finNuevo = inicioNuevo + (cita.duracion_min || 60) * 60000;
  const { data: otras } = await admin
    .from("citas_agenda")
    .select("id, fecha_hora, duracion_min")
    .eq("adiestrador", cita.adiestrador)
    .in("estado", ["pendiente", "agendada"]);
  const choca = (otras || []).some((o) => {
    if (o.id === cita.id) return false;
    const ini = new Date(o.fecha_hora).getTime();
    return inicioNuevo < ini + (o.duracion_min || 60) * 60000 && finNuevo > ini;
  });
  if (choca) {
    res.status(409).json({ error: `${cita.adiestrador} ya tiene otra cita en ese horario.` });
    return;
  }

  const { data: actualizada, error: updErr } = await admin
    .from("citas_agenda")
    .update({ fecha_hora: new Date(fechaNueva).toISOString() })
    .eq("id", citaId)
    .eq("estado", "agendada")
    .select("id")
    .maybeSingle();
  if (updErr || !actualizada) {
    res.status(500).json({ error: "No se pudo reprogramar la cita" });
    return;
  }

  const clienteEmail = cita.clientes?.email || cita.prospectos?.email;
  if (!clienteEmail) {
    res.status(200).json({ ok: true, aviso: "Cita movida, pero el cliente no tiene correo registrado: avísale tú." });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    res.status(200).json({ ok: true, aviso: "Cita movida, pero falta configurar RESEND_API_KEY: no se envió el correo." });
    return;
  }

  const asunto = "Tu cita con Howria cambió de hora";
  const html = renderCorreo(cita, fechaNueva);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Howria <citas@howria.cl>", to: [clienteEmail], subject: asunto, html }),
  });

  if (!resendResp.ok) {
    const detalle = await resendResp.text().catch(() => "");
    res.status(502).json({ error: "La cita se movió, pero el correo no se pudo enviar", detalle });
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
