// Función serverless de Vercel: coordinación o administración escriben un
// aviso a mano (pestaña "Notificaciones") y lo eligen para un entrenador o
// paseador puntual — a diferencia de api/avisar-inicio-ronda.js (automático,
// disparado por un cambio de fase), acá el mensaje y el destinatario los
// decide una persona en el momento.
import { createClient } from "@supabase/supabase-js";
import { enviarNotificacionPushAEmails } from "./_lib/enviarPush.js";

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

  // Solo coordinación/administración pueden mandar un aviso manual a otra
  // persona del equipo — se valida el rol acá, no solo con la pestaña
  // oculta en el panel (esa es cosmética, esto es lo que de verdad protege).
  const { data: perfil } = await admin.from("usuarios").select("rol").eq("email", userData.user.email).maybeSingle();
  if (!perfil || (perfil.rol !== "coordinador" && perfil.rol !== "administrador")) {
    res.status(403).json({ error: "No tienes permiso para enviar avisos" });
    return;
  }

  const { destinatarioEmail, titulo, cuerpo } = req.body || {};
  if (!destinatarioEmail || !titulo?.trim() || !cuerpo?.trim()) {
    res.status(400).json({ error: "Falta elegir a quién enviárselo o escribir el mensaje" });
    return;
  }

  const { data: destinatario } = await admin.from("usuarios").select("email").eq("email", destinatarioEmail).maybeSingle();
  if (!destinatario) {
    res.status(404).json({ error: "No se encontró a ese usuario" });
    return;
  }

  const entregadas = await enviarNotificacionPushAEmails(admin, [destinatario.email], {
    titulo: titulo.trim(),
    cuerpo: cuerpo.trim(),
    url: "/admin",
  });

  res.status(200).json({ ok: true, entregada: entregadas > 0 });
}
