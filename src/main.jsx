import React from "react";
import ReactDOM from "react-dom/client";
import HowriaAdmin from "./HowriaAdmin.jsx";
import Home from "./Home.jsx";

const esAdmin = window.location.pathname.startsWith("/admin");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esAdmin ? <HowriaAdmin /> : <Home />}
  </React.StrictMode>
);
