import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";
import { aplicarSeo } from "./lib/seo.js";

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
// Páginas de servicio: existen para que alguien que busca "paseador de perros
// en Santiago" o "adiestramiento canino" en Google llegue a una página que
// habla de eso, y no a la portada genérica. Las dos salen del mismo archivo
// porque comparten estructura completa.
const Paseos = React.lazy(() => import("./PaginaServicio.jsx").then((m) => ({ default: m.Paseos })));
const Adiestramiento = React.lazy(() => import("./PaginaServicio.jsx").then((m) => ({ default: m.Adiestramiento })));
const AgendarPublico = React.lazy(() => import("./AgendarPublico.jsx"));
// Embudo de ventas para tutores de cachorros — se comparte por
// Instagram/WhatsApp y termina en un único botón que abre WhatsApp.
const Cachorros = React.lazy(() => import("./Cachorros.jsx"));
// Vuelta de la pasarela de pago: son páginas de cierre, no de trámite.
const ConfirmarCita = React.lazy(() => import("./ConfirmarCita.jsx"));
const PagoExitoso = React.lazy(() => import("./PagoResultado.jsx").then((m) => ({ default: m.PagoExitoso })));
const PagoFallido = React.lazy(() => import("./PagoResultado.jsx").then((m) => ({ default: m.PagoFallido })));

const pathname = window.location.pathname;
const esAdmin = pathname.startsWith("/admin");
const esAgendar = pathname.startsWith("/agendar") || pathname.startsWith("/agendaadiestrador");
const esCachorros = pathname.startsWith("/cachorros");
const esPaseos = pathname.startsWith("/paseos");
const esAdiestramiento = pathname.startsWith("/adiestramiento");
const esConfirmarCita = pathname.startsWith("/confirmar-cita");
const esPagoExitoso = pathname.startsWith("/pago-exitoso");
const esPagoFallido = pathname.startsWith("/pago-fallido");

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

// Los errores del panel se anotan en la base (ver lib/errores.js). Se
// instala acá y no dentro de la app para que un error durante la carga
// inicial —justo el que deja la pantalla en "Cargando..." para siempre—
// también quede registrado. Solo en /admin: las páginas públicas no tienen
// sesión y su insert quedaría rechazado por RLS.
if (esAdmin) {
  import("./lib/errores.js").then((m) => m.instalarCapturaDeErrores()).catch(() => {});
}

// Título, descripción y canonical de la ruta actual. Va acá y no en cada
// página porque index.html es el mismo para todas: sin esto, Google vería
// /paseos, /adiestramiento y /admin como copias de la portada. Se aplica antes
// de renderizar para que el título ya esté listo cuando el navegador pinta.
aplicarSeo(pathname);

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
      {esAdmin ? <HowriaAdminBundle />
        : esAgendar ? <AgendarPublico />
        : esCachorros ? <Cachorros />
        : esPaseos ? <Paseos />
        : esAdiestramiento ? <Adiestramiento />
        : esConfirmarCita ? <ConfirmarCita />
        : esPagoExitoso ? <PagoExitoso />
        : esPagoFallido ? <PagoFallido />
        : <Home />}
    </Suspense>
  </React.StrictMode>
);
