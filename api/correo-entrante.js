// Función serverless de Vercel: recibe los correos que llegan a
// contacto@howria.cl. Cloudflare Email Routing no puede leer correos "hacia
// afuera" — solo reenvía o entrega el mensaje crudo a un Worker — así que
// un Worker mínimo (howria-mail-relay, ver database/correos.sql y el README)
// reenvía cada correo entrante hasta acá para que quede guardado y visible
// en la pestaña Mail del panel.
//
// POST body: el mensaje crudo (RFC 822) como application/octet-stream —
// Vercel lo entrega como Buffer en req.body con ese content-type.
// Header x-mail-webhook-secret: debe coincidir con MAIL_WEBHOOK_SECRET
// (mismo secreto configurado en las variables del Worker).
import { createClient } from "@supabase/supabase-js";
import PostalMime from "postal-mime";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const secretoEsperado = process.env.MAIL_WEBHOOK_SECRET;
  const secretoRecibido = req.headers["x-mail-webhook-secret"];
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (!Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Se esperaba el correo crudo como application/octet-stream" });
    return;
  }

  let parsed;
  try {
    parsed = await PostalMime.parse(req.body);
  } catch {
    res.status(400).json({ error: "No se pudo interpretar el correo" });
    return;
  }

  const remitente = parsed.from?.address || "desconocido";
  const destinatario = parsed.to?.[0]?.address || "contacto@howria.cl";

  let clienteId = null;
  let prospectoId = null;
  if (parsed.from?.address) {
    const [{ data: clienteMatch }, { data: prospectoMatch }] = await Promise.all([
      admin.from("clientes").select("id").eq("email", parsed.from.address).maybeSingle(),
      admin.from("prospectos").select("id").eq("email", parsed.from.address).maybeSingle(),
    ]);
    clienteId = clienteMatch?.id || null;
    prospectoId = prospectoMatch?.id || null;
  }

  const { error: insertErr } = await admin.from("correos").insert({
    direccion: "entrante",
    remitente,
    destinatario,
    asunto: parsed.subject || null,
    cuerpo_texto: parsed.text || null,
    cuerpo_html: parsed.html || null,
    cliente_id: clienteId,
    prospecto_id: prospectoId,
  });
  if (insertErr) {
    res.status(500).json({ error: "No se pudo guardar el correo" });
    return;
  }

  res.status(200).json({ ok: true });
}
