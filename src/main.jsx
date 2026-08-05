import React, { Suspense } from "react";
import ReactDOM from "react-dom/client";

// Carga perezosa por ruta: cada visitante solo baja el JS de la página que
// realmente ve — antes las tres rutas (landing pública, /agendar, /admin)
// venían en un mismo bundle, así que la landing y la reserva pública
// arrastraban también todo el código del panel interno sin usarlo.
const HowriaAdminBundle = React.lazy(() =>
  import("./HowriaAdmin.jsx").then((m) => ({
    default: () => (<><m.default /><m.ToastHost /></>),
  }))
);
const Home = React.lazy(() => import("./Home.jsx"));
const AgendarPublico = React.lazy(() => import("./AgendarPublico.jsx"));

const pathname = window.location.pathname;
const esAdmin = pathname.startsWith("/admin");
const esAgendar = pathname.startsWith("/agendar");

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
      {esAdmin ? <HowriaAdminBundle /> : esAgendar ? <AgendarPublico /> : <Home />}
    </Suspense>
  </React.StrictMode>
);
