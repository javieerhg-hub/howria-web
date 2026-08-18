// Ruta guiada paso a paso de Mis Paseos — su propio chunk, cargado con
// React.lazy() desde HowriaAdmin.jsx (ver import ahí). No vive en
// HowriaAdmin.jsx (Core, se carga siempre, para todo rol — no vale la
// pena meterle Leaflet si un coordinador nunca la abre) ni en
// src/tabs/MapaRutas.jsx (ese lazy trae solo esa pestaña, pero seguiría
// siendo Leaflet + su código para una pantalla que un coordinador que
// nunca abre Mis Paseos tampoco necesita).
import { useState, useEffect, useRef, useMemo } from "react";
import { MessageCircle, CircleCheck, ChevronUp, ChevronDown } from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, RUST,
  fmtCLP, fechaKey, showToast,
  estadoGlobalUI,
} from "./HowriaAdmin.jsx";

// Copia local — no se importa desde src/tabs/MapaRutas.jsx (traería ese
// chunk entero solo por esta constante). Mismo centro que usa Mapa.
const SANTIAGO_CENTRO = { lat: -33.4489, lng: -70.6693 };

export function RutaGuiada({ clientesHoy, registroPaseos, setRegistroPaseos, user, faseHoy, actualizarFaseDia, metaMensual, totalMontoMes, onSalir }) {
  const hoy = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const rutaEnCurso = faseHoy === "en_recoleccion" || faseHoy === "en_parque" || faseHoy === "en_retorno";

  function estaPendiente(c) {
    const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`];
    return !r?.realizado && !r?.cancelado;
  }

  // Orden de la ruta — arranca como llegó (ya viene ordenado por hora
  // habitual desde Mis Paseos) pero es 100% local a este panel: si el
  // paseador lo reordena a mano (por ejemplo, un cliente puso mal la hora
  // o el tráfico cambió el orden real), ese cambio no toca la hora
  // habitual del cliente ni ningún otro dato — solo la secuencia de esta
  // ronda de hoy.
  const [orden, setOrden] = useState(clientesHoy);

  // Mueve dentro del grupo de PENDIENTES únicamente — si hubiera clientes
  // ya resueltos intercalados en `orden`, "subir" siempre debe cambiar con
  // el pendiente anterior, no con uno ya resuelto que ni se ve en pantalla.
  function moverCliente(id, delta) {
    setOrden((prev) => {
      const idsPendientes = prev.filter(estaPendiente).map((c) => c.id);
      const pos = idsPendientes.indexOf(id);
      const nuevaPos = pos + delta;
      if (pos === -1 || nuevaPos < 0 || nuevaPos >= idsPendientes.length) return prev;
      const idxA = prev.findIndex((c) => c.id === id);
      const idxB = prev.findIndex((c) => c.id === idsPendientes[nuevaPos]);
      const copia = [...prev];
      [copia[idxA], copia[idxB]] = [copia[idxB], copia[idxA]];
      return copia;
    });
  }

  const pendientes = orden.filter(estaPendiente);

  const [paso, setPaso] = useState(() => {
    if (faseHoy === "completado" || pendientes.length === 0) return "fin";
    return rutaEnCurso ? "ruta" : "animacion";
  });

  useEffect(() => {
    estadoGlobalUI.rutaGuiadaAbierta = true;
    return () => { estadoGlobalUI.rutaGuiadaAbierta = false; };
  }, []);

  // Cubre el caso de terminar el último paseo pendiente desde acá mismo —
  // no hace falta esperar a la próxima carga para pasar a la pantalla final.
  useEffect(() => {
    if (paso === "ruta" && pendientes.length === 0) {
      actualizarFaseDia(user.nombre, "completado");
      setPaso("fin");
    }
  }, [paso, pendientes.length]);

  function actualizarRegistro(clienteId, cambios) {
    const key = `${clienteId}_${fechaKey(hoy)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...prev[key], ...cambios } }));
  }

  function completarPaseo(cliente) {
    actualizarRegistro(cliente.id, { realizado: true, cancelado: false });
  }

  function cancelarPaseo(cliente) {
    actualizarRegistro(cliente.id, { cancelado: true, realizado: false });
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

  const resueltos = orden.length - pendientes.length;
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

      {paso === "animacion" && <MapaAnimado clientes={orden} onListo={() => setPaso("ruta")} />}
      {paso === "ruta" && (
        <PanelRuta
          pendientes={pendientes}
          onMover={moverCliente}
          onCompletar={completarPaseo}
          onCancelar={cancelarPaseo}
          onWhatsapp={copiarAvisoWhatsapp}
        />
      )}
      {paso === "fin" && (
        <PantallaFinal totalMontoMes={totalMontoMes} metaMensual={metaMensual} resueltos={resueltos} total={orden.length} onCerrar={onSalir} />
      )}
    </div>
  );
}

