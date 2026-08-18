// Función serverless de Vercel: el paseador la llama (sin esperar la
// respuesta, ver actualizarFaseDia en HowriaAdmin.jsx) apenas pasa su fase
// del día a "En Recolección" — les avisa por push a los tutores de sus
// clientes de hoy que la ronda empezó, y de paso se autoenvía un push a sí
// mismo con un link directo al panel de ruta (única forma real de un
// "botón de completar" en la notificación: iOS/Safari no soporta acciones
// interactivas dentro de un push, así que en vez de eso la notificación
// abre la app ya parada en la ruta, lista para deslizar). No hay rastreo
// de ubicación de ningún tipo (la geolocalización en segundo plano no
// funciona en un navegador — ver database/049_fase_dia_paseador.sql y la
// memoria del proyecto para el porqué se descartó "notificaciones de
// proximidad" GPS reales); esto es un aviso único al arrancar la ronda,
// no una cuenta regresiva por casa.
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

  const { paseadorNombre } = req.body || {};
  if (!paseadorNombre) {
    res.status(400).json({ error: "Falta el nombre del paseador" });
    return;
  }

  // Un paseador solo puede avisar el inicio de su propia ronda, no la de
  // otro — coincide con cómo se llama hoy (actualizarFaseDia(user.nombre, ...)).
  const { data: perfil } = await admin.from("usuarios").select("nombre").eq("email", userData.user.email).maybeSingle();
  if (!perfil || perfil.nombre !== paseadorNombre) {
    res.status(403).json({ error: "Solo el paseador dueño de la ronda puede avisar su inicio" });
    return;
  }

  const ahora = new Date();
  const hoyStr = ahora.toISOString().slice(0, 10); // mismo criterio que fechaKey() en el frontend
  // getUTCDay() en vez de getDay(): el servidor no conoce la hora local de
  // Chile. Cerca de la medianoche (UTC-3/-4) esto podría desfasarse un día,
  // pero "En Recolección" se activa de mañana, no de noche — no vale la
  // pena la complejidad de resolver la zona horaria real para ese margen.
  const dow = (ahora.getUTCDay() + 6) % 7; // lunes = 0

  const { data: clientes, error: errClientes } = await admin
    .from("clientes")
    .select("id, email, dias_habituales, estado_cliente")
    .eq("paseador_nombre", paseadorNombre);
  if (errClientes) {
    res.status(500).json({ error: "No se pudo leer la lista de clientes" });
    return;
  }

  const clientesHoy = (clientes || []).filter(
    (c) => (c.dias_habituales || []).includes(dow) && (c.estado_cliente || "activo") === "activo" && c.email
  );
  if (clientesHoy.length === 0) {
    res.status(200).json({ ok: true, avisados: 0 });
    return;
  }

  const { data: registros, error: errRegistros } = await admin
    .from("registro_paseos")
    .select("cliente_id, estado")
    .eq("fecha", hoyStr)
    .in("cliente_id", clientesHoy.map((c) => c.id));
  if (errRegistros) {
    res.status(500).json({ error: "No se pudo leer el registro de hoy" });
    return;
  }

  const resueltos = new Set(
    (registros || []).filter((r) => r.estado === "realizado" || r.estado === "cancelado").map((r) => r.cliente_id)
  );
  const emails = clientesHoy.filter((c) => !resueltos.has(c.id)).map((c) => c.email);
  const pendientesHoy = clientesHoy.length - resueltos.size;

  await Promise.all([
    emails.length > 0
      ? enviarNotificacionPushAEmails(admin, emails, {
          titulo: "Tu paseador salió a hacer su ronda de hoy 🐾",
          cuerpo: `${paseadorNombre} ya salió — pronto pasará a buscar a tu perro.`,
          url: "/admin",
        })
      : Promise.resolve(),
    pendientesHoy > 0
      ? enviarNotificacionPushAEmails(admin, [userData.user.email], {
          titulo: "Tu ruta está lista 🐾",
          cuerpo: `${pendientesHoy} paseo${pendientesHoy === 1 ? "" : "s"} por hacer — toca para deslizar y completar cada uno.`,
          url: "/admin?tab=mis-paseos&ruta=1",
        })
      : Promise.resolve(),
  ]);

  res.status(200).json({ ok: true, avisados: emails.length });
}
