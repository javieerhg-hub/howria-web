// Función serverless de Vercel: agenda (o mueve) una clase de un plan y
// le manda el correo al cliente con el botón para confirmar.
//
// Va por el servidor y no desde el navegador porque el correo necesita
// el token de confirmación de la cita, y ese token recién existe cuando
// la fila está en la base. Creándola acá se hacen las dos cosas en un
// solo viaje y sin que el navegador tenga que esperar el id.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const CREAM_SOFT = "#EAE0C6";
const RUST = "#A85C3B";
const ZONA_CHILE = "America/Santiago";

function fechaEnChile(iso) {
  const f = new Intl.DateTimeFormat("es-CL", {
    timeZone: ZONA_CHILE,
    weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));
  return f.charAt(0).toUpperCase() + f.slice(1);
}

function renderCorreo(cita, urlConfirmar) {
  const fechaCap = fechaEnChile(cita.fecha_hora);
  // La evaluación incluida en un plan se guarda con tipo "clase" y
  // numero_clase 0 (así la trata el checklist de Alumnos), pero al
  // cliente hay que nombrarla por lo que es.
  const esEvaluacion = cita.numero_clase === 0 || cita.tipo === "evaluacion";
  const queEs = esEvaluacion ? "evaluación" : "clase";
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
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">Te agendamos una ${queEs} 🐾</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">
                  Hola ${String(cita.cliente_nombre || "").split(" ")[0]}, reservamos esta hora para ${cita.perro || "tu perrito"} con ${cita.adiestrador}. Confírmanos que puedes.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Fecha y hora</p>
                      <p style="margin:0 0 14px; font-size:15px; font-weight:bold; color:${NAVY};">${fechaCap}</p>
                      ${cita.tema ? `<p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Tema de la ${queEs}</p>
                      <p style="margin:0 0 14px; font-size:15px; color:${NAVY};">${cita.tema}</p>` : ""}
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Adiestrador</p>
                      <p style="margin:0; font-size:15px; color:${NAVY};">${cita.adiestrador}</p>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0 0;">
                  <tr>
                    <td align="center" style="background:${NAVY}; border-radius:24px;">
                      <a href="${urlConfirmar}" style="display:inline-block; padding:13px 30px; font-size:15px; font-weight:bold; color:${CREAM}; text-decoration:none;">Confirmar mi ${queEs}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0; font-size:12.5px; color:#8A7E5C; line-height:1.6;">
                  Si esa hora no te sirve, respóndenos este correo y la cambiamos.
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
    res.status(500).json({ error: "Falta configuración del servidor" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    res.status(401).json({ error: "Sesión inválida" });
    return;
  }
  const { data: perfil } = await admin.from("usuarios").select("rol,nombre").eq("email", userData.user.email).maybeSingle();
  // Incluye al entrenador, a diferencia de cancelar/reprogramar cita:
  // agendar las clases de sus propios alumnos es su trabajo diario y ya
  // tiene la pestana Alumnos, que es desde donde se llama esto.
  if (!perfil || !["entrenador", "coordinador", "administrador"].includes(perfil.rol)) {
    res.status(403).json({ error: "Sin permiso para agendar clases" });
    return;
  }

  const { citaId, clienteId, planId, numeroClase, adiestrador, fechaISO, tema } = req.body || {};
  if (!adiestrador || !fechaISO || Number.isNaN(new Date(fechaISO).getTime())) {
    res.status(400).json({ error: "Falta el adiestrador o la fecha no es válida" });
    return;
  }
  if (new Date(fechaISO).getTime() <= Date.now()) {
    res.status(400).json({ error: "La fecha y hora deben ser en el futuro" });
    return;
  }

  // Choque de horario revalidado en el servidor: el navegador ya avisa,
  // pero es el único que ve TODAS las citas, incluidas las que otra
  // persona acaba de crear mientras el formulario estaba abierto.
  const inicio = new Date(fechaISO).getTime();
  const { data: otras } = await admin
    .from("citas_agenda")
    .select("id, fecha_hora, duracion_min")
    .eq("adiestrador", adiestrador)
    .in("estado", ["pendiente", "agendada"]);
  const choca = (otras || []).some((o) => {
    if (citaId && o.id === citaId) return false;
    const ini = new Date(o.fecha_hora).getTime();
    return inicio < ini + (o.duracion_min || 60) * 60000 && inicio + 60 * 60000 > ini;
  });
  if (choca) {
    res.status(409).json({ error: `${adiestrador} ya tiene otra cita en ese horario.` });
    return;
  }

  const campos = { fecha_hora: new Date(fechaISO).toISOString(), tema: tema || null };
  let cita;
  if (citaId) {
    // Mover una clase ya agendada: la confirmación anterior deja de
    // valer, porque el cliente confirmó OTRA hora.
    const { data, error } = await admin
      .from("citas_agenda")
      .update({ ...campos, confirmada_cliente_en: null })
      .eq("id", citaId)
      .select("*")
      .maybeSingle();
    if (error || !data) { res.status(500).json({ error: "No se pudo mover la clase" }); return; }
    cita = data;
  } else {
    const { data: cliente } = await admin
      .from("clientes").select("nombre, perro, email, telefono, direccion").eq("id", clienteId).maybeSingle();
    if (!cliente) { res.status(404).json({ error: "Cliente no encontrado" }); return; }
    const { data, error } = await admin
      .from("citas_agenda")
      .insert({
        ...campos,
        cliente_id: clienteId, cliente_nombre: cliente.nombre, perro: cliente.perro,
        email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion,
        tipo: "clase", adiestrador, estado: "agendada", origen: "staff",
        plan_id: planId || null, numero_clase: numeroClase ?? null,
      })
      .select("*")
      .maybeSingle();
    if (error || !data) { res.status(500).json({ error: "No se pudo agendar la clase" }); return; }
    cita = data;
  }

  const clienteEmail = cita.email;
  if (!clienteEmail) {
    res.status(200).json({ ok: true, cita, aviso: "Clase agendada, pero el cliente no tiene correo: avísale tú." });
    return;
  }
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    res.status(200).json({ ok: true, cita, aviso: "Clase agendada, pero falta configurar RESEND_API_KEY: no se envió el correo." });
    return;
  }

  const base = `https://${req.headers.host || "www.howria.cl"}`;
  const urlConfirmar = `${base}/confirmar-cita?t=${cita.token_confirmacion}`;
  const asunto = `Te agendamos una ${cita.numero_clase === 0 ? "evaluación" : "clase"} en Howria`;
  const html = renderCorreo(cita, urlConfirmar);

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "Howria <citas@howria.cl>", to: [clienteEmail], subject: asunto, html }),
  });
  if (!resendResp.ok) {
    const detalle = await resendResp.text().catch(() => "");
    res.status(502).json({ error: "La clase quedó agendada, pero el correo no se pudo enviar", detalle, cita });
    return;
  }

  await admin.from("correos").insert({
    direccion: "saliente",
    remitente: "citas@howria.cl",
    destinatario: clienteEmail,
    asunto,
    cuerpo_html: html,
    cliente_id: cita.cliente_id,
  });

  res.status(200).json({ ok: true, cita });
}