// Reutiliza el patrón Leaflet de MapaRutas (src/tabs/MapaRutas.jsx) — mismo
// init/cleanup, mismo estilo de marcador. Los clientes sin geocodificar
// (nadie tocó "Ubicar en el mapa" antes) se saltan sin bloquear nada: no
// aparecen acá, pero sí en la lista igual.
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

// Pantalla principal de la ruta: los próximos 4 pendientes (de los que
// falten), cada uno con su barra de deslizar propia — reemplaza a lo que
// antes eran dos pantallas separadas (lista de revisión + una tarjeta
// grande por cliente, una a la vez). Con 4 a la vista y flechas para
// reordenar, el paseador ve de un vistazo el orden real sin tener que
// avanzar cliente por cliente para descubrir qué viene después.
function PanelRuta({ pendientes, onMover, onCompletar, onCancelar, onWhatsapp }) {
  const visibles = pendientes.slice(0, 4);
  return (
    <div style={{ flex: 1, padding: "24px 20px", overflowY: "auto" }}>
      <p style={{ margin: "0 0 4px", fontSize: 13, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 1 }}>Tu ruta de hoy</p>
      <h2 style={{ margin: "0 0 6px", fontSize: 20, color: NAVY, fontFamily: "Georgia, serif" }}>
        {pendientes.length} paseo{pendientes.length === 1 ? "" : "s"} por hacer
      </h2>
      <p style={{ margin: "0 0 18px", fontSize: 12.5, color: "#8A7E5C" }}>Desliza cada barra al terminar. ¿El orden no calza con cómo vas a ir? Usa las flechas.</p>
      <div style={{ display: "grid", gap: 14 }}>
        {visibles.map((c, i) => (
          <FilaRuta key={c.id} cliente={c} numero={i + 1}
            puedeSubir={i > 0} puedeBajar={i < pendientes.length - 1}
            onSubir={() => onMover(c.id, -1)} onBajar={() => onMover(c.id, 1)}
            onCompletar={() => onCompletar(c)} onCancelar={() => onCancelar(c)}
            onWhatsapp={() => onWhatsapp(c)} />
        ))}
      </div>
      {pendientes.length > 4 && (
        <p style={{ margin: "16px 0 0", fontSize: 12, color: "#8A7E5C", textAlign: "center" }}>
          +{pendientes.length - 4} más después de estos
        </p>
      )}
    </div>
  );
}

