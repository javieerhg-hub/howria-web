import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";

// Carga perezosa por ruta: cada visitante solo baja el JS de la página que
// realmente ve — antes las tres rutas (landing pública, /agendaadiestrador
// o /agendar, /admin) venían en un mismo bundle, así que la landing y la
// reserva pública arrastraban también todo el código del panel interno
// sin usarlo. /agendar se deja funcionando para links ya compartidos con
// ese nombre — /agendaadiestrador es el que se comparte de ahora en más.
const HowriaAdminBundle = React.lazy(() =>
  import("./HowriaAdmin.jsx").then((m) => ({
    default: () => (<><m.default /><m.ToastHost /><m.AvisoNuevaVersion /><m.PullToRefresh /></>),
  }))
);
const Home = React.lazy(() => import("./Home.jsx"));
const AgendarPublico = React.lazy(() => import("./AgendarPublico.jsx"));
// Embudo de ventas para tutores de cachorros — se comparte por
// Instagram/WhatsApp y termina en un único botón que abre WhatsApp.
const Cachorros = React.lazy(() => import("./Cachorros.jsx"));

const pathname = window.location.pathname;
const esAdmin = pathname.startsWith("/admin");
const esAgendar = pathname.startsWith("/agendar") || pathname.startsWith("/agendaadiestrador");
const esCachorros = pathname.startsWith("/cachorros");

// Registra el service worker apenas se carga el panel (no pide ningún
// permiso — eso sigue pasando solo cuando alguien activa notificaciones
// push desde el botón). Es lo que le falta a la app instalable además del
// manifest.json: los navegadores solo ofrecen "agregar a pantalla de
// inicio" si ya hay un service worker activo, y antes solo se registraba
// al tocar la campana. Solo en /admin — la landing pública y la reserva no
// necesitan quedar "instalables".
if (esAdmin && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

function Cargando() {
  return (
    <div style={{ minHeight: "100vh", background: "#122A40", display: "flex", alignItems: "center", justifyContent: "center", color: "#9BAAB8", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 14 }}>
      Cargando...
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Suspense fallback={<Cargando />}>
      {esAdmin ? <HowriaAdminBundle /> : esAgendar ? <AgendarPublico /> : esCachorros ? <Cachorros /> : <Home />}
    </Suspense>
  </React.StrictMode>
);
