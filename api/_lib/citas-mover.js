// Función serverless de Vercel: le pone hora a una cita y le avisa al
// cliente. Hermana de citas-confirmar.js y citas-cancelar.js — mismo
// esquema de verificación (service role key, relee la cita de la base, no
// confía en nada que mande el navegador) y mismo diseño de correo.
//
// Hace dos cosas que son la misma por dentro:
//   accion "agendar"  → agenda (o mueve) una clase de un plan desde
//                       Alumnos, y manda el correo con el botón para
//                       confirmar. Crea la cita si todavía no existe.
//   por omisión       → reprograma una cita ya confirmada desde la ficha
//                       del cliente, avisando de la hora vieja y la nueva.
//
// Van juntas en un archivo, y no una por lado como pedía la prolijidad,
// porque el plan Hobby de Vercel permite máximo 12 funciones serverless
// por deploy y cada archivo de api/ cuenta como una. Separarlas de nuevo
// es lo primero que se puede hacer si el proyecto pasa a Pro.
//
// Solo se reprograma una cita CONFIRMADA. Una que todavía está pendiente
// no tiene hora comprometida con nadie: ahí lo que corresponde es
// confirmarla en el horario que sirva, o rechazarla.
import { createClient } from "@supabase/supabase-js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
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

// `revivida` = la cita estaba cancelada y se le puso hora nueva. Es un
// mensaje distinto: al cliente no se le movió una hora que tenía, se le
// devolvió una que le habíamos quitado. Mostrarle la fecha vieja tachada
// ahí no aporta — esa hora ya la sabe cancelada.
function renderCorreo(cita, fechaNueva, revivida = false) {
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
                <h1 style="margin:0 0 6px; font-family:Georgia, serif; font-size:20px; color:${NAVY};">${revivida ? "Volvimos a agendar tu cita" : "Tu cita cambió de hora"} 🐾</h1>
                <p style="margin:0 0 20px; font-size:14px; color:#5C5442; line-height:1.6;">
                  ${revivida
                    ? `Hola ${cita.cliente_nombre.split(" ")[0]}, habíamos cancelado tu ${tipoNombre.toLowerCase()} con ${cita.adiestrador} y ya tenemos hora nueva. Toma nota:`
                    : `Hola ${cita.cliente_nombre.split(" ")[0]}, movimos tu ${tipoNombre.toLowerCase()} con ${cita.adiestrador} a una hora nueva. Toma nota:`}
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM_SOFT}; border-radius:8px;">
                  <tr>
                    <td style="padding:16px 18px;">
                      ${revivida ? "" : `<p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">Antes era</p>
                      <p style="margin:0 0 14px; font-size:14px; color:#8A7E5C; text-decoration:line-through;">${antes}</p>`}
                      <p style="margin:0 0 4px; font-size:11px; font-weight:bold; letter-spacing:1px; text-transform:uppercase; color:#8A7E5C;">${revivida ? "Quedó para" : "Ahora es"}</p>
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

async function manejarReprogramar(req, res) {
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
  // Se reprograma una cita confirmada (mover la hora) o una cancelada /
  // rechazada (volver a agendarla, que es lo que se hace cuando el
  // cliente vuelve a aparecer). Una realizada no: ya pasó.
  const REPROGRAMABLES = ["agendada", "cancelada", "rechazada"];
  if (!REPROGRAMABLES.includes(cita.estado)) {
    res.status(409).json({
      error: cita.estado === "pendiente"
        ? "Esta cita todavía no está confirmada — confirmala en el horario que sirva."
        : "Una cita ya realizada no se puede reprogramar.",
    });
    return;
  }
  const revivida = cita.estado !== "agendada";

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
    // Una cancelada vuelve a "agendada": si no, quedaría con hora nueva
    // pero seguiría apareciendo en el historial en vez de en las próximas.
    // La confirmación del cliente se limpia porque confirmó OTRA hora.
    .update({ fecha_hora: new Date(fechaNueva).toISOString(), estado: "agendada", confirmada_cliente_en: null })
    .eq("id", citaId)
    // Guard atómico contra dos personas moviendola a la vez: solo cambia
    // si seguía en el estado que leímos recién.
    .eq("estado", cita.estado)
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

  const asunto = revivida ? "Volvimos a agendar tu cita con Howria" : "Tu cita con Howria cambió de hora";
  const html = renderCorreo(cita, fechaNueva, revivida);

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

function renderCorreoAgenda(cita, urlConfirmar) {
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

async function manejarAgendar(req, res) {
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
        // Explicito, igual que citaToDb en el panel: sin esto la fila
        // quedaba con duracion nula y distinta al resto.
        duracion_min: 60,
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
  const html = renderCorreoAgenda(cita, urlConfirmar);

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

// El navegador dice cuál de las dos quiere. Sin "accion" se asume
// reprogramar, que es como se llamaba a este endpoint antes de que
// existiera agendar.
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }
  if (req.body?.accion === "agendar") return manejarAgendar(req, res);
  return manejarReprogramar(req, res);
}
