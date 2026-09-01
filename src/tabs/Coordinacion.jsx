// Pestaña Coordinación — quién pasea a quién hoy, reparto semanal y
// reprogramar paseos puntuales. Ver src/HowriaAdmin.jsx (React.lazy) por
// la lista completa de pestañas y src/tabs/_compartido.jsx para lo compartido.
import { useState, useMemo, useEffect, useRef } from "react";
import { CalendarClock, CheckCircle2 } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, FASES_PASEADOR, tarjeta, sectionTitle, hint, label,
  input, botonPrincipal, botonSecundario, SkeletonLista, BotonEliminar, fechaKey, showToast,
  estaProgramadoEnFecha, esClienteDePaseosActivo,
  textoClienteEnLista,
} from "../HowriaAdmin.jsx";
import { SeccionPlegable } from "./_compartido.jsx";

const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function inicioSemanaActual() {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  const dow = (f.getDay() + 6) % 7;
  f.setDate(f.getDate() - dow);
  return f;
}

const UMBRAL_SOBRECARGA = 8;

// Bloque plegable para no mostrar toda la pestaña Coordinación de una en
// celular — "Hoy" abierto por defecto, el resto a un toque de distancia.

function FilaCalendarioCliente({ item, usuarios, diaVista, hoy, onToggleRealizado, onToggleCancelado, onReasignar, onGuardarNota, onAbrirCompartir }) {
  const [masAbierto, setMasAbierto] = useState(false);
  const { cliente: c, estado, nota, atrasado, compartidoCon, porcentajeCompartido } = item;
  const colorEstado = estado === "realizado" ? "#2F6A46" : estado === "cancelado" ? RUST : atrasado ? RUST : "#8A6A1E";
  const bgEstado = estado === "realizado" ? "#D8ECDE" : estado === "cancelado" ? "#F1DCD2" : atrasado ? "#F1DCD2" : "#F3E3B4";
  const textoEstado = estado === "realizado" ? "Realizado" : estado === "cancelado" ? "Cancelado" : atrasado ? "⚠️ Atrasado" : "Pendiente";

  return (
    <div style={{ padding: "10px 11px", background: atrasado ? "#FBEEEA" : CREAM_SOFT, borderRadius: 10, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <div style={{ width: 30, height: 30, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : "#FFFFFF" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#8A7E5C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.horaHabitual || "—"} · 🐾 {c.perro}</p>
        </div>
      </div>
      <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: bgEstado, color: colorEstado, marginBottom: 8 }}>{textoEstado}</span>
      {/* El detalle del reparto vive detrás de "Más ▾", así que sin esta
          marca habría que abrir fila por fila para saber cuáles están
          compartidos — y son justamente los que cambian a quién se le
          paga. */}
      {compartidoCon && (
        <span title={`Compartido con ${compartidoCon} (${porcentajeCompartido ?? 50}%)`}
          style={{ display: "inline-block", fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#FBF3E0", color: "#8A6A1E", marginBottom: 8, marginLeft: 6 }}>
          🤝 {porcentajeCompartido ?? 50}%
        </span>
      )}
      {estado === "realizado" ? (
        // Ya está marcado — los dos botones grandes de antes se sentían
        // "todavía pendiente de hacer algo" aunque ya no quedaba nada por
        // hacer. Un link chico de deshacer alcanza (acción barata y 100%
        // reversible, no amerita un confirm de por medio).
        <div style={{ textAlign: "right" }}>
          <button onClick={onToggleRealizado} style={{ border: "none", background: "none", color: "#8A7E5C", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            Deshacer
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <button onClick={onToggleRealizado} disabled={diaVista > hoy}
            style={{ flex: "1 1 auto", border: "1px solid #C7D9CC", background: "#fff", color: "#2F6A46", borderRadius: 7, padding: "6px 6px", fontSize: 11, fontWeight: 600, cursor: diaVista > hoy ? "not-allowed" : "pointer", opacity: diaVista > hoy ? 0.5 : 1 }}>
            Marcar hecho
          </button>
          <button onClick={onToggleCancelado}
            style={{ flex: "1 1 auto", border: `1px solid ${estado === "cancelado" ? RUST : "#E7CFC2"}`, background: estado === "cancelado" ? RUST : "#fff", color: estado === "cancelado" ? "#fff" : RUST, borderRadius: 7, padding: "6px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {estado === "cancelado" ? "✕ Cancelado" : "Cancelar"}
          </button>
        </div>
      )}
      <button onClick={() => setMasAbierto((v) => !v)}
        style={{ border: "none", background: "none", color: "#8A7E5C", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: "6px 0 0", width: "100%", textAlign: "center" }}>
        {masAbierto ? "Menos ▲" : "Más ▾"}
      </button>
      {masAbierto && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          <select defaultValue="" onChange={(e) => { if (e.target.value) onReasignar(e.target.value); e.target.value = ""; }}
            style={{ fontSize: 11.5, padding: "6px 8px", borderRadius: 6, border: "1px solid #E4DBC3" }}>
            <option value="">Reasignar a...</option>
            {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          <input defaultValue={nota} placeholder="nota..." onBlur={(e) => onGuardarNota(e.target.value)}
            style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6 }} />
          {estado === "realizado" && (
            <button onClick={onAbrirCompartir}
              style={{
                border: `1px dashed ${GOLD}`, background: compartidoCon ? "#FBF3E0" : "none", color: NAVY, borderRadius: 7,
                padding: "8px 8px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", textAlign: "center",
              }}>
              {compartidoCon ? `🤝 Compartido con ${compartidoCon} (${porcentajeCompartido ?? 50}%)` : "🤝 Compartir con otro paseador"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Fila de la sección "Paseos de hoy" — deslizar a la izquierda (arrastrar
// con el dedo o el mouse) revela el botón "Reprogramar", mismo mecanismo
// de puntero (pointer events, funciona con touch y mouse) que ya usa
// DeslizarParaCompletar en RutaGuiada.jsx, pero acá el gesto revela un
// botón fijo en vez de completar una acción al soltar.
const ANCHO_ACCION_SWIPE = 108;

function FilaSwipeReprogramar({ item, yaReprogramada, onReprogramar }) {
  const [dx, setDx] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const inicioXRef = useRef(null);
  const abiertoRef = useRef(false);

  function iniciar(e) {
    inicioXRef.current = e.clientX;
    setArrastrando(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function mover(e) {
    if (!arrastrando || inicioXRef.current === null) return;
    const delta = e.clientX - inicioXRef.current;
    const base = abiertoRef.current ? -ANCHO_ACCION_SWIPE : 0;
    setDx(Math.min(0, Math.max(-ANCHO_ACCION_SWIPE, base + delta)));
  }
  function soltar() {
    if (!arrastrando) return;
    setArrastrando(false);
    const abrir = dx <= -ANCHO_ACCION_SWIPE / 2;
    abiertoRef.current = abrir;
    setDx(abrir ? -ANCHO_ACCION_SWIPE : 0);
  }

  const { cliente: c, estado, atrasado } = item;
  const colorEstado = estado === "cancelado" ? RUST : atrasado ? RUST : "#8A6A1E";
  const bgEstado = estado === "cancelado" ? "#F1DCD2" : atrasado ? "#F1DCD2" : "#F3E3B4";
  const textoEstado = estado === "cancelado" ? "Cliente canceló" : atrasado ? "⚠️ Atrasado" : "Pendiente";

  return (
    <div style={{ position: "relative", borderRadius: 10, overflow: "hidden" }}>
      <button onClick={() => !arrastrando && onReprogramar()} disabled={yaReprogramada}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: ANCHO_ACCION_SWIPE, border: "none",
          background: yaReprogramada ? "#C4BCA0" : NAVY, color: CREAM, fontSize: 11.5, fontWeight: 700,
          cursor: yaReprogramada ? "default" : "pointer", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4,
        }}>
        <CalendarClock size={16} />
        Reprogramar
      </button>
      <div onPointerDown={iniciar} onPointerMove={mover} onPointerUp={soltar} onPointerCancel={soltar}
        style={{
          position: "relative", transform: `translateX(${dx}px)`, transition: arrastrando ? "none" : "transform .2s ease",
          touchAction: "pan-y", userSelect: "none", background: atrasado ? "#FBEEEA" : CREAM_SOFT, borderRadius: 10,
          padding: "10px 12px", display: "flex", alignItems: "center", gap: 10,
        }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : "#FFFFFF" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre} · 🐾 {c.perro}</p>
          <p style={{ margin: 0, fontSize: 11, color: "#8A7E5C" }}>{c.horaHabitual || "—"}</p>
        </div>
        {yaReprogramada ? (
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#E3E9EF", color: "#5C6B7A", flex: "none" }}>→ Reprogramado</span>
        ) : (
          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: bgEstado, color: colorEstado, flex: "none" }}>{textoEstado}</span>
        )}
      </div>
    </div>
  );
}

function ModalReprogramarRapido({ cliente, hoy, fecha, onFecha, motivo, onMotivo, onConfirmar, onCerrar, cargando }) {
  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 340, boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Reprogramar paseo</h3>
        <p style={{ ...hint, marginTop: -2 }}>{cliente.nombre} — 🐾 {cliente.perro}. Hoy no se hizo — ¿para qué día lo movemos?</p>
        <label style={label}>Nueva fecha</label>
        <input type="date" value={fecha} min={fechaKey(hoy)} onChange={(e) => onFecha(e.target.value)} style={{ ...input, marginBottom: 16 }} autoFocus />
        <label style={label}>Motivo (opcional)</label>
        <input value={motivo} onChange={(e) => onMotivo(e.target.value)} placeholder="Ej: el cliente no pudo hoy" style={{ ...input, marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCerrar} style={botonSecundario}>Cancelar</button>
          <button onClick={onConfirmar} disabled={cargando || !fecha} style={{ ...botonPrincipal, width: "auto", flex: 1, opacity: cargando || !fecha ? 0.6 : 1 }}>
            {cargando ? "Moviendo…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// La tarjeta de cada cliente en "Hoy" es angosta (grilla de 2 columnas) —
// no alcanza el espacio para un select + un número ahí adentro sin que
// quede apretado. Mismo motivo por el que el reparto vive en un modal
// aparte, no inline como "Reasignar a...".
function ModalCompartirPaseo({ item, equipoPaseo, nombre, porcentaje, onNombre, onPorcentaje, onGuardar, onCerrar }) {
  const { cliente: c } = item;
  const otros = equipoPaseo.filter((u) => u.nombre !== c.paseadorNombre);
  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Compartir paseo</h3>
        <p style={{ ...hint, marginTop: -2 }}>{c.nombre} — 🐾 {c.perro}. Reparte el pago de hoy entre {c.paseadorNombre} y otro paseador.</p>
        <label style={label}>Compartir con</label>
        {otros.length === 0 ? (
          <p style={{ ...hint, marginTop: -4 }}>No hay otro paseador/entrenador con quien compartir este paseo.</p>
        ) : (
          <select value={nombre} onChange={(e) => onNombre(e.target.value)} style={{ ...input, marginBottom: 16 }}>
            <option value="">Sin compartir</option>
            {otros.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
        )}
        {nombre && (
          <>
            <label style={label}>Porcentaje para {nombre}</label>
            <input type="number" min={1} max={99} value={porcentaje}
              onChange={(e) => onPorcentaje(Math.min(99, Math.max(1, Number(e.target.value) || 50)))}
              style={{ ...input, marginBottom: 6 }} />
            <p style={{ ...hint, marginTop: 0 }}>{100 - porcentaje}% para {c.paseadorNombre} · {porcentaje}% para {nombre}</p>
          </>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onCerrar} style={botonSecundario}>Cancelar</button>
          <button onClick={onGuardar} style={{ ...botonPrincipal, width: "auto", flex: 1 }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// Cuando alguien está ausente hoy, reasignar sus paseos pendientes uno
// por uno es lento justo el día que más urge resolverlo. Reasigna TODOS
// de una — a diferencia de "Reasignar a..." de una fila suelta, esto es
// permanente (cambia cliente.paseadorNombre para siempre, no solo hoy),
// así que se lo advierte explícitamente: cuando la persona ausente
// vuelva, hay que devolvérselos a mano si corresponde.
function ModalResolverAusencia({ paseador, pendientes, equipoPaseo, nuevoPaseador, onNuevoPaseador, onConfirmar, onCerrar, cargando }) {
  const otros = equipoPaseo.filter((u) => u.nombre !== paseador);
  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 400, boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Reasignar pendientes de {paseador}</h3>
        <p style={{ ...hint, marginTop: -2 }}>
          {paseador} está ausente hoy y tiene {pendientes.length} paseo{pendientes.length === 1 ? "" : "s"} sin marcar. Esto los reasigna de forma <b>permanente</b> (no solo por hoy) — cuando {paseador} vuelva, tendrás que devolvérselos a mano si corresponde.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, margin: "10px 0 16px", maxHeight: 140, overflowY: "auto" }}>
          {pendientes.map((item) => (
            <p key={item.cliente.id} style={{ margin: 0, fontSize: 12.5, color: INK }}>🐾 {item.cliente.nombre} — {item.cliente.perro}</p>
          ))}
        </div>
        <label style={label}>Reasignar a</label>
        {otros.length === 0 ? (
          <p style={{ ...hint, marginTop: -4 }}>No hay otro paseador/entrenador disponible.</p>
        ) : (
          <select value={nuevoPaseador} onChange={(e) => onNuevoPaseador(e.target.value)} style={{ ...input, marginBottom: 16 }}>
            <option value="">Elige un paseador...</option>
            {otros.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onCerrar} style={botonSecundario}>Cancelar</button>
          <button onClick={onConfirmar} disabled={!nuevoPaseador || cargando} style={{ ...botonPrincipal, width: "auto", flex: 1, opacity: !nuevoPaseador || cargando ? 0.6 : 1 }}>
            Reasignar {pendientes.length} paseo{pendientes.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Clientes entrantes (decidir qué hacer con cada uno) -------
//
// api/cliente-agenda.js crea un cliente REAL apenas alguien reserva por
// el link público — antes de que nadie confirme la cita — a propósito
// incompleto: sin paseador, sin tarifa, sin plan. Eso sirve para que la
// cita aparezca de una en las pantallas del entrenador, pero deja al
// cliente flotando sin que nadie decida qué hacer con él. Este panel es
// donde se decide: qué servicio va a tomar y quién lo atiende.
//
// Se listan solo los marcados con triagePendiente (database/107), no los
// que "parecen" incompletos: un cliente puede estar sin paseador a
// propósito, y adivinar por los campos vacíos traería gente que no
// corresponde.
const SERVICIOS_ENTRANTE = [
  { id: "paseos", nombre: "Paseos" },
  { id: "evaluacion", nombre: "Evaluación" },
  { id: "clases", nombre: "Clases" },
];

function fmtFechaCita(iso) {
  return new Date(iso).toLocaleString("es-CL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function FichaEntrante({ cliente, citas, equipoPaseo, entrenadores, onGuardar }) {
  const [servicios, setServicios] = useState(cliente.tipoServicio || []);
  const [paseador, setPaseador] = useState(cliente.paseadorNombre || "");
  const [valorPaseo, setValorPaseo] = useState(cliente.valorPaseoRef || "");
  const [tarifaPaseador, setTarifaPaseador] = useState(cliente.tarifaPaseador || "");
  const [adiestrador, setAdiestrador] = useState(cliente.adiestradorNombre || "");

  const quierePaseos = servicios.includes("paseos");
  const quiereAdiestrador = servicios.includes("clases") || servicios.includes("evaluacion");

  // Qué falta para que la decisión sirva de algo. Un cliente de paseos
  // sin paseador o con tarifa en $0 queda a medias y termina saliendo en
  // los avisos de Inicio; mejor pedirlo acá que arrastrarlo.
  const faltan = [];
  if (servicios.length === 0) faltan.push("elegir al menos un servicio");
  if (quierePaseos && !paseador) faltan.push("asignar un paseador");
  if (quierePaseos && !(Number(valorPaseo) > 0)) faltan.push("poner cuánto paga el cliente");
  if (quierePaseos && !(Number(tarifaPaseador) > 0)) faltan.push("poner cuánto recibe el paseador");
  if (quiereAdiestrador && !adiestrador) faltan.push("asignar un adiestrador");

  function toggleServicio(id) {
    setServicios((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function guardar() {
    if (faltan.length > 0) return;
    onGuardar(cliente.id, {
      tipoServicio: servicios,
      paseadorNombre: quierePaseos ? paseador : cliente.paseadorNombre,
      valorPaseoRef: quierePaseos ? Number(valorPaseo) : cliente.valorPaseoRef,
      tarifaPaseador: quierePaseos ? Number(tarifaPaseador) : cliente.tarifaPaseador,
      adiestradorNombre: quiereAdiestrador ? adiestrador : cliente.adiestradorNombre,
      triagePendiente: false,
    });
  }

  return (
    <div style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", flex: "none", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: NAVY }}>{cliente.nombre}</p>
          <p style={{ margin: 0, fontSize: 12.5, color: "#8A7E5C" }}>🐾 {cliente.perro || "sin perro"}</p>
        </div>
      </div>

      <div style={{ fontSize: 12.5, color: "#6B6248", lineHeight: 1.7, marginBottom: 12 }}>
        {cliente.telefono && <div>📞 {cliente.telefono}</div>}
        {cliente.email && <div>✉️ {cliente.email}</div>}
        {cliente.direccion && <div>📍 {cliente.direccion}</div>}
        {citas.map((c, i) => (
          <div key={i} style={{ marginTop: 6, color: NAVY }}>
            📅 {c.tipo === "evaluacion" ? "Evaluación" : "Clase"} con {c.adiestrador} · {fmtFechaCita(c.fechaISO)}
            <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: c.estado === "pendiente" ? "#F3E3B4" : "#D8ECDE", color: c.estado === "pendiente" ? "#8A6A1E" : "#2F6A46" }}>
              {c.estado === "pendiente" ? "Por confirmar" : "Confirmada"}
            </span>
          </div>
        ))}
      </div>

      <p style={{ ...label, marginBottom: 6 }}>¿Qué va a tomar?</p>
      <div role="group" aria-label="Servicios del cliente" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {SERVICIOS_ENTRANTE.map((sv) => {
          const activo = servicios.includes(sv.id);
          return (
            <button key={sv.id} type="button" onClick={() => toggleServicio(sv.id)} aria-pressed={activo}
              style={{
                padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer", minHeight: 40,
                border: activo ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: activo ? NAVY : "#FFFFFF", color: activo ? CREAM : INK, fontWeight: activo ? 600 : 400,
              }}>
              {sv.nombre}
            </button>
          );
        })}
      </div>

      {quierePaseos && (
        <div style={{ marginBottom: 12 }}>
          <label style={label} htmlFor={`entrante-paseador-${cliente.id}`}>Paseador</label>
          <select id={`entrante-paseador-${cliente.id}`} value={paseador} onChange={(e) => setPaseador(e.target.value)} style={input}>
            <option value="">Elegir…</option>
            {equipoPaseo.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label} htmlFor={`entrante-valor-${cliente.id}`}>Paga el cliente</label>
              <input id={`entrante-valor-${cliente.id}`} type="number" min="0" value={valorPaseo}
                onChange={(e) => setValorPaseo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label} htmlFor={`entrante-tarifa-${cliente.id}`}>Recibe el paseador</label>
              <input id={`entrante-tarifa-${cliente.id}`} type="number" min="0" value={tarifaPaseador}
                onChange={(e) => setTarifaPaseador(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
          </div>
        </div>
      )}

      {quiereAdiestrador && (
        <div style={{ marginBottom: 12 }}>
          <label style={label} htmlFor={`entrante-adiestrador-${cliente.id}`}>Adiestrador</label>
          <select id={`entrante-adiestrador-${cliente.id}`} value={adiestrador} onChange={(e) => setAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option value="">Elegir…</option>
            {entrenadores.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
        </div>
      )}

      {faltan.length > 0 && (
        <p style={{ ...hint, color: RUST, margin: "10px 0" }}>Falta {faltan.join(", ")}.</p>
      )}
      <button onClick={guardar} disabled={faltan.length > 0}
        style={{ ...botonPrincipal, marginTop: 10, opacity: faltan.length > 0 ? 0.45 : 1 }}>
        Listo, ya está decidido
      </button>
    </div>
  );
}

export function PanelClientesEntrantes({ clientes, setClientes, usuarios, citasAgenda = [] }) {
  const entrantes = clientes.filter((c) => c.triagePendiente);
  const equipoPaseo = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  const entrenadores = usuarios.filter((u) => u.rol === "entrenador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  function guardarDecision(clienteId, cambios) {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, ...cambios } : c)));
    showToast("Cliente listo.", "exito");
  }

  if (entrantes.length === 0) return null;

  return (
    <div className="howria-card" style={{ ...tarjeta, border: `1px solid ${GOLD}` }}>
      <h2 style={sectionTitle}>Clientes nuevos por definir ({entrantes.length})</h2>
      <p style={hint}>
        Entraron solos por el link público y ya pidieron cita. Define qué servicio van a tomar y quién los atiende;
        al guardar salen de esta lista.
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 14 }}>
        {entrantes.map((c) => (
          <FichaEntrante key={c.id} cliente={c}
            citas={citasAgenda.filter((x) => x.clienteId && x.clienteId === c._dbId)}
            equipoPaseo={equipoPaseo} entrenadores={entrenadores} onGuardar={guardarDecision} />
        ))}
      </div>
    </div>
  );
}

export function Coordinacion({ clientes, setClientes, usuarios, registroPaseos, setRegistroPaseos, setTab, setMapaPaseadorSel, faseDiaPaseador = {}, ausenciasPaseador = {}, cargandoClientes = false, reprogramaciones = [], moverPaseo, eliminarReprogramacion, user, citasAgenda = [] }) {
  // Solo paseador/entrenador reales (no "Sin asignar", ni cuentas de
  // coordinador/administrador que nunca van a tener un horario de
  // paseos) — de la lista de usuarios, no de quién tiene clientes hoy,
  // para que el filtro/selector siga disponible aunque se navegue a otro
  // día o no tenga clientes todavía.
  const equipoPaseo = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const [paseadorSel, setPaseadorSel] = useState(equipoPaseo[0]?.nombre || "");
  // Filtro de "Todos"/un paseador puntual — vive arriba del todo de la
  // pestaña (resumen + tarjetas de "Hoy"), separado de paseadorSel (que
  // es solo para el editor de horario semanal, más abajo).
  const [filtroPaseador, setFiltroPaseador] = useState("todos");
  const [busqueda, setBusqueda] = useState("");
  const [diaOffset, setDiaOffset] = useState(0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dowHoy = (hoy.getDay() + 6) % 7;
  // Clave del día de hoy — sirve de dependencia estable para los useMemo
  // que derivan de `hoy`. Sin esto quedaban con una copia vieja: si la
  // pestaña se deja abierta y pasa la medianoche (pasa seguido, es la
  // pantalla que el coordinador tiene todo el día), "Hoy" seguía
  // mostrando el día anterior aunque el reloj ya hubiera cambiado.
  const hoyKey = fechaKey(hoy);
  const ayer = useMemo(() => { const d = new Date(hoy); d.setDate(d.getDate() - 1); return d; }, [hoyKey]);
  const [clienteMoverSel, setClienteMoverSel] = useState("");
  const [fechaOrigenSel, setFechaOrigenSel] = useState(() => fechaKey(ayer));
  const [fechaNuevaSel, setFechaNuevaSel] = useState(() => fechaKey(hoy));
  const [motivoMover, setMotivoMover] = useState("");
  const [moviendoPaseo, setMoviendoPaseo] = useState(false);

  // "Agregar paseo anterior" — a diferencia de Reprogramar (mueve un
  // paseo que ya estaba programado), esto crea uno que nunca estuvo
  // programado — ej. una capacitación con un cliente que no es suyo.
  const [clienteAgregarSel, setClienteAgregarSel] = useState("");
  const [fechaAgregarSel, setFechaAgregarSel] = useState(() => fechaKey(ayer));
  const [paseadorAgregarSel, setPaseadorAgregarSel] = useState("");
  const [notaAgregar, setNotaAgregar] = useState("");
  const [agregandoPaseo, setAgregandoPaseo] = useState(false);
  const [diaSemanaMovil, setDiaSemanaMovil] = useState(dowHoy);
  const inicioSemana = inicioSemanaActual();

  // Sección "Paseos de hoy" (al inicio de la pestaña) — independiente del
  // navegador de días de más abajo ("Hoy"/diaOffset): siempre muestra el
  // día de hoy, sea cual sea el día que se esté mirando en el detalle.
  const [vistaRapida, setVistaRapida] = useState("no_realizados");
  const [reprogramarModal, setReprogramarModal] = useState(null);
  const [fechaRapida, setFechaRapida] = useState("");
  const [motivoRapido, setMotivoRapido] = useState("");
  const [reprogramandoRapido, setReprogramandoRapido] = useState(false);

  const diaVista = useMemo(() => { const d = new Date(hoy); d.setDate(d.getDate() + diaOffset); return d; }, [diaOffset, hoyKey]);
  const dowVista = (diaVista.getDay() + 6) % 7;
  const esHoyVista = diaOffset === 0;

  // "Atrasado" se calculaba una sola vez al armar calendarioDia (reloj
  // congelado) — si un coordinador dejaba la pestaña abierta de fondo,
  // un paseo que se atrasaba a las 9:20 seguía mostrando "Pendiente"
  // hasta que algo más (cambiar de día, tocar un cliente) forzara el
  // recálculo. Este tick fuerza que se vuelva a evaluar cada minuto.
  const [tickReloj, setTickReloj] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTickReloj((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  function actualizarRegistroDia(clienteId, fecha, cambios) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...cambios } }));
  }
  function toggleRealizadoDia(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    const marcandoRealizado = !registroPaseos[key]?.realizado;
    // Al desmarcar un paseo se borra también cualquier reparto que
    // tuviera — un paseo "no realizado" no debería seguir repartiendo
    // pago con nadie.
    actualizarRegistroDia(clienteId, fecha, {
      realizado: marcandoRealizado, cancelado: false,
      ...(marcandoRealizado ? {} : { compartidoCon: null, porcentajeCompartido: null }),
    });
  }
  function toggleCanceladoDia(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    actualizarRegistroDia(clienteId, fecha, { cancelado: !registroPaseos[key]?.cancelado, realizado: false });
  }
  function irAMapa(nombrePaseador) {
    setMapaPaseadorSel(nombrePaseador);
    setTab("mapa");
  }

  function construirEstadoDia(fecha, esVistaHoy) {
    const ahora = new Date();
    return clientes
      .filter((c) => estaProgramadoEnFecha(c, fecha, reprogramaciones))
      .map((c) => {
        const key = `${c.id}_${fechaKey(fecha)}`;
        const registro = registroPaseos[key];
        const estado = registro?.realizado ? "realizado" : registro?.cancelado ? "cancelado" : "pendiente";
        let atrasado = false;
        if (esVistaHoy && estado === "pendiente" && c.horaHabitual) {
          const [h, m] = c.horaHabitual.split(":").map(Number);
          const horaProgramada = new Date(fecha);
          horaProgramada.setHours(h, m, 0, 0);
          atrasado = ahora > horaProgramada;
        }
        // El reparto tiene que viajar con el item: la fila lo usa para
        // mostrar la insignia 🤝 y el modal para abrirse con lo que ya
        // había. Sin esto la insignia nunca aparecía y, peor, abrir
        // "Compartir" sobre un paseo ya repartido mostraba "Sin
        // compartir" — guardar ahí borraba el reparto sin avisar, o sea
        // le cambiaba el pago a alguien en silencio.
        return {
          cliente: c, estado, nota: registro?.nota || "", atrasado,
          compartidoCon: registro?.compartidoCon || null,
          porcentajeCompartido: registro?.porcentajeCompartido ?? null,
        };
      })
      .sort((a, b) => (a.cliente.horaHabitual || "99:99").localeCompare(b.cliente.horaHabitual || "99:99"));
  }

  function agruparPorPaseador(items) {
    const grupos = {};
    items.forEach((item) => {
      const nombre = item.cliente.paseadorNombre || "Sin asignar";
      (grupos[nombre] ||= []).push(item);
    });
    return Object.entries(grupos)
      .map(([paseador, items]) => ({ paseador, items }))
      .sort((a, b) => a.paseador.localeCompare(b.paseador, "es"));
  }

  // Clientes de paseos activos que no aparecen NUNCA en esta pantalla,
  // porque no tienen ningún día habitual marcado. No es que estén
  // pendientes: es que no existen para el calendario, así que nadie les
  // puede marcar un paseo y no se les factura nada.
  //
  // Es el punto ciego de esta pestaña: todo lo demás muestra lo que hay,
  // y esto muestra lo que falta. Sin el aviso no hay forma de notarlo,
  // justamente porque no aparecen.
  const sinDiasAsignados = useMemo(() => clientes.filter((c) =>
    (!(c.tipoServicio || []).length || (c.tipoServicio || []).includes("paseos")) &&
    (c.estadoCliente || "activo") === "activo" &&
    !(c.diasHabituales || []).length), [clientes]);

  const calendarioDia = useMemo(() => construirEstadoDia(diaVista, esHoyVista), [clientes, registroPaseos, diaVista, dowVista, esHoyVista, tickReloj, reprogramaciones]);
  const calendarioPorPaseador = useMemo(() => agruparPorPaseador(calendarioDia), [calendarioDia]);

  // Sección "Paseos de hoy" — siempre el día de hoy de verdad, no diaVista.
  const calendarioHoy = useMemo(() => construirEstadoDia(hoy, true), [clientes, registroPaseos, tickReloj, reprogramaciones]);
  const calendarioHoyPorPaseador = useMemo(
    // "Sin asignar" queda afuera — reprogramar necesita un paseador
    // asignado (mismo requisito que ya tiene la sección "Reprogramar
    // paseos" de más abajo, clientesConPaseador).
    () => agruparPorPaseador(calendarioHoy).filter((g) => g.paseador !== "Sin asignar"),
    [calendarioHoy]
  );
  // Mismo filtro que ya acota "Resumen de hoy" y "Hoy" — antes "Paseos de
  // hoy" seguía mostrando a todo el equipo aunque se hubiera filtrado a
  // una sola persona más abajo.
  const gruposVistaRapida = useMemo(() => {
    return calendarioHoyPorPaseador
      .filter((g) => filtroPaseador === "todos" || g.paseador === filtroPaseador)
      .map(({ paseador, items }) => ({
        paseador,
        items: items.filter((item) => (vistaRapida === "no_realizados" ? item.estado !== "realizado" : item.estado === "realizado")),
      }))
      .filter((g) => g.items.length > 0);
  }, [calendarioHoyPorPaseador, vistaRapida, filtroPaseador]);
  const calendarioHoyFiltrado = filtroPaseador === "todos" ? calendarioHoy : calendarioHoy.filter((i) => (i.cliente.paseadorNombre || "Sin asignar") === filtroPaseador);
  const totalNoRealizadosHoy = calendarioHoyFiltrado.filter((i) => i.estado !== "realizado" && (i.cliente.paseadorNombre || "Sin asignar") !== "Sin asignar").length;
  const totalRealizadosHoy = calendarioHoyFiltrado.filter((i) => i.estado === "realizado" && (i.cliente.paseadorNombre || "Sin asignar") !== "Sin asignar").length;

  function abrirReprogramarRapido(cliente) {
    const manana = new Date(hoy);
    manana.setDate(manana.getDate() + 1);
    setFechaRapida(fechaKey(manana));
    setMotivoRapido("");
    setReprogramarModal(cliente);
  }

  async function reprogramarRapido() {
    const cliente = reprogramarModal;
    if (!cliente || !fechaRapida || reprogramandoRapido) return;
    setReprogramandoRapido(true);
    const fechaNuevaDate = new Date(fechaRapida + "T00:00:00");
    const ok = await moverPaseo({ cliente, fechaOrigen: hoy, fechaNueva: fechaNuevaDate, motivo: motivoRapido.trim(), creadoPor: user.nombre });
    if (ok) {
      actualizarRegistroDia(cliente.id, hoy, { cancelado: true, realizado: false });
      showToast(`Paseo de ${cliente.nombre} reprogramado a ${fechaNuevaDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })} — a ${cliente.paseadorNombre} le va a aparecer ese día.`, "exito");
      setReprogramarModal(null);
    }
    setReprogramandoRapido(false);
  }

  // El mismo filtro de arriba también acota qué tarjetas de "Hoy" se ven
  // (sea cual sea el día que se esté mirando con Anterior/Siguiente) — no
  // solo los números del resumen.
  const calendarioPorPaseadorFiltrado = filtroPaseador === "todos"
    ? calendarioPorPaseador
    : calendarioPorPaseador.filter((g) => g.paseador === filtroPaseador);

  const clientesHoy = clientes.filter((c) => estaProgramadoEnFecha(c, hoy, reprogramaciones));
  const clientesHoyFiltrados = filtroPaseador === "todos" ? clientesHoy : clientesHoy.filter((c) => (c.paseadorNombre || "Sin asignar") === filtroPaseador);
  const realizadosHoy = clientesHoyFiltrados.filter((c) => registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.realizado).length;
  const canceladosHoy = clientesHoyFiltrados.filter((c) => registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.cancelado).length;
  const pendientesHoy = clientesHoyFiltrados.length - realizadosHoy - canceladosHoy;

  // Misma regla que el detalle del día, compartida a propósito: acá
  // faltaba excluir a los pausados, así que el resumen de la semana los
  // contaba y el día no.
  const clientesDePaseos = clientes.filter(esClienteDePaseosActivo);

  const fechasSemana = Array.from({ length: 7 }, (_, i) => { const f = new Date(inicioSemana); f.setDate(f.getDate() + i); return f; });
  const resumenSemana = fechasSemana.map((fecha, i) => {
    const clientesDia = clientesDePaseos.filter((c) => c.diasHabituales?.includes(i));
    return { dia: DIAS_LARGOS[i], total: clientesDia.length };
  });

  // carga semanal comparada entre paseadores — "sobrecargado" se calcula
  // con el mismo umbral que la vista diaria (picoDiario, el día más
  // cargado de su semana), no con el total semanal, para que un
  // paseador no aparezca sobrecargado acá y no en el detalle por día (o
  // al revés).
  const cargaPorPaseador = equipoPaseo.map((u) => {
    const clientesDe = clientesDePaseos.filter((c) => c.paseadorNombre === u.nombre);
    const total = clientesDe.reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
    const picoDiario = Math.max(0, ...Array.from({ length: 7 }, (_, dow) => clientesDe.filter((c) => c.diasHabituales?.includes(dow)).length));
    return { nombre: u.nombre, total, picoDiario };
  }).sort((a, b) => b.total - a.total);
  const maxCarga = Math.max(1, ...cargaPorPaseador.map((p) => p.total));

  const clientesDelPaseador = clientes.filter((c) => c.paseadorNombre === paseadorSel);
  const qBusqueda = busqueda.trim().toLowerCase();

  function toggleDiaCliente(clienteId, dow) {
    setClientes((prev) => prev.map((c) => {
      if (c.id !== clienteId) return c;
      const dias = c.diasHabituales || [];
      const tiene = dias.includes(dow);
      return { ...c, diasHabituales: tiene ? dias.filter((d) => d !== dow) : [...dias, dow].sort((a, b) => a - b) };
    }));
  }

  function agregarClienteADia(clienteId, dow) {
    setClientes((prev) => prev.map((c) => {
      if (c.id !== clienteId) return c;
      const dias = new Set(c.diasHabituales || []);
      dias.add(dow);
      return { ...c, paseadorNombre: paseadorSel, diasHabituales: [...dias].sort((a, b) => a - b) };
    }));
  }

  function asignarPaseadorRapido(clienteId, nombre) {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, paseadorNombre: nombre } : c)));
  }

  const [ausenciaModal, setAusenciaModal] = useState(null);
  const [ausenciaNuevoPaseador, setAusenciaNuevoPaseador] = useState("");
  const [reasignandoAusencia, setReasignandoAusencia] = useState(false);

  function abrirResolverAusencia(paseador, items) {
    setAusenciaNuevoPaseador("");
    setAusenciaModal({ paseador, pendientes: items.filter((i) => i.estado === "pendiente") });
  }

  function confirmarReasignoMasivo() {
    if (!ausenciaModal || !ausenciaNuevoPaseador || reasignandoAusencia) return;
    setReasignandoAusencia(true);
    const ids = new Set(ausenciaModal.pendientes.map((item) => item.cliente.id));
    setClientes((prev) => prev.map((c) => (ids.has(c.id) ? { ...c, paseadorNombre: ausenciaNuevoPaseador } : c)));
    showToast(`${ids.size} paseo${ids.size === 1 ? "" : "s"} de ${ausenciaModal.paseador} reasignado${ids.size === 1 ? "" : "s"} a ${ausenciaNuevoPaseador}.`, "exito");
    setAusenciaModal(null);
    setReasignandoAusencia(false);
  }

  function guardarNotaDia(clienteId, fecha, nota) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), nota } }));
  }

  // Reparto de pago entre dos paseadores para un paseo puntual ya
  // realizado — no toca cliente.paseadorNombre (eso sigue siendo "el
  // paseador principal", quien se queda con el resto del porcentaje).
  function guardarCompartidoDia(clienteId, fecha, compartidoCon, porcentaje) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), compartidoCon: compartidoCon || null, porcentajeCompartido: compartidoCon ? porcentaje : null },
    }));
  }

  const [compartirModal, setCompartirModal] = useState(null);
  const [compartirNombre, setCompartirNombre] = useState("");
  const [compartirPorcentaje, setCompartirPorcentaje] = useState(50);

  function abrirCompartir(item) {
    setCompartirNombre(item.compartidoCon || "");
    setCompartirPorcentaje(item.porcentajeCompartido ?? 50);
    setCompartirModal(item);
  }
  function confirmarCompartir() {
    const cliente = compartirModal.cliente;
    guardarCompartidoDia(cliente.id, diaVista, compartirNombre, compartirPorcentaje);
    // Aviso optimista — si el guardado falla de verdad (RLS, conexión),
    // el toast de error de setRegistroPaseos también va a aparecer justo
    // después, así que ver los dos juntos es la señal de que algo falló.
    showToast(
      compartirNombre
        ? `Paseo de ${cliente.nombre} compartido con ${compartirNombre} (${compartirPorcentaje}%).`
        : `Se quitó el reparto del paseo de ${cliente.nombre}.`,
      "exito"
    );
    setCompartirModal(null);
  }

  // Todo cliente con paseador asignado — no solo los de hoy, porque el
  // origen de un movimiento suele ser un día pasado que ya no aparece en
  // "Hoy" (ya se marcó cancelado, o quedó atrás con el navegador de días).
  const clientesConPaseador = clientes.filter((c) => c.paseadorNombre).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  async function handleMoverPaseo() {
    const cliente = clientesConPaseador.find((c) => c.id === Number(clienteMoverSel));
    if (!cliente || !fechaOrigenSel || !fechaNuevaSel || moviendoPaseo) return;
    setMoviendoPaseo(true);
    const fechaOrigenDate = new Date(fechaOrigenSel + "T00:00:00");
    const fechaNuevaDate = new Date(fechaNuevaSel + "T00:00:00");
    const ok = await moverPaseo({ cliente, fechaOrigen: fechaOrigenDate, fechaNueva: fechaNuevaDate, motivo: motivoMover.trim(), creadoPor: user.nombre });
    if (ok) {
      // El día de origen queda "cancelado" (no "sin marcar para siempre")
      // — mismo mecanismo que cualquier otra cancelación, así no sigue
      // apareciendo como pendiente ni atrasado.
      actualizarRegistroDia(cliente.id, fechaOrigenDate, { cancelado: true, realizado: false });
      showToast(`Paseo de ${cliente.nombre} movido a ${fechaNuevaDate.toLocaleDateString("es-CL", { day: "numeric", month: "long" })} — a ${cliente.paseadorNombre} le va a aparecer ese día.`, "exito");
      setClienteMoverSel(""); setMotivoMover("");
    }
    setMoviendoPaseo(false);
  }

  // Registro existente para el cliente+fecha elegidos en "Agregar paseo
  // anterior" — si ya hay algo guardado ahí, se avisa antes de pisarlo.
  const registroExistenteAgregar = clienteAgregarSel && fechaAgregarSel ? registroPaseos[`${clienteAgregarSel}_${fechaAgregarSel}`] : null;

  function elegirClienteAgregar(idStr) {
    setClienteAgregarSel(idStr);
    const cliente = clientesConPaseador.find((c) => c.id === Number(idStr));
    // Por defecto asume que lo hizo el paseador de siempre del cliente —
    // el caso de "otro paseador" (ej. una practicante) se cambia a mano.
    setPaseadorAgregarSel(cliente?.paseadorNombre || "");
  }

  async function agregarPaseoAnterior() {
    const cliente = clientesConPaseador.find((c) => c.id === Number(clienteAgregarSel));
    if (!cliente || !fechaAgregarSel || !paseadorAgregarSel || agregandoPaseo) return;
    setAgregandoPaseo(true);
    const fecha = new Date(fechaAgregarSel + "T00:00:00");
    // Si lo hizo alguien distinto al paseador asignado del cliente (el
    // caso de la practicante), se reusa el mismo reparto de Coordinación
    // "Hoy" — 100% para quien lo hizo de verdad, 0% para el asignado —
    // así el pago llega bien a Mis Paseos/Finanzas/Pago Trabajadores sin
    // ningún cálculo nuevo.
    const esOtroPaseador = paseadorAgregarSel !== cliente.paseadorNombre;
    const cambios = {
      realizado: true, cancelado: false,
      compartidoCon: esOtroPaseador ? paseadorAgregarSel : null,
      porcentajeCompartido: esOtroPaseador ? 100 : null,
    };
    if (notaAgregar.trim()) cambios.nota = notaAgregar.trim();
    actualizarRegistroDia(cliente.id, fecha, cambios);
    showToast(`Paseo de ${cliente.nombre} el ${fecha.toLocaleDateString("es-CL", { day: "numeric", month: "long" })} agregado para ${paseadorAgregarSel}.`, "exito");
    setClienteAgregarSel(""); setPaseadorAgregarSel(""); setNotaAgregar("");
    setAgregandoPaseo(false);
  }

  function estiloCuboFiltro(activo) {
    return {
      display: "flex", flexDirection: "column", gap: 1, minWidth: 82, padding: "8px 12px", borderRadius: 12,
      border: activo ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4", background: activo ? NAVY : "#FFFFFF",
      color: activo ? CREAM : INK, cursor: "pointer", textAlign: "left", fontFamily: "'Inter', sans-serif",
    };
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PanelClientesEntrantes clientes={clientes} setClientes={setClientes} usuarios={usuarios} citasAgenda={citasAgenda} />

      {sinDiasAsignados.length > 0 && (
        <div style={{ background: "#F3E3B4", border: "1px solid #E0CB84", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#6B5312" }}>
            {sinDiasAsignados.length} cliente(s) de paseos no aparecen en ningún día
          </p>
          <p style={{ margin: "2px 0 8px", fontSize: 12, color: "#8A6A1E" }}>
            No tienen días habituales marcados, así que no salen en el calendario y nadie les puede marcar un paseo. Ponles sus días en la ficha para que aparezcan.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {sinDiasAsignados.map((c) => (
              <span key={c.id} style={{ fontSize: 12, background: "#FFFDF7", border: "1px solid #E0CB84", borderRadius: 20, padding: "3px 10px", color: "#6B5312" }}>
                {c.nombre.trim()}{c.perro ? ` · 🐾 ${c.perro}` : ""}{c.paseadorNombre ? ` · ${c.paseadorNombre}` : " · sin paseador"}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Paseos de hoy</h2>
        <p style={hint}>Quién falta por marcar, agrupado por paseador. Desliza un paseo sin marcar hacia la izquierda para reprogramarlo al tiro.</p>
        <div role="group" aria-label="No realizados o realizados" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setVistaRapida("no_realizados")} aria-pressed={vistaRapida === "no_realizados"}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: vistaRapida === "no_realizados" ? RUST : CREAM_SOFT, color: vistaRapida === "no_realizados" ? "#FFFFFF" : INK }}>
            No realizados ({totalNoRealizadosHoy})
          </button>
          <button type="button" onClick={() => setVistaRapida("realizados")} aria-pressed={vistaRapida === "realizados"}
            style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: vistaRapida === "realizados" ? "#2F6A46" : CREAM_SOFT, color: vistaRapida === "realizados" ? "#FFFFFF" : INK }}>
            Realizados ({totalRealizadosHoy})
          </button>
        </div>

        {cargandoClientes ? (
          <SkeletonLista filas={3} alto={44} gap={8} />
        ) : gruposVistaRapida.length === 0 ? (
          <p style={hint}>{vistaRapida === "no_realizados" ? "Todo marcado — no queda ningún paseo pendiente hoy. 🎉" : "Todavía nadie ha sido marcado como realizado hoy."}</p>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            {gruposVistaRapida.map(({ paseador, items }) => {
              const motivoAusente = ausenciasPaseador[paseador];
              const faseHoy = FASES_PASEADOR.find((x) => x.id === (faseDiaPaseador[paseador] || "pendiente"));
              return (
              <div key={paseador}>
                <p style={{ margin: "0 0 8px", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: NAVY }}>{paseador} <span style={{ fontWeight: 400, color: "#8A7E5C" }}>· {items.length}</span></span>
                  {motivoAusente ? (
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#F1DCD2", color: RUST }}>⚠️ Ausente: {motivoAusente}</span>
                  ) : (
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: faseHoy.bg, color: faseHoy.color }}>{faseHoy.nombre}</span>
                  )}
                </p>
                <div style={{ display: "grid", gap: 8 }}>
                  {items.map((item) =>
                    vistaRapida === "no_realizados" ? (
                      <FilaSwipeReprogramar key={item.cliente.id} item={item}
                        yaReprogramada={reprogramaciones.some((r) => r.clienteId === item.cliente._dbId && r.fechaOrigen === fechaKey(hoy))}
                        onReprogramar={() => abrirReprogramarRapido(item.cliente)} />
                    ) : (
                      <div key={item.cliente.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#D8ECDE", borderRadius: 10, padding: "10px 12px" }}>
                        <div style={{ width: 32, height: 32, borderRadius: "50%", flex: "none", background: item.cliente.fotoUrl ? `url(${item.cliente.fotoUrl}) center/cover` : "#FFFFFF" }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.cliente.nombre} · 🐾 {item.cliente.perro}</p>
                          <p style={{ margin: 0, fontSize: 11, color: "#2E5C41" }}>{item.cliente.horaHabitual || "—"}</p>
                        </div>
                        <CheckCircle2 size={16} color="#2F6A46" />
                      </div>
                    )
                  )}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      {reprogramarModal && (
        <ModalReprogramarRapido cliente={reprogramarModal} hoy={hoy} fecha={fechaRapida} onFecha={setFechaRapida} motivo={motivoRapido} onMotivo={setMotivoRapido}
          onConfirmar={reprogramarRapido} onCerrar={() => setReprogramarModal(null)} cargando={reprogramandoRapido} />
      )}

      {compartirModal && (
        <ModalCompartirPaseo item={compartirModal} equipoPaseo={equipoPaseo} nombre={compartirNombre} porcentaje={compartirPorcentaje}
          onNombre={setCompartirNombre} onPorcentaje={setCompartirPorcentaje} onGuardar={confirmarCompartir} onCerrar={() => setCompartirModal(null)} />
      )}

      {ausenciaModal && (
        <ModalResolverAusencia paseador={ausenciaModal.paseador} pendientes={ausenciaModal.pendientes} equipoPaseo={equipoPaseo}
          nuevoPaseador={ausenciaNuevoPaseador} onNuevoPaseador={setAusenciaNuevoPaseador}
          onConfirmar={confirmarReasignoMasivo} onCerrar={() => setAusenciaModal(null)} cargando={reasignandoAusencia} />
      )}

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Resumen de hoy</h2>
        <p style={hint}>Toca a alguien del equipo para ver solo lo suyo — el resumen y las tarjetas de abajo se acotan a esa persona.</p>
        <div role="group" aria-label="Filtrar por paseador" style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "12px 0 16px" }}>
          <button type="button" onClick={() => setFiltroPaseador("todos")} aria-pressed={filtroPaseador === "todos"} style={estiloCuboFiltro(filtroPaseador === "todos")}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}>Todos</span>
            <span style={{ fontSize: 10.5, opacity: 0.75 }}>{clientesHoy.length} hoy</span>
          </button>
          {equipoPaseo.map((u) => {
            const cuenta = clientesHoy.filter((c) => c.paseadorNombre === u.nombre).length;
            const ausente = ausenciasPaseador[u.nombre];
            return (
              <button key={u.id} type="button" onClick={() => setFiltroPaseador(u.nombre)} aria-pressed={filtroPaseador === u.nombre} style={estiloCuboFiltro(filtroPaseador === u.nombre)} title={ausente ? `Ausente: ${ausente}` : undefined}>
                <span style={{ fontSize: 12.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{ausente ? "⚠️ " : ""}{u.nombre}</span>
                <span style={{ fontSize: 10.5, opacity: 0.75 }}>{ausente ? "Ausente hoy" : `${cuenta} hoy`}</span>
              </button>
            );
          })}
        </div>
        <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#9BAAB8" }}>Programados hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{clientesHoyFiltrados.length}</p>
          </div>
          <div style={{ background: "#E7F0EA", borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#2E5C41" }}>Realizados hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#2E5C41" }}>{realizadosHoy}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#8A7E5C" }}>Pendientes hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: RUST }}>{pendientesHoy}{canceladosHoy > 0 ? ` (${canceladosHoy} cancelado(s))` : ""}</p>
          </div>
        </div>
      </div>

      <SeccionPlegable titulo="Hoy" subtitulo="Quién pasea a quién, a qué hora, y si ya se hizo." defaultAbierta>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <p style={{ ...hint, margin: 0 }}>
            {/* El año solo aparece si NO es el año en curso — navegando unos
                meses hacia adelante se cruza a enero y "24 de enero" a secas
                no dejaba claro que era del año siguiente. */}
            <b style={{ color: NAVY }}>
              {DIAS_LARGOS[dowVista]} {diaVista.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}
              {diaVista.getFullYear() !== hoy.getFullYear() ? ` de ${diaVista.getFullYear()}` : ""}
            </b>
            {diaOffset !== 0 && (
              <span style={{ marginLeft: 8, fontSize: 11.5, color: diaOffset > 0 ? "#8A6A1E" : "#8A7E5C" }}>
                {diaOffset > 0
                  ? `· en ${diaOffset} día${diaOffset === 1 ? "" : "s"} más`
                  : `· hace ${-diaOffset} día${diaOffset === -1 ? "" : "s"}`}
              </span>
            )}
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => setDiaOffset((d) => d - 1)} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5 }}>← Anterior</button>
            <button onClick={() => setDiaOffset(0)} disabled={diaOffset === 0} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5, opacity: diaOffset === 0 ? 0.5 : 1 }}>Hoy</button>
            <button onClick={() => setDiaOffset((d) => d + 1)} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5 }}>Siguiente →</button>
            {/* Ir día por día servía para mirar ayer o mañana, pero para
                llegar al mes siguiente había que tocar "Siguiente" treinta
                veces. Sin `max`: acá sí tiene sentido mirar hacia adelante
                (quién tiene paseos la otra semana), a diferencia de Mis
                paseos, donde solo se marca lo ya ocurrido. */}
            <input type="date" value={fechaKey(diaVista)} title="Ir a una fecha"
              onChange={(e) => {
                if (!e.target.value) return;
                const [a, m, d] = e.target.value.split("-").map(Number);
                const destino = new Date(a, m - 1, d);
                destino.setHours(0, 0, 0, 0);
                setDiaOffset(Math.round((destino - hoy) / 86400000));
              }}
              style={{ ...input, margin: 0, width: 150, padding: "7px 10px", fontSize: 12.5 }} />
          </div>
        </div>

        {cargandoClientes ? (
          <div style={{ marginTop: 12 }}><SkeletonLista filas={3} alto={72} gap={10} /></div>
        ) : calendarioPorPaseadorFiltrado.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>
            {filtroPaseador === "todos" ? "No hay paseos programados este día." : `${filtroPaseador} no tiene paseos programados este día.`}
          </p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {calendarioPorPaseadorFiltrado.map(({ paseador, items }) => {
              const hechos = items.filter((i) => i.estado === "realizado").length;
              return (
                <div key={paseador} style={{ border: "1px solid #E4DBC3", borderRadius: 10, padding: 14, background: "#FFFFFF" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: NAVY, fontSize: 14.5 }}>{paseador} <span style={{ fontWeight: 400, color: "#8A7E5C", fontSize: 12.5 }}>· {hechos}/{items.length} hecho(s)</span></span>
                      {esHoyVista && paseador !== "Sin asignar" && (() => {
                        const motivo = ausenciasPaseador[paseador];
                        if (motivo) {
                          const pendientesAusente = items.filter((i) => i.estado === "pendiente");
                          return (
                            <>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#F1DCD2", color: RUST }}>⚠️ Ausente: {motivo}</span>
                              {pendientesAusente.length > 0 && (
                                <button onClick={() => abrirResolverAusencia(paseador, items)}
                                  style={{ border: `1px dashed ${RUST}`, background: "none", color: RUST, borderRadius: 20, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                                  Reasignar {pendientesAusente.length} pendiente{pendientesAusente.length === 1 ? "" : "s"}
                                </button>
                              )}
                            </>
                          );
                        }
                        const f = FASES_PASEADOR.find((x) => x.id === (faseDiaPaseador[paseador] || "pendiente"));
                        return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: f.bg, color: f.color }}>{f.nombre}</span>;
                      })()}
                    </div>
                    {paseador !== "Sin asignar" && (
                      <button onClick={() => irAMapa(paseador)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Ver ruta en el mapa →</button>
                    )}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
                    {items.map((item) => (
                      <FilaCalendarioCliente key={item.cliente.id} item={item} usuarios={equipoPaseo} diaVista={diaVista} hoy={hoy}
                        onToggleRealizado={() => toggleRealizadoDia(item.cliente.id, diaVista)}
                        onToggleCancelado={() => toggleCanceladoDia(item.cliente.id, diaVista)}
                        onReasignar={(nombre) => asignarPaseadorRapido(item.cliente.id, nombre)}
                        onGuardarNota={(nota) => guardarNotaDia(item.cliente.id, diaVista, nota)}
                        onAbrirCompartir={() => abrirCompartir(item)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SeccionPlegable>

      <SeccionPlegable titulo="Semana" subtitulo="Paseos programados y carga de cada paseador esta semana.">
        {/* flex:1 1 0 (no overflow-x:auto) — una fila con overflow-x fue la
            causa real, ya documentada, de que Safari achicara toda la
            página al entrar a Mis Paseos; una fila de N botones que debe
            quedarse en una sola línea se reparte el ancho disponible en
            vez de arriesgarse a desbordar. */}
        <div className="howria-dia-selector-movil" style={{ display: "none", gap: 6, marginBottom: 16 }}>
          {DIAS_LARGOS.map((dia, dow) => (
            <button key={dow} onClick={() => setDiaSemanaMovil(dow)}
              style={{
                flex: "1 1 0", minWidth: 0, padding: "8px 4px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: dow === diaSemanaMovil ? "none" : "1px solid #E4DBC3",
                background: dow === diaSemanaMovil ? NAVY : "#fff",
                color: dow === diaSemanaMovil ? CREAM : INK,
              }}>
              {dia.slice(0, 3)}{dow === dowHoy ? " ·" : ""}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Paseos programados por día, esta semana</p>
        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 22 }}>
          {resumenSemana.map((d, i) => (
            <div key={i} className={i === diaSemanaMovil ? undefined : "howria-dia-col-oculta-movil"}
              style={{ textAlign: "center", padding: "10px 4px", borderRadius: 8, background: i === dowHoy ? NAVY : CREAM_SOFT }}>
              <p style={{ margin: 0, fontSize: 11, color: i === dowHoy ? "#9BAAB8" : "#8A7E5C" }}>{d.dia.slice(0, 3)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: i === dowHoy ? CREAM : NAVY }}>{d.total}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Carga semanal por paseador (total de paseos/semana)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cargaPorPaseador.map((p) => (
            <div key={p.nombre} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: INK, width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
              <div style={{ flex: 1, background: CREAM_SOFT, borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(p.total / maxCarga) * 100}%`, height: "100%", background: p.picoDiario > UMBRAL_SOBRECARGA ? RUST : NAVY, borderRadius: 6 }} title={p.picoDiario > UMBRAL_SOBRECARGA ? `Su día más cargado tiene ${p.picoDiario} clientes` : undefined} />
              </div>
              <span style={{ fontSize: 12, color: "#8A7E5C", width: 30, textAlign: "right", flexShrink: 0 }}>{p.total}</span>
            </div>
          ))}
        </div>
      </SeccionPlegable>

      <SeccionPlegable titulo="Horario por paseador" subtitulo="Edita a mano los días y clientes de cada paseador.">
        <div className="howria-dia-selector-movil" style={{ display: "none", gap: 6, marginBottom: 16 }}>
          {DIAS_LARGOS.map((dia, dow) => (
            <button key={dow} onClick={() => setDiaSemanaMovil(dow)}
              style={{
                flex: "1 1 0", minWidth: 0, padding: "8px 4px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: dow === diaSemanaMovil ? "none" : "1px solid #E4DBC3",
                background: dow === diaSemanaMovil ? NAVY : "#fff",
                color: dow === diaSemanaMovil ? CREAM : INK,
              }}>
              {dia.slice(0, 3)}{dow === dowHoy ? " ·" : ""}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 13, color: "#6B6248", marginTop: 0, marginBottom: 14 }}>
          Elige un paseador para ver y editar su horario. Agrega un cliente a un día con el selector, quítalo con la "×", o déjale una nota rápida.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <select value={paseadorSel} onChange={(e) => setPaseadorSel(e.target.value)} style={{ ...input, maxWidth: 280, marginBottom: 0 }}>
            {equipoPaseo.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          <input placeholder="Buscar cliente para agregar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, maxWidth: 240, marginBottom: 0 }} />
        </div>

        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
          {DIAS_LARGOS.map((dia, dow) => {
            const clientesDia = clientesDelPaseador.filter((c) => c.diasHabituales?.includes(dow));
            const disponiblesParaAgregar = clientes
              .filter((c) => !c.diasHabituales?.includes(dow))
              // Sin paseador asignado, o ya del paseador que se está
              // editando — así "+ agregar" nunca le roba en silencio un
              // cliente a otro paseador (eso ya tiene su propio flujo
              // deliberado, con confirmación, en "Reasignar" más abajo).
              .filter((c) => !c.paseadorNombre || c.paseadorNombre === paseadorSel)
              .filter((c) => !qBusqueda || c.nombre.toLowerCase().includes(qBusqueda) || c.perro.toLowerCase().includes(qBusqueda));
            const fechaDia = fechasSemana[dow];
            const sobrecargado = clientesDia.length > UMBRAL_SOBRECARGA;
            return (
              <div key={dow} className={dow === diaSemanaMovil ? undefined : "howria-dia-col-oculta-movil"}
                style={{ border: sobrecargado ? `1.5px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8, padding: 10, background: dow === dowHoy ? "#FBF6E9" : "#fff" }}>
                <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: sobrecargado ? RUST : NAVY, display: "flex", justifyContent: "space-between" }}>
                  <span>{dia.slice(0, 3)}{dow === dowHoy ? " · hoy" : ""}</span>
                  {sobrecargado && <span title={`Más de ${UMBRAL_SOBRECARGA} clientes este día`}>⚠️</span>}
                </p>
                {clientesDia.map((c) => {
                  const registro = registroPaseos[`${c.id}_${fechaKey(fechaDia)}`];
                  const color = registro?.realizado ? "#3F8B5B" : registro?.cancelado ? RUST : "#C4BCA0";
                  return (
                    <div key={c.id} style={{ background: CREAM_SOFT, borderRadius: 6, padding: "5px 6px", marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: INK, lineHeight: 1.2 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          {c.nombre}
                        </span>
                        <span className="howria-mini-quitar">
                          <BotonEliminar onConfirm={() => toggleDiaCliente(c.id, dow)} label="×" title="Quitar de este día" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 13, flexShrink: 0, marginLeft: 4, padding: 0 }} />
                        </span>
                      </div>
                      <input className="howria-mini-nota" defaultValue={registro?.nota || ""} placeholder="nota..."
                        onBlur={(e) => guardarNotaDia(c.id, fechaDia, e.target.value)}
                        style={{ width: "100%", fontSize: 10, marginTop: 3, padding: "2px 4px", border: "1px solid #E4DBC3", borderRadius: 4, background: "#fff" }} />
                    </div>
                  );
                })}
                {clientesDia.length === 0 && <p style={{ fontSize: 10.5, color: "#C4BCA0", margin: "0 0 6px" }}>Sin paseos</p>}
                <select className="howria-mini-agregar" onChange={(e) => { if (e.target.value) { agregarClienteADia(Number(e.target.value), dow); e.target.value = ""; } }} style={{ width: "100%", fontSize: 10.5, padding: "4px 2px", marginTop: 4, border: "1px solid #E4DBC3", borderRadius: 5 }}>
                  <option value="">+ agregar</option>
                  {disponiblesParaAgregar.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </SeccionPlegable>

      <SeccionPlegable titulo="Reprogramar paseos" subtitulo="Mover el paseo de un cliente a otro día puntual — sin tocar su horario habitual ni el pago del paseador.">
        <p style={{ ...hint, marginTop: -4 }}>
          Por ejemplo: el cliente no pudo ayer y pide dejarlo para hoy — el paseador sigue siendo el mismo, solo cambia el día. El horario habitual del cliente no se toca, y el paseo cuenta igual para la meta y el pago de quien lo hace.
        </p>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 12, marginTop: 14 }}>
          <div>
            <label style={label}>Cliente</label>
            <select value={clienteMoverSel} onChange={(e) => setClienteMoverSel(e.target.value)} style={{ ...input, marginBottom: 0 }}>
              <option value="">Selecciona un cliente…</option>
              {clientesConPaseador.map((c) => <option key={c.id} value={c.id}>{textoClienteEnLista(c, { conTipo: false })} ({c.paseadorNombre})</option>)}
            </select>
          </div>
          <div>
            <label style={label}>De este día</label>
            <input type="date" value={fechaOrigenSel} onChange={(e) => setFechaOrigenSel(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label}>A este día</label>
            <input type="date" value={fechaNuevaSel} onChange={(e) => setFechaNuevaSel(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>
        <label style={{ ...label, marginTop: 14 }}>Motivo (opcional)</label>
        <input value={motivoMover} onChange={(e) => setMotivoMover(e.target.value)} placeholder="Ej: el cliente no pudo el lunes, lo dejamos para hoy" style={input} />
        <button onClick={handleMoverPaseo} disabled={!clienteMoverSel || moviendoPaseo}
          style={{ ...botonPrincipal, width: "auto", padding: "12px 24px", opacity: !clienteMoverSel || moviendoPaseo ? 0.6 : 1, cursor: !clienteMoverSel || moviendoPaseo ? "default" : "pointer" }}>
          {moviendoPaseo ? "Moviendo…" : "Mover paseo"}
        </button>

        {reprogramaciones.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <p style={label}>Paseos movidos</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {reprogramaciones.map((r) => {
                const cliente = clientes.find((c) => c._dbId === r.clienteId);
                return (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: CREAM_SOFT, borderRadius: 8, flexWrap: "wrap" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13, color: INK }}>
                        <b style={{ color: NAVY }}>{cliente?.nombre || "Cliente eliminado"}</b> — {new Date(r.fechaOrigen + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })} → {new Date(r.fechaNueva + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })} ({r.paseadorNombre})
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7E5C" }}>
                        {r.motivo ? `${r.motivo} — ` : ""}movido por {r.creadoPor}
                      </p>
                    </div>
                    <BotonEliminar onConfirm={() => eliminarReprogramacion(r.id)} label="Deshacer" title="Quitar esta reprogramación (no revierte el día de origen)"
                      style={{ ...botonSecundario, padding: "6px 12px", fontSize: 11.5, borderColor: RUST, color: RUST, flex: "none" }} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </SeccionPlegable>

      <SeccionPlegable titulo="Agregar paseo anterior" subtitulo="Para paseos que se hicieron pero nunca quedaron programados — por ejemplo, una capacitación.">
        <p style={{ ...hint, marginTop: -4 }}>
          Por ejemplo: una paseadora nueva hizo paseos de práctica con clientes que no son suyos durante su capacitación — acá se registran para que le cuenten en su pago, sin tocar al paseador asignado del cliente.
        </p>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1.5fr", gap: 12, marginTop: 14 }}>
          <div>
            <label style={label}>Cliente</label>
            <select value={clienteAgregarSel} onChange={(e) => elegirClienteAgregar(e.target.value)} style={{ ...input, marginBottom: 0 }}>
              <option value="">Selecciona un cliente…</option>
              {clientesConPaseador.map((c) => <option key={c.id} value={c.id}>{textoClienteEnLista(c, { conTipo: false })} ({c.paseadorNombre})</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Fecha</label>
            <input type="date" value={fechaAgregarSel} max={fechaKey(hoy)} onChange={(e) => setFechaAgregarSel(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label}>Quién lo hizo de verdad</label>
            <select value={paseadorAgregarSel} onChange={(e) => setPaseadorAgregarSel(e.target.value)} style={{ ...input, marginBottom: 0 }}>
              <option value="">Selecciona un paseador…</option>
              {equipoPaseo.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <label style={{ ...label, marginTop: 14 }}>Nota (opcional)</label>
        <input value={notaAgregar} onChange={(e) => setNotaAgregar(e.target.value)} placeholder="Ej: paseo de práctica durante su capacitación" style={input} />
        {registroExistenteAgregar && (
          <p style={{ ...hint, color: RUST, marginTop: -6 }}>
            ⚠️ Ya hay un registro para este cliente en esta fecha ({registroExistenteAgregar.realizado ? "realizado" : registroExistenteAgregar.cancelado ? "cancelado" : "sin marcar"}) — guardar acá lo va a reemplazar.
          </p>
        )}
        <button onClick={agregarPaseoAnterior} disabled={!clienteAgregarSel || !paseadorAgregarSel || agregandoPaseo}
          style={{ ...botonPrincipal, width: "auto", padding: "12px 24px", opacity: !clienteAgregarSel || !paseadorAgregarSel || agregandoPaseo ? 0.6 : 1, cursor: !clienteAgregarSel || !paseadorAgregarSel || agregandoPaseo ? "default" : "pointer" }}>
          {agregandoPaseo ? "Agregando…" : "Agregar paseo"}
        </button>
      </SeccionPlegable>
    </div>
  );
}
