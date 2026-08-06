// Notificaciones push del navegador para el staff (panel /admin): avisan de
// nuevas solicitudes de cita y correos entrantes aunque el panel esté
// cerrado. Requiere permiso explícito del usuario (botón en el panel, ver
// BotonNotificacionesPush en HowriaAdmin.jsx) — nunca se pide sola al cargar.
import { supabase } from "./supabaseClient.js";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function soportaPush() {
  return "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;
}

// iOS/iPadOS expone las APIs de push en el navegador normal, pero Apple
// deniega el permiso en silencio (sin mostrar diálogo) a menos que el sitio
// esté agregado a la pantalla de inicio y corriendo como "app" standalone.
// Pedirlo igual arriesga dejar el permiso en "denied" de forma persistente,
// así que hay que detectarlo antes y explicarle al usuario qué hacer.
export function esIOSFueraDeApp() {
  const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const enModoApp = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return esIOS && !enModoApp;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Estado actual: si el navegador ya tiene una suscripción push activa y
// registrada en el service worker (independiente de si quedó guardada en
// Supabase — eso se resuelve solo la próxima vez que se llame a suscribir).
export async function suscripcionActiva() {
  if (!soportaPush()) return false;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return false;
  const sub = await registro.pushManager.getSubscription();
  return !!sub;
}

export async function suscribirNotificaciones(usuarioEmail) {
  if (!soportaPush()) throw new Error("Este navegador no soporta notificaciones push");

  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") throw new Error("Permiso de notificaciones denegado");

  const registro = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let sub = await registro.pushManager.getSubscription();
  if (!sub) {
    sub = await registro.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      usuario_email: usuarioEmail,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: "endpoint" }
  );
  if (error) throw error;
}

export async function desuscribirNotificaciones() {
  if (!("serviceWorker" in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration();
  if (!registro) return;
  const sub = await registro.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}
