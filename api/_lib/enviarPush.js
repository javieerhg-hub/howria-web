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

// Envía a cada suscripción y limpia las que ya no existan del lado del
// navegador (desinstaló, borró datos, etc.) — 404/410 de la API de push.
// Compartido por las dos funciones de abajo para no duplicar este bloque.
async function enviarYLimpiarVencidas(admin, destinatarios, payload) {
  await Promise.all(
    destinatarios.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        }
      }
    })
  );
}

// admin: cliente de Supabase con la service role key (bypassa RLS, hace
// falta para leer las suscripciones de todo el staff, no solo las propias).
// evento: "cita" | "correo" — filtra según qué roles lo tienen activado en
// notificaciones_roles (pestaña Usuarios del panel). No lanza si falla — un
// aviso push que no llega no debe romper la operación principal (guardar
// la cita/correo ya quedó hecho antes).
// tag (opcional): mismo campo que Notification.tag del lado del navegador
// — permite que el propio cliente encuentre y cierre esta notificación más
// tarde con registration.getNotifications({tag}) (ver cerrarNotificacionRuta
// en src/lib/pushNotificaciones.js), en vez de esperar a que el usuario la
// descarte a mano.
export async function enviarNotificacionPush(admin, { titulo, cuerpo, url, evento, tag }) {
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

  await enviarYLimpiarVencidas(admin, destinatarios, JSON.stringify({ titulo, cuerpo, url, tag }));
}

// Igual que enviarNotificacionPush, pero para destinatarios que no son del
// staff (un tutor no está en la tabla "usuarios" ni en notificaciones_roles)
// — manda directo a la lista de correos que le pases.
// Devuelve la cantidad de suscripciones a las que efectivamente se mandó —
// api/enviar-notificacion-manual.js lo usa para avisarle a quien lo mandó
// si la persona ni siquiera tiene notificaciones activadas en su teléfono.
export async function enviarNotificacionPushAEmails(admin, emails, { titulo, cuerpo, url, tag }) {
  if (!asegurarVapid()) return 0;

  const unicos = [...new Set((emails || []).filter(Boolean))];
  if (unicos.length === 0) return 0;

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, usuario_email")
    .in("usuario_email", unicos);
  if (error || !subs || subs.length === 0) return 0;

  await enviarYLimpiarVencidas(admin, subs, JSON.stringify({ titulo, cuerpo, url, tag }));
  return subs.length;
}
