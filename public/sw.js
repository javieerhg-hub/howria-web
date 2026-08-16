// Service worker: Web Push + lo mínimo para que la app sea instalable
// (manifest.json + un service worker con handler de "fetch" registrado,
// aunque no haga nada — así lo exigen los navegadores para el botón de
// instalar). Sigue sin cachear nada a propósito: la app depende de datos
// siempre frescos de Supabase, cachear respuestas viejas rompería el panel
// en vez de ayudar. Vive en /public para quedar servido en la raíz
// (/sw.js) — un service worker solo puede controlar el scope bajo el que
// se sirve.
self.addEventListener("fetch", () => {
  // Sin respondWith(): cada pedido sigue yendo directo a la red, como si
  // el service worker no existiera. Ver comentario de arriba.
});

self.addEventListener("push", (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = { titulo: "Howria", cuerpo: event.data ? event.data.text() : "" };
  }

  const titulo = datos.titulo || "Howria";
  const opciones = {
    body: datos.cuerpo || "",
    icon: "/logo-howria.png",
    badge: "/logo-howria.png",
    data: { url: datos.url || "/admin" },
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/admin";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      // Coincide con cualquier ventana ya abierta en /admin (sin importar
      // la pestaña en la que esté, ej. "?tab=agenda") — si existe, la
      // navega al destino exacto de la notificación en vez de solo
      // enfocarla, para que sí termine en la pestaña que corresponde.
      const abierta = lista.find((cliente) => cliente.url.includes("/admin"));
      if (abierta) {
        if ("navigate" in abierta) {
          return abierta.navigate(url).then((c) => c.focus()).catch(() => abierta.focus());
        }
        return abierta.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
