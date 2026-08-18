// Pestaña Mapa de rutas — armador de manadas por paseador y cálculo de
// ruta. Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useRef, useEffect } from "react";
import { GripVertical } from "lucide-react";
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NAVY, CREAM_SOFT, GOLD, RUST, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, fmtCLP, showToast,
} from "../HowriaAdmin.jsx";
import { distanciaKm, ordenarRutaCercanoMasProximo } from "./_compartido.jsx";

const SANTIAGO_CENTRO = { lat: -33.4489, lng: -70.6693 };

// Sin la comuna real, Nominatim buscaba solo "..., Santiago, Chile" —
// una misma calle puede existir en varias comunas y tomaba el primer
// resultado sin desambiguar, dejando pines mal ubicados. Con la comuna
// de la ficha del cliente la búsqueda queda acotada de verdad.
async function geocodificarDireccion(direccion, comuna) {
  const q = encodeURIComponent(`${direccion}, ${comuna || "Santiago"}, Chile`);
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
  const datos = await resp.json();
  if (!datos?.length) return null;
  return { lat: Number(datos[0].lat), lng: Number(datos[0].lon) };
}

// Tarjeta arrastrable de un cliente en el armador de manada. El clic normal
// sigue funcionando igual que antes (togglea incluido) — dnd-kit solo activa
// el arrastre si el puntero se mueve lo suficiente (mouse) o se mantiene
// apretado un instante (táctil), así que un tap corto no se confunde con un
// intento de arrastre y el click nativo se sigue disparando solo.

