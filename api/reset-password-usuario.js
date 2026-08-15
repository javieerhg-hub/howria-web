// Función serverless de Vercel (no pasa por Vite): un administrador la
// llama desde Usuarios para resetear la contraseña de una cuenta de
// equipo, sin tener que entrar directo a Supabase → Authentication.
// Verifica quién llama con la service role key (nunca expuesta al
// navegador) y confirma que sea administrador antes de tocar nada.
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

const ALFABETO_PASSWORD = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // sin 0/O ni 1/l/I
function generarPasswordTemporal() {
  let out = "";
  for (let i = 0; i < 12; i++) out += ALFABETO_PASSWORD[crypto.randomInt(ALFABETO_PASSWORD.length)];
  return out;
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

  const { data: perfil } = await admin.from("usuarios").select("rol").eq("email", userData.user.email).maybeSingle();
  if (!perfil || perfil.rol !== "administrador") {
    res.status(403).json({ error: "Solo un administrador puede resetear contraseñas de otras cuentas" });
    return;
  }

  const { email } = req.body || {};
  if (!email) {
    res.status(400).json({ error: "Falta el correo de la cuenta" });
    return;
  }

  // La API admin de Supabase no tiene un getUserByEmail directo — se
  // recorre la lista paginada (el equipo es chico, alcanza con pocas
  // páginas) hasta encontrar el correo.
  let targetId = null;
  for (let page = 1; page <= 10 && !targetId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      res.status(500).json({ error: "No se pudo buscar la cuenta de acceso" });
      return;
    }
    const encontrado = data.users.find((u) => u.email === email);
    if (encontrado) targetId = encontrado.id;
    if (data.users.length < 200) break;
  }
  if (!targetId) {
    res.status(404).json({ error: "No se encontró una cuenta de acceso con ese correo en Supabase Auth" });
    return;
  }

  const password = generarPasswordTemporal();
  const { error: updErr } = await admin.auth.admin.updateUserById(targetId, { password });
  if (updErr) {
    res.status(500).json({ error: "No se pudo cambiar la contraseña" });
    return;
  }

  res.status(200).json({ ok: true, password });
}
