// Función serverless de Vercel: recibe el formulario "Registro de cuenta"
// de la bienvenida del login. Quien lo llena no tiene sesión (todavía no
// es del equipo), así que esto usa la service role key como único punto
// de confianza, igual que api/cliente-agenda.js.
//
// La cuenta de acceso (Supabase Auth) se crea acá mismo, con la
// contraseña que la persona eligió — así no hay que generarle una
// temporal ni mostrársela al administrador después. Lo que queda
// "pendiente" es su perfil en la tabla usuarios: sin esa fila no puede
// entrar a nada (ver el mensaje "Tu cuenta no tiene un perfil asociado"
// en Login), así que la cuenta existe pero no sirve de nada hasta que un
// administrador la aprueba desde el panel.
import { createClient } from "@supabase/supabase-js";

// Debe dar exactamente el mismo resultado que slugEmailUsuario() en
// HowriaAdmin.jsx — es el correo con el que la persona va a entrar.
function slugEmailUsuario(nombre) {
  const limpio = nombre.trim().toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, ".");
  return `${limpio}@howria.local`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { nombre, email, telefono, mensaje, password } = req.body || {};
  if (!nombre?.trim() || !email?.trim() || !password) {
    res.status(400).json({ error: "Faltan tu nombre, tu correo y una contraseña" });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
    res.status(400).json({ error: "El correo no parece válido" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const emailAcceso = slugEmailUsuario(nombre.trim());
  const { error: errorCuenta } = await admin.auth.admin.createUser({
    email: emailAcceso,
    password,
    email_confirm: true,
  });
  if (errorCuenta) {
    const yaExiste = /already|registered|existe/i.test(errorCuenta.message || "");
    res.status(400).json({
      error: yaExiste
        ? "Ya existe una cuenta con ese nombre — prueba agregando tu apellido para diferenciarte."
        : "No se pudo crear tu cuenta de acceso",
    });
    return;
  }

  const { error } = await admin.from("solicitudes_registro").insert({
    nombre: nombre.trim(),
    email: email.trim(),
    telefono: telefono?.trim() || null,
    mensaje: mensaje?.trim() || null,
  });
  if (error) {
    res.status(500).json({ error: "Tu cuenta se creó pero no se pudo guardar la solicitud — avísale directamente al equipo." });
    return;
  }

  res.status(200).json({ ok: true });
}