function TarjetaClienteArrastrable({ cliente: c, enConflicto, onToggle, onUbicar, geocodificando }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onToggle(c.id)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        padding: "10px 12px", background: "#FFFFFF",
        border: enConflicto ? `1.5px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8,
        opacity: isDragging ? 0.4 : 1, touchAction: "none", cursor: "grab",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <GripVertical size={15} color="#C4BCA0" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ color: NAVY }}>{c.nombre}</b> · 🐾 {c.perro} · {c.direccion || "sin dirección"}
        </span>
      </div>
      {c.lat && c.lng ? (
        <span style={{ fontSize: 11.5, color: "#2F6A46", fontWeight: 600, flexShrink: 0 }}>✓ ubicado</span>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onUbicar(c); }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={!c.direccion || geocodificando === c.id}
          style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, flexShrink: 0 }}
        >
          {geocodificando === c.id ? "Buscando..." : "Ubicar"}
        </button>
      )}
    </div>
  );
}

// Columna de destino ("Disponibles" / "En la ruta de hoy") del armador de
// manada — soltar una tarjeta acá adentro dispara onDragEnd en MapaRutas.
function ColumnaManada({ id, titulo, clientes, vacio, idsClientesEnConflicto, onToggle, onUbicar, geocodificando }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div>
      <p style={{ ...label, marginBottom: 8 }}>{titulo} ({clientes.length})</p>
      <div
        ref={setNodeRef}
        style={{
          display: "flex", flexDirection: "column", gap: 8, minHeight: 60, borderRadius: 10,
          padding: 8, background: isOver ? "#F3E3B4" : "transparent",
          border: isOver ? `1.5px dashed ${GOLD}` : "1.5px dashed transparent",
        }}
      >
        {clientes.length === 0 && <p style={{ ...hint, margin: "8px 4px" }}>{vacio}</p>}
        {clientes.map((c) => (
          <TarjetaClienteArrastrable
            key={c.id} cliente={c} enConflicto={idsClientesEnConflicto.has(c.id)}
            onToggle={onToggle} onUbicar={onUbicar} geocodificando={geocodificando}
          />
        ))}
      </div>
    </div>
  );
}

export function MapaRutas({ clientes, setClientes, usuarios, paseadorId: paseadorIdProp, setPaseadorId, mascotas = [], mascotaIncompatibilidades = [],
  incluidos, setIncluidos, ruta, setRuta, velocidad, setVelocidad, duracionParada, setDuracionParada }) {
  const paseadores = usuarios;
  const paseadorId = paseadorIdProp || paseadores[0]?.nombre || "";
  const [geocodificando, setGeocodificando] = useState(null);
  const [errorGeo, setErrorGeo] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const mapaDivRef = useRef(null);
  const mapaRef = useRef(null);
  const marcadoresRef = useRef(null);

  const clientesDelPaseador = clientes.filter((c) => c.paseadorNombre === paseadorId);

  // Solo aviso, no bloquea "Calcular ruta" — el coordinador decide si
  // sigue igual (ver audit, hallazgo "compatibilidad y capacidad").
  const mascotasIncluidas = clientesDelPaseador
    .filter((c) => incluidos[c.id])
    .flatMap((c) => mascotas.filter((m) => m.clienteId === c._dbId));
  const capacidadMaxima = usuarios.find((u) => u.nombre === paseadorId)?.capacidadMaxima;
  const conflictosCompatibilidad = [];
  for (let i = 0; i < mascotasIncluidas.length; i++) {
    for (let j = i + 1; j < mascotasIncluidas.length; j++) {
      const a = mascotasIncluidas[i], b = mascotasIncluidas[j];
      const incompatibles = mascotaIncompatibilidades.some((inc) =>
        (inc.mascotaId1 === a._dbId && inc.mascotaId2 === b._dbId) || (inc.mascotaId1 === b._dbId && inc.mascotaId2 === a._dbId));
      if (incompatibles) conflictosCompatibilidad.push([a, b]);
    }
  }
  const idsMascotasEnConflicto = new Set(conflictosCompatibilidad.flatMap(([a, b]) => [a._dbId, b._dbId]));
  const idsClientesEnConflicto = new Set(
    clientesDelPaseador.filter((c) => mascotas.some((m) => m.clienteId === c._dbId && idsMascotasEnConflicto.has(m._dbId))).map((c) => c.id)
  );

  function toggleIncluido(id) {
    setIncluidos((prev) => ({ ...prev, [id]: !prev[id] }));
    setRuta(null);
  }

  // Umbrales de activación distintos por tipo de puntero (patrón recomendado
  // por dnd-kit): con mouse hay que moverse un poco antes de que cuente como
  // arrastre; en táctil hay que mantener apretado un instante, así un swipe
  // para scrollear la lista no dispara un arrastre por accidente.
  const sensoresManada = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function onDragEndManada(event) {
    const { active, over } = event;
    if (!over) return;
    const yaIncluido = !!incluidos[active.id];
    const destinoIncluye = over.id === "en-ruta";
    if (yaIncluido !== destinoIncluye) toggleIncluido(active.id);
  }

  async function ubicarCliente(cliente) {
    if (!cliente.direccion) return;
    setGeocodificando(cliente.id);
    setErrorGeo("");
    try {
      const coords = await geocodificarDireccion(cliente.direccion, cliente.comuna);
      if (!coords) {
        setErrorGeo(`No se encontró la dirección de ${cliente.nombre}. Revísala e intenta de nuevo.`);
      } else {
        setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, lat: coords.lat, lng: coords.lng } : c)));
      }
    } catch {
      setErrorGeo("No se pudo conectar con el servicio de mapas — revisa tu conexión a internet.");
    } finally {
      setGeocodificando(null);
    }
  }

  function calcularRuta() {
    const incluidosLista = clientesDelPaseador.filter((c) => incluidos[c.id]);
    const seleccionados = incluidosLista.filter((c) => c.lat && c.lng);
    if (seleccionados.length < 2) {
      setRuta(null);
      // Antes esto fallaba en silencio — sin mensaje, no pasaba nada al
      // tocar el botón, sin explicar por qué.
      if (incluidosLista.length < 2) {
        setErrorGeo(`Agrega al menos 2 clientes a "En la ruta de hoy" para calcular — hay ${incluidosLista.length}.`);
      } else {
        const sinUbicar = incluidosLista.length - seleccionados.length;
        setErrorGeo(`${sinUbicar} cliente(s) en la ruta todavía no están ubicados en el mapa — usa "Ubicar" en su tarjeta antes de calcular.`);
      }
      return;
    }
    setErrorGeo("");
    const orden = ordenarRutaCercanoMasProximo(seleccionados);
    let distanciaTotal = 0;
    for (let i = 0; i < orden.length - 1; i++) distanciaTotal += distanciaKm(orden[i], orden[i + 1]);
    const minutosViaje = (distanciaTotal / velocidad) * 60;
    const minutosParadas = orden.length * duracionParada;
    const dinero = orden.reduce((acc, c) => acc + Number(c.valorPaseoRef || 0), 0);
    setRuta({ orden, distanciaTotal, minutosViaje, minutosParadas, dinero });
  }

  // Antes la única forma de pasarle la ruta al paseador era leerla en
  // pantalla — esto arma un texto plano listo para copiar y enviar por
  // WhatsApp/lo que sea.
  function compartirRuta() {
    if (!ruta) return;
    const texto =
      `Ruta de ${paseadorId} — ${new Date().toLocaleDateString("es-CL")}\n\n` +
      ruta.orden.map((c, i) => `${i + 1}. ${c.nombre} · ${c.direccion}`).join("\n") +
      `\n\nDistancia: ${ruta.distanciaTotal.toFixed(1)} km · Tiempo: ${Math.round(ruta.minutosViaje + ruta.minutosParadas)} min · Genera: ${fmtCLP(ruta.dinero)}`;
    navigator.clipboard.writeText(texto).then(() => showToast("Ruta copiada — pégala donde quieras enviarla."));
  }

  const clientesConMapa = clientes.filter((c) => c.lat && c.lng);
  const clientesFiltrados = busquedaCliente.trim()
    ? clientesDelPaseador.filter((c) => c.nombre.toLowerCase().includes(busquedaCliente.trim().toLowerCase()))
    : clientesDelPaseador;

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!mapaDivRef.current || mapaRef.current) return;
    const mapa = L.map(mapaDivRef.current).setView([SANTIAGO_CENTRO.lat, SANTIAGO_CENTRO.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© colaboradores de OpenStreetMap",
      maxZoom: 19,
    }).addTo(mapa);
    marcadoresRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; };
  }, []);

  // Redibuja los puntos (y ajusta el encuadre) cuando cambian los clientes
  // ubicados o cuáles están incluidos en la ruta del paseador elegido.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !marcadoresRef.current) return;
    marcadoresRef.current.clearLayers();
    clientesConMapa.forEach((c) => {
      const enRuta = c.paseadorNombre === paseadorId && incluidos[c.id];
      // Marker (no circleMarker) porque necesita soportar arrastre — un
      // circleMarker es un layer vectorial y Leaflet no lo deja mover a
      // mano. El ícono redondo replica el look anterior con un divIcon.
      const icono = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50%;background:${enRuta ? GOLD : NAVY};border:2px solid #FFFFFF;box-shadow:0 1px 3px rgba(0,0,0,0.4);cursor:grab;"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      });
      const marker = L.marker([c.lat, c.lng], { icon: icono, draggable: true })
        .bindTooltip(`${c.nombre} · ${c.perro} — arrastrá el pin si quedó mal ubicado`)
        .addTo(marcadoresRef.current);
      marker.on("dragend", () => {
        const { lat, lng } = marker.getLatLng();
        setClientes((prev) => prev.map((x) => (x.id === c.id ? { ...x, lat, lng } : x)));
        showToast(`Ubicación de ${c.nombre} corregida a mano.`, "exito");
      });
    });
    if (clientesConMapa.length > 0) {
      mapa.invalidateSize();
      mapa.fitBounds(L.latLngBounds(clientesConMapa.map((c) => [c.lat, c.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [clientesConMapa, paseadorId, incluidos]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card howria-mapa-controles" style={tarjeta}>
        <h2 style={sectionTitle}>Mapa de rutas — Santiago</h2>
        <p style={hint}>Elige un paseador, agrega o quita clientes de su ruta, ubícalos en el mapa y calcula cuánto tiempo y dinero genera la ruta.</p>

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, margin: "16px 0" }}>
          <div>
            <label style={label} htmlFor="mapa-paseador">Paseador</label>
            <select id="mapa-paseador" value={paseadorId} onChange={(e) => { setPaseadorId(e.target.value); setIncluidos({}); setRuta(null); }} style={{ ...input, marginBottom: 0 }}>
              {paseadores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="mapa-velocidad">Velocidad promedio (km/h)</label>
            <input id="mapa-velocidad" type="number" value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value) || 1)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label} htmlFor="mapa-minutos">Minutos por paseo</label>
            <input id="mapa-minutos" type="number" value={duracionParada} onChange={(e) => setDuracionParada(Number(e.target.value) || 0)} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <p style={{ ...label, margin: 0 }}>Clientes de {paseadorId || "este paseador"}</p>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: capacidadMaxima && mascotasIncluidas.length > capacidadMaxima ? RUST : "#8A7E5C" }}>
            {capacidadMaxima ? `${mascotasIncluidas.length}/${capacidadMaxima} perros en esta manada` : `${mascotasIncluidas.length} perro(s) — sin límite configurado`}
          </span>
        </div>
        {capacidadMaxima && mascotasIncluidas.length > capacidadMaxima && (
          <p style={{ fontSize: 12.5, color: RUST, margin: "6px 0 0" }}>⚠️ Esta manada se pasa de la capacidad de {paseadorId} ({capacidadMaxima} perros).</p>
        )}
        {conflictosCompatibilidad.length > 0 && (
          <div style={{ background: "#F1DCD2", border: "1px solid #E7C0AE", borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
            {conflictosCompatibilidad.map(([a, b], i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "4px 0 0", fontSize: 12.5, color: RUST }}>⚠️ {a.nombre} y {b.nombre} no se llevan bien.</p>
            ))}
          </div>
        )}
        {clientesDelPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Este paseador no tiene clientes asignados (asigna un paseador desde la ficha del cliente, en la pestaña Clientes).</p>
        ) : (
          <>
            <input
              type="text" value={busquedaCliente} onChange={(e) => setBusquedaCliente(e.target.value)}
              placeholder="Buscar cliente por nombre..."
              style={{ ...input, marginTop: 8, marginBottom: 4 }}
            />
            <p style={{ ...hint, marginTop: 0, marginBottom: 8 }}>Toca una tarjeta para moverla de columna — o arrástrala si prefieres.</p>
            <DndContext sensors={sensoresManada} onDragEnd={onDragEndManada}>
              <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <ColumnaManada
                  id="disponibles" titulo="Disponibles"
                  clientes={clientesFiltrados.filter((c) => !incluidos[c.id])}
                  vacio={busquedaCliente.trim() ? "Ningún cliente sin incluir coincide con la búsqueda." : "No quedan clientes sin incluir."}
                  idsClientesEnConflicto={idsClientesEnConflicto} onToggle={toggleIncluido}
                  onUbicar={ubicarCliente} geocodificando={geocodificando}
                />
                <ColumnaManada
                  id="en-ruta" titulo="En la ruta de hoy"
                  clientes={clientesFiltrados.filter((c) => incluidos[c.id])}
                  vacio={busquedaCliente.trim() ? "Ningún cliente en la ruta coincide con la búsqueda." : "Arrastra o toca un cliente de la izquierda para agregarlo."}
                  idsClientesEnConflicto={idsClientesEnConflicto} onToggle={toggleIncluido}
                  onUbicar={ubicarCliente} geocodificando={geocodificando}
                />
              </div>
            </DndContext>
          </>
        )}
        {errorGeo && <p style={{ color: RUST, fontSize: 12.5, marginBottom: 12 }}>{errorGeo}</p>}

        <button onClick={calcularRuta} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px" }}>Calcular ruta</button>

        {ruta && (
          <div style={{ marginTop: 20, padding: 18, background: CREAM_SOFT, borderRadius: 8 }}>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Distancia total</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{ruta.distanciaTotal.toFixed(1)} km</p>
              </div>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Tiempo estimado</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{Math.round(ruta.minutosViaje + ruta.minutosParadas)} min</p>
              </div>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Dinero que genera la ruta</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{fmtCLP(ruta.dinero)}</p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}>
              <p style={{ ...label, margin: 0 }}>Orden sugerido de la ruta</p>
              <button onClick={compartirRuta} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Compartir ruta</button>
            </div>
            {ruta.orden.map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < ruta.orden.length - 1 ? "1px solid #E4DBC3" : "none", fontSize: 13.5 }}>
                <span>{i + 1}. {c.nombre} · {c.direccion}</span>
                <span style={{ color: "#8A7E5C" }}>{fmtCLP(c.valorPaseoRef)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="howria-card howria-mapa-visual" style={tarjeta}>
        <p style={label}>Mapa</p>
        <div ref={mapaDivRef} style={{ width: "100%", height: 420, borderRadius: 8, border: "1px solid #E4DBC3", background: "#EDE4CE" }} />
        {clientesConMapa.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no hay ningún cliente ubicado — usa "Ubicar en el mapa" arriba.</p>
        ) : (
          <p style={{ ...hint, marginTop: 8 }}>¿Un pin quedó mal ubicado? Arrastralo a la posición correcta — se guarda solo.</p>
        )}
        <p style={{ fontSize: 11, color: "#9A9179", marginTop: 8 }}>El punto dorado marca los clientes incluidos en la ruta calculada; el azul marino, los demás clientes ya ubicados. Se puede hacer zoom y arrastrar (mouse o dedo).</p>
      </div>
    </div>
  );
}
