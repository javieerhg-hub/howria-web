// Ruta guiada paso a paso de Mis Paseos — su propio chunk, cargado con
// React.lazy() desde HowriaAdmin.jsx (ver import ahí). No vive en
// HowriaAdmin.jsx (Core, se carga siempre, para todo rol — no vale la
// pena meterle Leaflet si un coordinador nunca la abre) ni en
// HowriaAdminResto.jsx (ese lazy trae las 14 pestañas juntas — importar
// desde ahí arrastraría todo Resto solo para esta pantalla).
import { useState, useEffect, useRef, useMemo } from "react";
import { MessageCircle, CircleCheck } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, RUST,
  fmtCLP, fechaKey, showToast, botonPrincipal,
  PuntoClave, NIVELES_ENERGIA, TAGS_TEMPERAMENTO, estadoGlobalUI,
} from "./HowriaAdmin.jsx";

// Copia local — no se importa desde HowriaAdminResto.jsx (traería todo el
// chunk de Resto solo por esta constante). Mismo centro que usa Mapa.
const SANTIAGO_CENTRO = { lat: -33.4489, lng: -70.6693 };

export function RutaGuiada({ clientesHoy, mascotas, registroPaseos, setRegistroPaseos, user, faseHoy, actualizarFaseDia, metaMensual, totalMontoMes, onSalir }) {
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rutaEnCurso = faseHoy === "en_recoleccion" || faseHoy === "en_parque" || faseHoy === "en_retorno";

  // Al reanudar (por ejemplo tras un refresh a mitad de ruta), retoma en
  // el primer cliente sin resolver — no siempre en el primero de la lista.
  const [indice, setIndice] = useState(() => {
    const idx = clientesHoy.findIndex((c) => {
      const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`];
      return !r?.realizado && !r?.cancelado;
    });
    return idx === -1 ? clientesHoy.length : idx;
  });
  const [paso, setPaso] = useState(() => {
    if (faseHoy === "completado" || indice >= clientesHoy.length) return "fin";
    return rutaEnCurso ? "ficha" : "animacion";
  });
  // Puramente local, nunca se guarda — registro_paseos se queda con su
  // enum de siempre (realizado/cancelado/pendiente), esto es solo "qué
  // tarjeta le toca ver ahora al paseador".
  const [estadoFicha, setEstadoFicha] = useState("por-iniciar");

  useEffect(() => {
    estadoGlobalUI.rutaGuiadaAbierta = true;
    return () => { estadoGlobalUI.rutaGuiadaAbierta = false; };
  }, []);

  // Cubre el caso raro de reanudar con todo ya resuelto pero sin que la
  // fase haya llegado a "completado" todavía.
  useEffect(() => {
    if (paso === "ficha" && indice >= clientesHoy.length) {
      actualizarFaseDia(user.nombre, "completado");
      setPaso("fin");
    }
  }, [paso, indice]);

  function avanzarSiguiente() {
    setEstadoFicha("por-iniciar");
    setIndice((i) => i + 1);
  }

  function actualizarRegistro(clienteId, cambios) {
    const key = `${clienteId}_${fechaKey(hoy)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...prev[key], ...cambios } }));
  }

  function completarPaseoActual(cliente) {
    actualizarRegistro(cliente.id, { realizado: true, cancelado: false });
    avanzarSiguiente();
  }

  function cancelarClienteActual(cliente) {
    actualizarRegistro(cliente.id, { cancelado: true, realizado: false });
    avanzarSiguiente();
  }

  // WhatsApp no tiene forma de publicar automáticamente dentro de un grupo
  // ya existente (solo mensajes 1 a 1 vía su API oficial) — se copia el
  // texto al portapapeles para que el paseador lo pegue a mano en el
  // grupo del cliente. Mismo mensaje que ya recibe el tutor por push en
  // api/avisar-inicio-ronda.js.
  async function copiarAvisoWhatsapp(cliente) {
    const texto = `¡Hola! 🐾 ${user.nombre} ya salió a hacer su ronda de hoy — pronto pasará a buscar a ${cliente.perro}.`;
    try {
      await navigator.clipboard.writeText(texto);
      showToast(`Mensaje copiado — pégalo en el grupo de WhatsApp de ${cliente.nombre}.`, "info");
    } catch {
      showToast("No se pudo copiar el mensaje. Intenta de nuevo.");
    }
  }

  const clienteActual = clientesHoy[indice];
  const resueltos = clientesHoy.filter((c) => {
    const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`];
    return r?.realizado || r?.cancelado;
  }).length;

  const fondoOscuro = paso === "animacion" || paso === "fin";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10020,
      background: fondoOscuro ? NAVY : CREAM,
      display: "flex", flexDirection: "column", overflowY: "auto",
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <button onClick={onSalir}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 1, border: "none", borderRadius: 20,
          padding: "8px 14px", fontSize: 13, cursor: "pointer",
          background: fondoOscuro ? "rgba(255,255,255,0.12)" : "rgba(18,42,64,0.08)",
          color: fondoOscuro ? CREAM : NAVY,
        }}>
        ✕ Salir
      </button>

      {paso === "animacion" && <MapaAnimado clientes={clientesHoy} onListo={() => setPaso("listado")} />}
      {paso === "listado" && <PanelListado clientes={clientesHoy} onListo={() => setPaso("ficha")} />}
      {paso === "ficha" && clienteActual && (
        <FichaCliente
          cliente={clienteActual}
          mascota={mascotas.find((m) => m.clienteId === clienteActual._dbId)}
          estado={estadoFicha}
          indice={indice}
          total={clientesHoy.length}
          onIniciar={() => setEstadoFicha("en-curso")}
          onCompletar={() => completarPaseoActual(clienteActual)}
          onCancelar={() => cancelarClienteActual(clienteActual)}
          onWhatsapp={() => copiarAvisoWhatsapp(clienteActual)}
        />
      )}
      {paso === "fin" && (
        <PantallaFinal totalMontoMes={totalMontoMes} metaMensual={metaMensual} resueltos={resueltos} total={clientesHoy.length} onCerrar={onSalir} />
      )}
    </div>
  );
}

// Reutiliza el patrón Leaflet de MapaRutas (HowriaAdminResto.jsx) — mismo
// init/cleanup, mismo estilo de marcador. Los clientes sin geocodificar
// (nadie tocó "Ubicar en el mapa" antes) se saltan sin bloquear nada: no
// aparecen acá, pero sí en el listado y en su ficha igual.
function MapaAnimado({ clientes, onListo }) {
  const clientesConMapa = useMemo(() => clientes.filter((c) => c.lat && c.lng), [clientes]);
  const mapaDivRef = useRef(null);

  useEffect(() => {
    const reducido = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducido || clientesConMapa.length === 0 || !mapaDivRef.current) {
      const t = setTimeout(onListo, reducido || clientesConMapa.length === 0 ? 500 : 1800);
      return () => clearTimeout(t);
    }
    const mapa = L.map(mapaDivRef.current, { zoomControl: false, attributionControl: false }).setView([SANTIAGO_CENTRO.lat, SANTIAGO_CENTRO.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mapa);
    const marcadores = L.layerGroup().addTo(mapa);
    mapa.fitBounds(L.latLngBounds(clientesConMapa.map((c) => [c.lat, c.lng])), { padding: [40, 40], maxZoom: 15 });

    const timers = clientesConMapa.map((c, i) => setTimeout(() => {
      L.circleMarker([c.lat, c.lng], { radius: 9, weight: 2, color: "#FFFFFF", fillColor: GOLD, fillOpacity: 1 })
        .bindTooltip(`${c.nombre} · ${c.perro}`)
        .addTo(marcadores);
    }, i * 220));
    const tFinal = setTimeout(onListo, clientesConMapa.length * 220 + 900);

    return () => { timers.forEach(clearTimeout); clearTimeout(tFinal); mapa.remove(); };
  }, []);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <p style={{ color: CREAM, fontSize: 15, fontWeight: 600, marginBottom: 16, textAlign: "center" }}>Ubicando a tus clientes de hoy…</p>
      {clientesConMapa.length > 0 && (
        <div ref={mapaDivRef} style={{ width: "100%", maxWidth: 480, height: 320, borderRadius: 12, overflow: "hidden", border: "2px solid rgba(255,255,255,0.15)" }} />
      )}
    </div>
  );
}

function PanelListado({ clientes, onListo }) {
  useEffect(() => {
    const t = setTimeout(onListo, 2000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ flex: 1, padding: "28px 20px", overflowY: "auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 1 }}>Tu ruta de hoy</p>
      <h2 style={{ margin: "0 0 18px", fontSize: 20, color: NAVY, fontFamily: "Georgia, serif" }}>
        {clientes.length} cliente{clientes.length === 1 ? "" : "s"} por visitar
      </h2>
      <div style={{ display: "grid", gap: 10 }}>
        {clientes.map((c) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY }}>{c.nombre}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>🐾 {c.perro}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FichaCliente({ cliente, mascota, estado, indice, total, onIniciar, onCompletar, onCancelar, onWhatsapp }) {
  const energia = mascota?.nivelEnergia ? NIVELES_ENERGIA.find((n) => n.id === mascota.nivelEnergia)?.nombre : null;
  const temperamento = mascota?.temperamento?.length
    ? mascota.temperamento.map((t) => TAGS_TEMPERAMENTO.find((x) => x.id === t)?.nombre || t).join(", ")
    : null;
  const energiaTexto = [energia, temperamento].filter(Boolean).join(" · ") || "Sin datos registrados";
  const enCurso = estado === "en-curso";

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "24px 20px", overflowY: "auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 12.5, color: "#8A7E5C", fontWeight: 600 }}>Cliente {indice + 1} de {total}</p>
      <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 18px" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
        <div style={{ minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 19, color: NAVY, fontFamily: "Georgia, serif" }}>{cliente.nombre}</h2>
          <p style={{ margin: "2px 0 0", fontSize: 13, color: "#8A7E5C" }}>🐾 {cliente.perro}</p>
        </div>
      </div>

      <div style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 12, padding: 14, marginBottom: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <PuntoClave label="Dirección" valor={cliente.direccion || "Sin dirección"} />
          <PuntoClave label="Notas del perro" valor={mascota?.notas || "Sin notas"} />
          <PuntoClave label="Teléfono" valor={cliente.telefono || "Sin teléfono"} />
          <PuntoClave label="Energía / temperamento" valor={energiaTexto} />
        </div>
      </div>

      <div style={{ marginTop: "auto", display: "grid", gap: 10 }}>
        {!enCurso ? (
          <button onClick={onIniciar} style={{ ...botonPrincipal, padding: "16px", fontSize: 15.5 }}>Iniciar paseo</button>
        ) : (
          <button onClick={onCompletar}
            style={{ width: "100%", padding: "16px", borderRadius: 10, border: "none", cursor: "pointer", background: "#2F6A46", color: "#FFFFFF", fontSize: 15.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <CircleCheck size={19} /> Paseo completado
          </button>
        )}
        {enCurso && (
          <button onClick={onWhatsapp}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", padding: "12px", borderRadius: 8, border: "1px solid #DCD2B4", background: "#FFFFFF", color: NAVY, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <MessageCircle size={14} /> Copiar aviso de WhatsApp
          </button>
        )}
        <button onClick={onCancelar} style={{ background: "none", border: "none", color: RUST, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: "6px 0" }}>
          Este cliente no estaba
        </button>
      </div>
    </div>
  );
}

function PantallaFinal({ totalMontoMes, metaMensual, resueltos, total, onCerrar }) {
  const porcentaje = metaMensual ? Math.min(100, Math.round((totalMontoMes / metaMensual) * 100)) : null;
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
      <p style={{ fontSize: 40, margin: "0 0 10px" }}>🎉</p>
      <h2 style={{ margin: "0 0 8px", fontSize: 22, color: CREAM, fontFamily: "Georgia, serif" }}>¡Ruta completada!</h2>
      <p style={{ margin: "0 0 24px", fontSize: 14, color: "#9BAAB8", maxWidth: 320 }}>
        Gracias por tu trabajo hoy — atendiste {resueltos} de {total} clientes.
      </p>
      <div style={{ background: "rgba(255,255,255,0.07)", borderRadius: 14, padding: "20px 24px", marginBottom: 28, width: "100%", maxWidth: 320 }}>
        <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#9BAAB8", textTransform: "uppercase" }}>Llevas reunido este mes</p>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 700, color: GOLD, fontFamily: "Georgia, serif" }}>{fmtCLP(totalMontoMes)}</p>
        {metaMensual ? (
          <>
            <div style={{ background: "rgba(255,255,255,0.15)", borderRadius: 20, height: 8, marginTop: 14, overflow: "hidden" }}>
              <div style={{ width: `${porcentaje}%`, height: "100%", background: GOLD, borderRadius: 20 }} />
            </div>
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9BAAB8" }}>{porcentaje}% de tu meta de {fmtCLP(metaMensual)}</p>
          </>
        ) : (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#9BAAB8" }}>Todavía no tienes una meta mensual configurada.</p>
        )}
      </div>
      <button onClick={onCerrar}
        style={{ padding: "12px 28px", borderRadius: 8, border: "none", cursor: "pointer", background: GOLD, color: NAVY, fontSize: 14.5, fontWeight: 700 }}>
        Cerrar
      </button>
    </div>
  );
}
