// Función serverless de Vercel: recibe el formulario "Registro de cuenta"
// de la bienvenida del login. Quien lo llena no tiene sesión (todavía no
// es del equipo), así que esto usa la service role key como único punto
// de confianza, igual que api/cliente-agenda.js — la solicitud queda
// pendiente hasta que un administrador la revisa desde el panel.
import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { nombre, email, telefono, mensaje } = req.body || {};
  if (!nombre?.trim() || !email?.trim()) {
    res.status(400).json({ error: "Faltan tu nombre y tu correo" });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    res.status(400).json({ error: "El correo no parece válido" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { error } = await admin.from("solicitudes_registro").insert({
    nombre: nombre.trim(),
    email: email.trim(),
    telefono: telefono?.trim() || null,
    mensaje: mensaje?.trim() || null,
  });
  if (error) {
    res.status(500).json({ error: "No se pudo enviar la solicitud" });
    return;
  }

  res.status(200).json({ ok: true });
}
