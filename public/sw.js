// Service worker mínimo, solo para Web Push (no cachea nada ni hace la app
// instalable como PWA). Vive en /public para quedar servido en la raíz
// (/sw.js) — un service worker solo puede controlar el scope bajo el que
// se sirve.
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
      for (const cliente of lista) {
        if (cliente.url.includes(url) && "focus" in cliente) return cliente.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