function FilaRuta({ cliente, numero, puedeSubir, puedeBajar, onSubir, onBajar, onCompletar, onCancelar, onWhatsapp }) {
  return (
    <div style={{ padding: "12px 14px", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 12, color: "#8A7E5C", fontWeight: 700, width: 16, flex: "none", textAlign: "center" }}>{numero}</span>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cliente.nombre}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>🐾 {cliente.perro}{cliente.horaHabitual ? ` · ${cliente.horaHabitual}` : ""}</p>
        </div>
        <button onClick={onWhatsapp} type="button" title="Copiar aviso de WhatsApp"
          style={{ border: "none", background: "none", cursor: "pointer", color: NAVY, padding: 4, flex: "none" }}>
          <MessageCircle size={16} />
        </button>
        <div style={{ display: "flex", flexDirection: "column", flex: "none" }}>
          <button onClick={onSubir} disabled={!puedeSubir} type="button"
            style={{ border: "none", background: "none", cursor: puedeSubir ? "pointer" : "default", opacity: puedeSubir ? 1 : 0.25, color: NAVY, padding: 1 }}>
            <ChevronUp size={16} />
          </button>
          <button onClick={onBajar} disabled={!puedeBajar} type="button"
            style={{ border: "none", background: "none", cursor: puedeBajar ? "pointer" : "default", opacity: puedeBajar ? 1 : 0.25, color: NAVY, padding: 1 }}>
            <ChevronDown size={16} />
          </button>
        </div>
      </div>
      <DeslizarParaCompletar onCompletar={onCompletar} compacto />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <button onClick={onCompletar} type="button" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: "4px 0" }}>
          Marcar sin deslizar
        </button>
        <button onClick={onCancelar} type="button" style={{ background: "none", border: "none", color: RUST, fontSize: 11, cursor: "pointer", textDecoration: "underline", padding: "4px 0" }}>
          No estaba
        </button>
      </div>
    </div>
  );
}

// Barra "desliza para completar" — la forma principal de marcar un paseo
// hecho. Los dos links de texto en FilaRuta (marcar sin deslizar / no
// estaba) son el respaldo para quien el gesto no le resulte o el dedo no
// calibre bien en su pantalla.
function DeslizarParaCompletar({ onCompletar, compacto = false }) {
  const alto = compacto ? 40 : 54;
  const anchoThumb = compacto ? 36 : 52;
  const pistaRef = useRef(null);
  const [x, setX] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const anchoPistaRef = useRef(0);

  function iniciar(e) {
    if (!pistaRef.current) return;
    anchoPistaRef.current = pistaRef.current.offsetWidth;
    setArrastrando(true);
    pistaRef.current.setPointerCapture?.(e.pointerId);
  }
  function mover(e) {
    if (!arrastrando) return;
    const rect = pistaRef.current.getBoundingClientRect();
    const max = Math.max(0, anchoPistaRef.current - anchoThumb);
    const nuevoX = Math.min(Math.max(0, e.clientX - rect.left - anchoThumb / 2), max);
    setX(nuevoX);
  }
  function soltar() {
    if (!arrastrando) return;
    setArrastrando(false);
    const max = Math.max(0, anchoPistaRef.current - anchoThumb);
    const umbral = max * 0.85;
    if (x >= umbral) {
      setX(max);
      onCompletar();
    } else {
      setX(0);
    }
  }

  return (
    <div ref={pistaRef} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
      style={{ position: "relative", width: "100%", height: alto, borderRadius: alto / 2, background: "#D8ECDE", border: "1.5px solid #2F6A46", overflow: "hidden", touchAction: "none", userSelect: "none" }}>
      <p style={{ position: "absolute", inset: 0, margin: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#2F6A46", fontSize: compacto ? 12 : 13.5, fontWeight: 700, pointerEvents: "none" }}>
        Desliza para completar →
      </p>
      <div onPointerDown={iniciar}
        style={{
          position: "absolute", top: 1, left: 1, width: anchoThumb, height: alto - 2, borderRadius: "50%",
          background: "#2F6A46", display: "flex", alignItems: "center", justifyContent: "center",
          transform: `translateX(${x}px)`, transition: arrastrando ? "none" : "transform .25s ease",
          cursor: "grab", touchAction: "none",
        }}>
        <CircleCheck size={compacto ? 17 : 22} color="#FFFFFF" />
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
