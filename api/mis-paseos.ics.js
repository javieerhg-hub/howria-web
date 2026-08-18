// Función serverless de Vercel: suscripción de calendario (webcal://) para
// un paseador. A diferencia de un archivo .ics de una sola vez (3 intentos
// fallidos antes de este, ver memoria del proyecto), esto es una URL que
// la propia app Calendario del iPhone vuelve a pedir sola cada cierto
// tiempo — así que se mantiene al día sola si el coordinador le cambia el
// horario a un cliente, sin que el paseador tenga que volver a exportar
// nada.
//
// El "token" en la URL (usuarios.calendario_token, ver
// database/086_usuarios_calendario_token.sql) identifica al paseador sin
// depender de una sesión abierta — Calendario la pide en segundo plano, no
// desde el navegador logueado. No expone nada que el paseador no vea ya en
// "Mis paseos"; el riesgo es que quien tenga la URL (no solo el paseador)
// puede ver la dirección/horario de sus clientes mientras el token no se
// regenere.
import { createClient } from "@supabase/supabase-js";
import { construirICS } from "../src/lib/ics.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const token = req.query?.token;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Falta el token" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: usuario, error: errUsuario } = await admin
    .from("usuarios")
    .select("nombre")
    .eq("calendario_token", token)
    .maybeSingle();
  if (errUsuario || !usuario) {
    res.status(404).json({ error: "Link de calendario inválido" });
    return;
  }

  const { data: clientes, error: errClientes } = await admin
    .from("clientes")
    .select("id, nombre, perro, direccion, dias_habituales, hora_habitual")
    .eq("paseador_nombre", usuario.nombre);
  if (errClientes) {
    res.status(500).json({ error: "No se pudo leer la lista de clientes" });
    return;
  }

  const eventos = (clientes || [])
    .filter((c) => (c.dias_habituales || []).length > 0)
    .map((c) => ({
      uid: `paseo-cliente-${c.id}@howria.app`,
      titulo: `🐾 Paseo — ${c.perro} (${c.nombre})`,
      descripcion: `Paseo de ${c.perro} para ${c.nombre}. Generado desde Howria.`,
      ubicacion: c.direccion || "",
      diasSemana: c.dias_habituales,
      horaHabitual: c.hora_habitual,
      duracionMin: 45,
    }));

  const ics = construirICS(eventos, `Mis paseos — ${usuario.nombre}`);
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(ics);
}
