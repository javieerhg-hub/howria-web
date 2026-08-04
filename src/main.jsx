import React from "react";
import ReactDOM from "react-dom/client";
import HowriaAdmin, { ToastHost } from "./HowriaAdmin.jsx";
import Home from "./Home.jsx";
import AgendarPublico from "./AgendarPublico.jsx";

const pathname = window.location.pathname;
const esAdmin = pathname.startsWith("/admin");
const esAgendar = pathname.startsWith("/agendar");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esAdmin ? <><HowriaAdmin /><ToastHost /></> : esAgendar ? <AgendarPublico /> : <Home />}
  </React.StrictMode>
);
