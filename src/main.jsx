import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import HowriaAdmin from "./HowriaAdmin.jsx";

const esAdmin = window.location.pathname.startsWith("/admin");

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {esAdmin ? <HowriaAdmin /> : <App />}
  </React.StrictMode>
);
