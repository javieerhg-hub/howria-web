// Helper compartido por las funciones serverless que necesitan avisarle al
// staff por notificación push (nueva solicitud de cita, correo entrante).
// Prefijo "_" en el nombre de la carpeta: Vercel no la trata como ruta de
// API, solo como código importable por otras funciones.
import webpush from "web-push";

let vapidConfigurado = false;

function asegurarVapid() {
  if (vapidConfigurado) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails("mailto:contacto@howria.cl", publicKey, privateKey);
  vapidConfigurado = true;
  return true;
}

// admin: cliente de Supabase con la service role key (bypassa RLS, hace
// falta para leer las suscripciones de todo el staff, no solo las propias).
// evento: "cita" | "correo" — filtra según qué roles lo tienen activado en
// notificaciones_roles (pestaña Usuarios del panel). No lanza si falla — un
// aviso push que no llega no debe romper la operación principal (guardar
// la cita/correo ya quedó hecho antes).
export async function enviarNotificacionPush(admin, { titulo, cuerpo, url, evento }) {
  if (!asegurarVapid()) return;

  const [{ data: config }, { data: usuarios }, { data: subs, error }] = await Promise.all([
    admin.from("notificaciones_roles").select("rol, eventos"),
    admin.from("usuarios").select("email, rol"),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, usuario_email"),
  ]);
  if (error || !subs || subs.length === 0) return;

  const rolesQueReciben = new Set((config || []).filter((c) => (c.eventos || []).includes(evento)).map((c) => c.rol));
  const rolPorEmail = new Map((usuarios || []).map((u) => [u.email, u.rol]));
  const destinatarios = subs.filter((s) => rolesQueReciben.has(rolPorEmail.get(s.usuario_email)));
  if (destinatarios.length === 0) return;

  const payload = JSON.stringify({ titulo, cuerpo, url });

  await Promise.all(
    destinatarios.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        // 404/410: la suscripción ya no existe del lado del navegador
        // (desinstaló, borró datos, etc.) — se limpia para no seguir
        // reintentando en cada evento futuro.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
}
