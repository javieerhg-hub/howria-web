// Función serverless de Vercel: el staff responde un hilo desde la
// pestaña Mail del panel, sin salir a Gmail. Envía por Resend desde
// contacto@howria.cl (la misma dirección que recibe) y guarda el correo
// saliente en la tabla `correos` para que quede en el hilo.
import { createClient } from "@supabase/supabase-js";

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

  const { data: perfil } = await admin.from("usuarios").select("rol").eq("email", userData.user.email).maybeSingle();
  const esStaff = perfil && ["coordinador", "administrador"].includes(perfil.rol);
  if (!esStaff) {
    res.status(403).json({ error: "Sin permiso para responder correos" });
    return;
  }

  const { destinatario, asunto, cuerpo, clienteId, prospectoId } = req.body || {};
  if (!destinatario?.trim() || !/^\S+@\S+\.\S+$/.test(destinatario.trim())) {
    res.status(400).json({ error: "Destinatario inválido" });
    return;
  }
  if (!cuerpo?.trim()) {
    res.status(400).json({ error: "El mensaje no puede estar vacío" });
    return;
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    res.status(500).json({ error: "Falta configurar RESEND_API_KEY" });
    return;
  }

  const asuntoFinal = asunto?.trim() || "Re: tu consulta a Howria";
  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "Howria <contacto@howria.cl>",
      to: [destinatario.trim()],
      subject: asuntoFinal,
      text: cuerpo.trim(),
    }),
  });
  if (!resendResp.ok) {
    const detalle = await resendResp.text().catch(() => "");
    res.status(502).json({ error: "No se pudo enviar el correo", detalle });
    return;
  }

  const { data: guardado, error: insertErr } = await admin.from("correos").insert({
    direccion: "saliente",
    remitente: "contacto@howria.cl",
    destinatario: destinatario.trim(),
    asunto: asuntoFinal,
    cuerpo_texto: cuerpo.trim(),
    cliente_id: clienteId || null,
    prospecto_id: prospectoId || null,
    leido: true,
  }).select().single();
  if (insertErr || !guardado) {
    // El correo ya salió — avisamos igual que quedó enviado aunque no se
    // pudo guardar en el hilo, para que el equipo no piense que falló.
    res.status(200).json({ ok: true, aviso: "Correo enviado, pero no se pudo guardar en el hilo." });
    return;
  }

  res.status(200).json({ ok: true, correo: guardado });
}
