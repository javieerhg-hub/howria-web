// Pestaña "Calendario" — dos zooms del mismo dato: el mes completo
// (CalendarioAlumnos) y el día hora por hora (Itinerario), con
// PestanaCalendario eligiendo cuál se ve. Hasta el commit de la fase 2
// eran DOS pestañas del menú, lo que no tenía sentido: comparten el
// archivo, los helpers y hasta las props. CalendarioAlumnos además se
// sigue usando por su cuenta como sub-vista de Alumnos (con onVolver).
// Ver
// src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas y
// src/tabs/_compartido.jsx para lo compartido real (usado por más
// pestañas además de estas dos).
import { useState, useRef, useMemo, useEffect } from "react";
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, tarjeta, sectionTitle, hint, input, botonSecundario,
  fechaKey, showToast,
} from "../HowriaAdmin.jsx";
import { estaProgramadoEnFecha } from "../lib/programacion.js";
import { hayChoqueHorario, ModalDetalleCita, eliminarCita, ordenarRutaCercanoMasProximo } from "./_compartido.jsx";

const TIPOS_CALENDARIO_VISTA = [
  { id: "evaluacion", nombre: "Evaluaciones", bg: "#F3E3B4", color: "#8A6A1E" },
  { id: "clase", nombre: "Clases", bg: "#D8ECDE", color: "#2F6A46" },
  { id: "paseo", nombre: "Paseos", bg: "#D6E6EE", color: "#1E5A7A" },
];

// Convierte un cliente con paseo agendado un día dado en un ítem con la
// misma forma que una cita real, para poder mostrarlo y abrirlo en el
// mismo ModalDetalleCita — sin _dbId (no vive en citas_agenda), así que
// el modal nunca le ofrece el botón de eliminar. Se guarda lat/lng para
// poder ordenar el itinerario del día por cercanía geográfica.
function paseoComoItem(cliente, key, registroPaseos) {
  const registro = registroPaseos[`${cliente.id}_${key}`];
  return {
    id: `paseo-${cliente.id}-${key}`,
    clienteId: cliente.id,
    tipo: "paseo",
    clienteNombre: cliente.nombre,
    perro: cliente.perro,
    email: cliente.email,
    telefono: cliente.telefono,
    direccion: cliente.direccion,
    adiestrador: cliente.paseadorNombre,
    lat: cliente.lat,
    lng: cliente.lng,
    horaHabitual: cliente.horaHabitual || null,
    fechaISO: `${key}T00:00:00`,
    estado: registro?.realizado ? "realizada" : registro?.cancelado ? "cancelada" : "pendiente",
    notas: registro?.nota || "",
  };
}

function minutosDesdeHora(str) {
  const [h, m] = (str || "09:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function horaDesdeMinutos(mins) {
  const total = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutosDeISO(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Agrupa los ítems de un día por persona responsable (adiestrador o
// paseador — mismo campo "adiestrador" en el ítem) y arma un itinerario
// cronológico por persona: evaluaciones/clases usan su hora real; los
// paseos no tienen hora fija en el sistema (solo día de la semana), así
// que se apilan de forma estimada — ordenados por cercanía geográfica
// (mismo criterio que MapaRutas, ordenarRutaCercanoMasProximo) a partir
// de una hora de inicio configurable, con duración y trayecto fijos
// entre cliente y cliente.
function construirItinerarioDia(items, { horaInicioPaseos, duracionPaseoMin, trayectoMin }) {
  const porPersona = {};
  items.forEach((it) => {
    const persona = it.adiestrador || "Sin asignar";
    (porPersona[persona] = porPersona[persona] || []).push(it);
  });

  const grupos = Object.entries(porPersona).map(([persona, itemsPersona]) => {
    const citasReales = itemsPersona
      .filter((it) => it.tipo !== "paseo")
      .map((it) => ({ ...it, _inicioMin: minutosDeISO(it.fechaISO), _finMin: minutosDeISO(it.fechaISO) + (it.duracionMin || 60), _estimado: false }));

    const paseos = itemsPersona.filter((it) => it.tipo === "paseo");

    // Los paseos con hora habitual ya configurada en la ficha del cliente
    // (mismo campo cliente.horaHabitual que ya usa Mis paseos para ordenar
    // y marcar atrasos) van directo a esa hora, sin pasar por la estimación.
    const conHoraFija = paseos
      .filter((p) => p.horaHabitual)
      .map((p) => {
        const inicio = minutosDesdeHora(p.horaHabitual);
        return { ...p, _inicioMin: inicio, _finMin: inicio + duracionPaseoMin, _estimado: false };
      });

    // El resto se ordena por cercanía geográfica y se apila desde la
    // hora de inicio — misma estimación de siempre, marcada "estimado"
    // hasta que alguien le fije una hora real (arrastrando o con el +).
    const sinHora = paseos.filter((p) => !p.horaHabitual);
    const conGeo = sinHora.filter((p) => p.lat && p.lng);
    const sinGeo = sinHora.filter((p) => !(p.lat && p.lng));
    const paseosOrdenados = [...ordenarRutaCercanoMasProximo(conGeo), ...sinGeo];

    let cursor = minutosDesdeHora(horaInicioPaseos);
    const paseosEstimados = paseosOrdenados.map((p) => {
      const inicio = cursor;
      const fin = inicio + duracionPaseoMin;
      cursor = fin + trayectoMin;
      return { ...p, _inicioMin: inicio, _finMin: fin, _estimado: true };
    });

    const todos = agruparManadas([...citasReales, ...conHoraFija, ...paseosEstimados]).sort((a, b) => a._inicioMin - b._inicioMin);
    return { persona, items: todos, inicioMin: todos[0]?._inicioMin ?? 0 };
  });

  return grupos.sort((a, b) => a.inicioMin - b.inicioMin);
}

// Paseos del mismo paseador que terminan con la misma hora (porque el
// usuario los unió arrastrando uno encima del otro, ver GrillaHorariaDia)
// se combinan en un solo ítem "manada" — así se ve un bloque conjunto en
// vez de dos bloques pisándose en el mismo horario.
function agruparManadas(items) {
  const porInicio = {};
  const resto = [];
  items.forEach((it) => {
    if (it.tipo !== "paseo") { resto.push(it); return; }
    (porInicio[it._inicioMin] = porInicio[it._inicioMin] || []).push(it);
  });
  const combinados = Object.values(porInicio).map((grupo) => {
    if (grupo.length === 1) return grupo[0];
    return {
      id: `manada-${grupo.map((g) => g.clienteId).join("-")}`,
      tipo: "paseo",
      esManada: true,
      miembros: grupo,
      perro: grupo.map((g) => g.perro).join(" + "),
      clienteNombre: grupo.map((g) => g.clienteNombre).join(", "),
      adiestrador: grupo[0].adiestrador,
      fechaISO: grupo[0].fechaISO,
      estado: grupo[0].estado,
      _inicioMin: grupo[0]._inicioMin,
      _finMin: Math.max(...grupo.map((g) => g._finMin)),
      _estimado: grupo.every((g) => g._estimado),
    };
  });
  return [...resto, ...combinados];
}

// Cuerpo del itinerario de un día — texto de ayuda, config de paseos
// (hora de inicio/duración/trayecto) y la grilla horaria en sí. Se usa
// tanto dentro de ModalItinerarioDia (clic en un día del calendario)
// como directo en la pestaña Itinerario (sin pasar por el mes).
function ContenidoItinerarioDia({ grupos, diaKey, citasAgenda, setCitas, setClientes, horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin, onVerDetalle }) {
  return (
    <>
      <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8A7E5C" }}>Evaluaciones y clases van a su hora agendada. Los paseos sin hora configurada se estiman en orden de cercanía a partir de la hora de inicio — arrastralos o tocá el + para fijarles una hora real, así queda guardada para la próxima vez.</p>

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18, padding: "10px 12px", background: CREAM_SOFT, borderRadius: 8 }}>
        <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
          Inicio paseos
          <input type="time" value={horaInicioPaseos} onChange={(e) => setHoraInicioPaseos(e.target.value)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 100 }} />
        </label>
        <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
          Duración paseo (min)
          <input type="number" min={5} step={5} value={duracionPaseoMin} onChange={(e) => setDuracionPaseoMin(Number(e.target.value) || 45)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 70 }} />
        </label>
        <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
          Trayecto (min)
          <input type="number" min={0} step={5} value={trayectoMin} onChange={(e) => setTrayectoMin(Number(e.target.value) || 0)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 70 }} />
        </label>
      </div>

      {grupos.length === 0 ? (
        <p style={hint}>Sin actividades este día.</p>
      ) : (
        <GrillaHorariaDia grupos={grupos} onVerDetalle={onVerDetalle} diaKey={diaKey} citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes} />
      )}
    </>
  );
}

// Ventana con el itinerario del día apilado por horario, agrupado por
// persona (paseador/adiestrador) — clic en un día del calendario.
function ModalItinerarioDia({ fechaLabel, diaKey, grupos, citasAgenda, setCitas, setClientes, horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin, onVerDetalle, onCerrar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);

  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 280, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-itinerario-titulo" className="howria-modal-caja"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <h3 id="modal-itinerario-titulo" style={{ margin: 0, textTransform: "capitalize", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{fechaLabel}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <ContenidoItinerarioDia grupos={grupos} diaKey={diaKey} citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes}
          horaInicioPaseos={horaInicioPaseos} setHoraInicioPaseos={setHoraInicioPaseos}
          duracionPaseoMin={duracionPaseoMin} setDuracionPaseoMin={setDuracionPaseoMin}
          trayectoMin={trayectoMin} setTrayectoMin={setTrayectoMin}
          onVerDetalle={onVerDetalle} />
      </div>
    </div>
  );
}

// Bloque individual arrastrable (y, si es paseo, también soltable encima
// de otro para armar manada) dentro de la grilla — mismos sensores
// (distancia mínima antes de activar el arrastre) que ya usa MapaRutas,
// así que un simple clic sigue abriendo el detalle normal y solo un
// arrastre de verdad mueve el horario.
function BloqueItinerario({ it, top, alto, tono, arrastrable, resaltado, onVerDetalle, onSeparar }) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: it.id, disabled: !arrastrable });
  const { setNodeRef: setDropRef } = useDroppable({ id: it.id, disabled: it.tipo !== "paseo" });
  const setNodeRef = (nodo) => { setDragRef(nodo); setDropRef(nodo); };
  return (
    <button ref={setNodeRef} {...(arrastrable ? { ...listeners, ...attributes } : {})} onClick={() => onVerDetalle(it)}
      style={{ position: "absolute", top, height: alto, left: 3, right: 3, borderRadius: 6,
        border: resaltado ? `2px solid ${NAVY}` : "none",
        background: tono?.bg || "#EDE4CE", color: tono?.color || INK, textAlign: "left",
        cursor: arrastrable ? (isDragging ? "grabbing" : "grab") : "pointer",
        padding: "3px 6px", overflow: "hidden", fontSize: 10.5, lineHeight: 1.3,
        boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.3)" : resaltado ? "0 0 0 3px rgba(18,42,64,0.25)" : "0 1px 2px rgba(0,0,0,0.1)",
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 5 : resaltado ? 4 : 1, touchAction: "none" }}>
      <div style={{ fontWeight: 700 }}>{horaDesdeMinutos(it._inicioMin)}–{horaDesdeMinutos(it._finMin)}</div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🐾 {it.perro}{!it.esManada && ` · ${it.clienteNombre}`}</div>
      {it.esManada && <div style={{ fontStyle: "italic", opacity: 0.85 }}>en manada</div>}
      {/* Separar va DENTRO del bloque y no en el modal de detalle porque
          es la vuelta atrás de un gesto que se hace acá mismo, y suele
          ser un error de arrastre que uno quiere deshacer al toque.
          onPointerDown detiene la propagación para que tocarlo no
          arranque un arrastre del bloque. */}
      {it.esManada && onSeparar && (
        <span role="button" tabIndex={0}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onSeparar(it); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); e.preventDefault(); onSeparar(it); } }}
          title="Separar la manada" aria-label="Separar la manada"
          style={{ position: "absolute", top: 2, right: 3, padding: "1px 5px", borderRadius: 5, fontSize: 10,
            fontWeight: 700, background: "rgba(255,255,255,0.75)", color: INK, cursor: "pointer", lineHeight: 1.4 }}>
          separar
        </span>
      )}
      {it._estimado && !it.esManada && <div style={{ fontStyle: "italic", opacity: 0.8 }}>estimado</div>}
    </button>
  );
}

// Grilla de horario tipo calendario de día — una columna por persona,
// filas de una hora, cada actividad se dibuja como un bloque posicionado
// y alto según su hora de inicio y duración (mismo lenguaje visual que
// un Google Calendar de un día, para que se entienda de un vistazo).
// Cada bloque se puede arrastrar verticalmente para reacomodar el
// horario: una evaluación/clase agendada se reprograma de verdad
// (persiste en citas_agenda, validando choque de horario); un paseo sin
// hora configurada (bloque "estimado") arrastra o suma con el + para
// fijarle una hora habitual — eso se guarda en cliente.horaHabitual,
// el mismo campo que ya usa Mis paseos para ordenar y marcar atrasos,
// así queda configurado en el sistema y deja de depender de la
// estimación automática. Arrastrar un paseo y sostenerlo 1,5s encima de
// otro paseo del mismo paseador los une en manada (misma hora para
// ambos clientes) — construirItinerarioDia los combina en un solo
// bloque conjunto la próxima vez que se recalcula el itinerario.
function GrillaHorariaDia({ grupos, onVerDetalle, diaKey, citasAgenda = [], setCitas, setClientes }) {
  const PX_POR_HORA = 56;
  const SNAP_MIN = 5;
  const TIEMPO_MANADA_MS = 1500;
  const [editandoHoraId, setEditandoHoraId] = useState(null);
  const [holdTargetId, setHoldTargetId] = useState(null);
  const holdTimerRef = useRef(null);
  const mergedRef = useRef(false);
  const sensoresGrilla = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  useEffect(() => () => { if (holdTimerRef.current) clearTimeout(holdTimerRef.current); }, []);

  const todosItems = grupos.flatMap((g) => g.items);
  const minInicio = todosItems.length ? Math.min(...todosItems.map((it) => it._inicioMin)) : 9 * 60;
  const maxFin = todosItems.length ? Math.max(...todosItems.map((it) => it._finMin)) : 18 * 60;
  const horaGridInicio = Math.min(8, Math.floor(minInicio / 60));
  const horaGridFin = Math.max(20, Math.ceil(maxFin / 60));
  const horas = [];
  for (let h = horaGridInicio; h < horaGridFin; h++) horas.push(h);
  const altoGrid = horas.length * PX_POR_HORA;

  // Hora que tenía cada cliente ANTES de entrar a una manada, para poder
  // devolvérsela al separar. Es un ref y no estado porque no cambia lo
  // que se dibuja, solo se consulta al separar.
  const horasPreviasRef = useRef({});

  function idsDe(it) {
    return it.esManada ? it.miembros.map((m) => m.clienteId) : [it.clienteId];
  }
  function nombresDe(it) {
    return it.esManada ? it.miembros.map((m) => m.clienteNombre) : [it.clienteNombre];
  }

  function aplicarHoraAItem(it, horaStr) {
    if (!setClientes || !horaStr) return;
    const ids = idsDe(it);
    setClientes((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, horaHabitual: horaStr } : c)));
    showToast(it.esManada ? `Manada actualizada a las ${horaStr}.` : `Hora de paseo guardada: ${horaStr}.`, "exito");
  }

  function limpiarHold() {
    if (holdTimerRef.current) { clearTimeout(holdTimerRef.current); holdTimerRef.current = null; }
    setHoldTargetId(null);
  }

  function unirManada(activo, destino) {
    if (!setClientes) return;
    const horaDestino = horaDesdeMinutos(destino._inicioMin);
    const ids = [...idsDe(activo), ...idsDe(destino)];
    // Unir SOBRESCRIBE la hora habitual de cada cliente, y esa hora es el
    // único rastro de que estaban separados: sin guardarla, separar
    // después no tiene a qué volver. Se anota antes de pisarla.
    setClientes((prev) => prev.map((c) => {
      if (!ids.includes(c.id)) return c;
      if (!(c.id in horasPreviasRef.current)) horasPreviasRef.current[c.id] = c.horaHabitual || null;
      return { ...c, horaHabitual: horaDestino };
    }));
    const nombres = [...nombresDe(activo), ...nombresDe(destino)];
    showToast(`${nombres.join(" y ")} ahora salen en manada a las ${horaDestino}. Podés separarlos con el botón del bloque.`, "exito");
  }

  // Deshace la manada. Si se unió en esta misma sesión, cada perro vuelve
  // exactamente a la hora que tenía antes (incluido "sin hora", que lo
  // devuelve a bloque estimado). Si no se sabe —por ejemplo si se recargó
  // la página—, se los separa dejando al primero en la hora del grupo y
  // corriendo al resto media hora cada uno, que al menos los despega y
  // deja arrastrarlos donde corresponda.
  function separarManada(it) {
    if (!setClientes || !it.esManada) return;
    const miembros = it.miembros;
    const recordadas = miembros.filter((m) => m.clienteId in horasPreviasRef.current);
    const seRecuerdaTodo = recordadas.length === miembros.length;

    setClientes((prev) => prev.map((c) => {
      const idx = miembros.findIndex((m) => m.clienteId === c.id);
      if (idx === -1) return c;
      if (seRecuerdaTodo) return { ...c, horaHabitual: horasPreviasRef.current[c.id] };
      return { ...c, horaHabitual: horaDesdeMinutos(it._inicioMin + idx * 30) };
    }));

    miembros.forEach((m) => { delete horasPreviasRef.current[m.clienteId]; });
    showToast(seRecuerdaTodo
      ? "Manada separada — cada perro volvió a su hora anterior."
      : "Manada separada — quedaron a media hora de distancia; arrastrá cada uno a su horario.", "exito");
  }

  function onDragStart() {
    mergedRef.current = false;
  }

  function onDragOver(event) {
    const { active, over } = event;
    if (!over || over.id === active.id) { limpiarHold(); return; }
    const activo = todosItems.find((x) => x.id === active.id);
    const destino = todosItems.find((x) => x.id === over.id);
    if (!activo || !destino || activo.tipo !== "paseo" || destino.tipo !== "paseo" || activo.adiestrador !== destino.adiestrador) {
      limpiarHold();
      return;
    }
    if (holdTargetId === over.id) return;
    limpiarHold();
    setHoldTargetId(over.id);
    holdTimerRef.current = setTimeout(() => {
      unirManada(activo, destino);
      mergedRef.current = true;
      limpiarHold();
    }, TIEMPO_MANADA_MS);
  }

  function onDragCancel() {
    limpiarHold();
    mergedRef.current = false;
  }

  function onDragEnd(event) {
    limpiarHold();
    if (mergedRef.current) { mergedRef.current = false; return; }

    const { active, delta } = event;
    if (!delta) return;
    const deltaMin = Math.round((delta.y / PX_POR_HORA) * 60 / SNAP_MIN) * SNAP_MIN;
    if (!deltaMin) return;

    const it = todosItems.find((x) => x.id === active.id);
    if (!it) return;
    const duracion = it._finMin - it._inicioMin;
    const nuevoInicio = Math.max(0, Math.min(it._inicioMin + deltaMin, 24 * 60 - duracion));
    if (nuevoInicio === it._inicioMin) return;

    if (it.tipo === "paseo") {
      aplicarHoraAItem(it, horaDesdeMinutos(nuevoInicio));
      return;
    }

    if (!setCitas || !diaKey) return;
    const nuevaFecha = new Date(`${diaKey}T00:00:00`);
    nuevaFecha.setMinutes(nuevoInicio);
    const nuevaISO = nuevaFecha.toISOString();
    const otras = citasAgenda.filter((c) => c.id !== it.id);
    if (hayChoqueHorario(otras, it.adiestrador, nuevaISO, duracion)) {
      showToast(`${it.adiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => prev.map((c) => (c.id === it.id ? { ...c, fechaISO: nuevaISO } : c)));
    showToast(`Movido a las ${horaDesdeMinutos(nuevoInicio)}.`, "exito");
  }

  return (
    <DndContext sensors={sensoresGrilla} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#8A7E5C" }}>Arrastrá un bloque hacia arriba o abajo para moverlo de horario — sostenelo 1,5s sobre otro paseo del mismo paseador para unirlos en manada.</p>
      <div style={{ display: "flex", overflowX: "auto" }}>
        <div style={{ flex: "none", width: 42 }}>
          <div style={{ height: 26 }} />
          {horas.map((h) => (
            <div key={h} style={{ height: PX_POR_HORA, borderTop: "1px solid #EDE4CE", fontSize: 10.5, color: "#8A7E5C", paddingTop: 2 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {grupos.map((g) => (
          <div key={g.persona} style={{ flex: "1 0 150px", minWidth: 150, borderLeft: "1px solid #EDE4CE" }}>
            <div style={{ height: 26, fontSize: 11.5, fontWeight: 700, color: NAVY, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
              {g.persona}
            </div>
            <div style={{ position: "relative", height: altoGrid, background: `repeating-linear-gradient(to bottom, transparent, transparent ${PX_POR_HORA - 1}px, #EDE4CE ${PX_POR_HORA - 1}px, #EDE4CE ${PX_POR_HORA}px)` }}>
              {g.items.map((it) => {
                const arrastrable = it.tipo === "paseo" || ["agendada", "pendiente"].includes(it.estado);
                const top = (it._inicioMin / 60 - horaGridInicio) * PX_POR_HORA;
                const puedeConfigurar = it.tipo === "paseo" && it._estimado && setClientes;
                return (
                  <div key={it.id}>
                    <BloqueItinerario it={it}
                      top={top}
                      alto={Math.max(((it._finMin - it._inicioMin) / 60) * PX_POR_HORA, 22)}
                      tono={TIPOS_CALENDARIO_VISTA.find((t) => t.id === it.tipo)}
                      arrastrable={arrastrable}
                      resaltado={holdTargetId === it.id}
                      onVerDetalle={onVerDetalle}
                      onSeparar={setClientes ? separarManada : undefined} />
                    {puedeConfigurar && (
                      editandoHoraId === it.id ? (
                        <input type="time" step={300} autoFocus defaultValue={horaDesdeMinutos(it._inicioMin)}
                          onChange={(e) => { if (e.target.value) { aplicarHoraAItem(it, e.target.value); setEditandoHoraId(null); } }}
                          onBlur={() => setEditandoHoraId(null)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditandoHoraId(null); }}
                          style={{ position: "absolute", top: top - 2, right: 3, width: 78, fontSize: 10, padding: "1px 2px", zIndex: 6, border: `1.5px solid ${NAVY}`, borderRadius: 4 }} />
                      ) : (
                        <button onClick={() => setEditandoHoraId(it.id)} title="Fijar hora real de este paseo"
                          style={{ position: "absolute", top: top - 5, right: 2, width: 17, height: 17, borderRadius: "50%", zIndex: 6,
                            border: `1.5px solid ${NAVY}`, background: "#FFFFFF", color: NAVY, fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: 0 }}>
                          +
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
}

// Config del itinerario del día (hora de inicio de paseos, duración y
// trayecto entre cliente y cliente) — se guarda en localStorage, mismo
// criterio que howria_filtros_clientes, para no reconfigurar cada vez.
// Compartida entre CalendarioAlumnos e Itinerario, así ajustarla en una
// pestaña también se refleja en la otra.
function useConfigItinerario() {
  const guardada = (() => {
    try { return JSON.parse(localStorage.getItem("howria_itinerario_calendario") || "{}"); } catch { return {}; }
  })();
  const [horaInicioPaseos, setHoraInicioPaseos] = useState(guardada.horaInicioPaseos || "09:00");
  const [duracionPaseoMin, setDuracionPaseoMin] = useState(guardada.duracionPaseoMin || 45);
  const [trayectoMin, setTrayectoMin] = useState(guardada.trayectoMin ?? 15);
  useEffect(() => {
    try { localStorage.setItem("howria_itinerario_calendario", JSON.stringify({ horaInicioPaseos, duracionPaseoMin, trayectoMin })); } catch {}
  }, [horaInicioPaseos, duracionPaseoMin, trayectoMin]);
  return { horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin };
}

// Arma la función itemsDelDia(key) — evaluaciones/clases reales de
// citas_agenda + paseos virtuales derivados de diasHabituales, filtrados
// por tipo visible y acotados al propio adiestrador/paseador si aplica.
// Compartida entre CalendarioAlumnos e Itinerario.
function useItemsPorDia({ citasAgenda, clientes, registroPaseos, rolActual, nombreActual, tiposVisibles, reprogramaciones = [] }) {
  const esEntrenador = rolActual === "entrenador";

  const porDiaCitas = useMemo(() => {
    const filtradas = citasAgenda.filter((c) =>
      ((c.tipo === "evaluacion" && tiposVisibles.evaluacion) || (c.tipo === "clase" && tiposVisibles.clase)) &&
      (!esEntrenador || c.adiestrador === nombreActual));
    const mapa = {};
    filtradas.forEach((c) => {
      const key = fechaKey(new Date(c.fechaISO));
      (mapa[key] = mapa[key] || []).push(c);
    });
    return mapa;
  }, [citasAgenda, esEntrenador, nombreActual, tiposVisibles.evaluacion, tiposVisibles.clase]);

  // Mismo criterio que "Paseos de hoy" en Inicio: cualquier cliente con
  // ese día en diasHabituales, sin filtrar por estadoCliente.
  const clientesPaseo = useMemo(() =>
    clientes.filter((c) => c.tipoServicio?.includes("paseos") && (!esEntrenador || c.paseadorNombre === nombreActual)),
    [clientes, esEntrenador, nombreActual]);

  return function itemsDelDia(key) {
    const fecha = new Date(key + "T00:00:00");
    // Misma regla que Coordinación y que el pago: incluye fechas sueltas y
    // paseos movidos, no solo los días habituales de la semana.
    const paseosDia = tiposVisibles.paseo
      ? clientesPaseo.filter((c) => estaProgramadoEnFecha(c, fecha, reprogramaciones)).map((c) => paseoComoItem(c, key, registroPaseos))
      : [];
    const citasDia = porDiaCitas[key] || [];
    return [...paseosDia, ...citasDia].sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  };
}

// Pastillas para mostrar/ocultar evaluaciones/clases/paseos — compartidas
// entre CalendarioAlumnos e Itinerario.
function PastillasTipoCalendario({ tiposVisibles, toggleTipoVisible }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
      {TIPOS_CALENDARIO_VISTA.map((t) => {
        const activo = tiposVisibles[t.id];
        return (
          <button key={t.id} onClick={() => toggleTipoVisible(t.id)}
            style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: activo ? `1.5px solid ${t.color}` : "1px solid #DCD2B4",
              background: activo ? t.bg : "#FFFFFF", color: activo ? t.color : "#8A7E5C", fontWeight: activo ? 600 : 400 }}>
            {t.nombre}
          </button>
        );
      })}
    </div>
  );
}

// Calendario del mes con evaluaciones, clases y paseos — se usa tanto
// como sub-vista de Alumnos (con "onVolver") como pestaña propia
// "Calendario" en el menú (sin "onVolver", vista completa y celdas más
// grandes para que se divise bien). Los 3 tipos se pueden mostrar u
// ocultar por separado con las pastillas de arriba; con las 3 activas se
// ven todos juntos en el mismo calendario.
export function CalendarioAlumnos({ citasAgenda, setCitas, clientes = [], setClientes, registroPaseos = {}, reprogramaciones = [], rolActual, nombreActual, onVolver }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mesIdx, setMesIdx] = useState(hoy.getMonth());
  const [diaSel, setDiaSel] = useState(null);
  const [citaSel, setCitaSel] = useState(null);
  const [tiposVisibles, setTiposVisibles] = useState({ evaluacion: true, clase: true, paseo: true });

  const { horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin } = useConfigItinerario();

  function toggleTipoVisible(id) {
    setTiposVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const itemsDelDia = useItemsPorDia({ citasAgenda, clientes, registroPaseos, rolActual, nombreActual, tiposVisibles, reprogramaciones });

  const primerDiaMes = new Date(anio, mesIdx, 1);
  const diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
  const offset = (primerDiaMes.getDay() + 6) % 7; // 0 = lunes
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];
  const nombreMes = primerDiaMes.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const gruposItinerario = diaSel ? construirItinerarioDia(itemsDelDia(diaSel), { horaInicioPaseos, duracionPaseoMin, trayectoMin }) : [];

  function cambiarMes(delta) {
    let m = mesIdx + delta, a = anio;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMesIdx(m); setAnio(a); setDiaSel(null);
  }

  return (
    <div>
      {onVolver && <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18 }}>← Volver a Alumnos</button>}
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ ...sectionTitle, textTransform: "capitalize", fontSize: 20 }}>{nombreMes}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cambiarMes(-1)} style={botonSecundario}>←</button>
            <button onClick={() => cambiarMes(1)} style={botonSecundario}>→</button>
          </div>
        </div>
        <p style={{ ...hint, marginTop: -8, marginBottom: 14 }}>Clientes por atender este mes — clic en un día para ver el itinerario completo, o directo en un nombre para ver ese detalle.</p>
        <PastillasTipoCalendario tiposVisibles={tiposVisibles} toggleTipoVisible={toggleTipoVisible} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, fontSize: 12, color: "#8A7E5C", textAlign: "center", marginBottom: 8 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="howria-cal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {celdas.map((dia, i) => {
            if (!dia) return <div key={`vacio-${i}`} />;
            const key = fechaKey(new Date(anio, mesIdx, dia));
            const itemsDia = itemsDelDia(key);
            const esHoy = key === fechaKey(hoy);
            return (
              <div key={key} className="howria-cal-celda" role="button" tabIndex={0}
                onClick={() => setDiaSel(key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDiaSel(key); } }}
                style={{ borderRadius: 8, border: diaSel === key ? `1.5px solid ${NAVY}` : esHoy ? `1.5px solid ${GOLD}` : "1px solid #EDE4CE",
                  background: itemsDia.length > 0 ? "#FBF6E9" : "#FFFFFF", padding: 6, display: "flex", flexDirection: "column", gap: 3, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: esHoy ? 700 : 400, color: esHoy ? GOLD : INK }}>{dia}</span>
                  {itemsDia.length > 0 && <span className="howria-cal-punto" style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, flex: "none" }} />}
                </div>
                <div className="howria-cal-nombres" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {itemsDia.slice(0, 2).map((c) => {
                    const tono = TIPOS_CALENDARIO_VISTA.find((t) => t.id === c.tipo);
                    return (
                      <button key={c.id} onClick={(e) => { e.stopPropagation(); setCitaSel(c); }}
                        style={{ border: "none", background: tono?.bg || "#EDE4CE", color: tono?.color || INK,
                          borderRadius: 4, padding: "2px 5px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.perro}
                      </button>
                    );
                  })}
                  {itemsDia.length > 2 && (
                    <span style={{ fontSize: 10, color: "#8A7E5C", paddingLeft: 5 }}>+{itemsDia.length - 2} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {diaSel && (
        <ModalItinerarioDia
          fechaLabel={new Date(diaSel + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          diaKey={diaSel}
          grupos={gruposItinerario}
          citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes}
          horaInicioPaseos={horaInicioPaseos} setHoraInicioPaseos={setHoraInicioPaseos}
          duracionPaseoMin={duracionPaseoMin} setDuracionPaseoMin={setDuracionPaseoMin}
          trayectoMin={trayectoMin} setTrayectoMin={setTrayectoMin}
          onVerDetalle={(it) => setCitaSel(it)}
          onCerrar={() => setDiaSel(null)}
        />
      )}
      {citaSel && <ModalDetalleCita cita={citaSel} onCerrar={() => setCitaSel(null)} onEliminar={setCitas ? (dbId) => eliminarCita(setCitas, dbId) : undefined} />}
    </div>
  );
}

// Pestaña "Itinerario" — el mismo itinerario de un día que se abre al
// clicar un día en Calendario, pero directo como contenido de la
// pestaña (sin pasar por el mes ni por una ventana), con flechas/fecha
// para moverse de día. Mismos datos y misma lógica que CalendarioAlumnos
// (useConfigItinerario/useItemsPorDia/construirItinerarioDia
// compartidos), así que un fix ahí también aplica acá.
export function Itinerario({ citasAgenda, setCitas, clientes = [], setClientes, registroPaseos = {}, reprogramaciones = [], rolActual, nombreActual }) {
  const [diaSel, setDiaSel] = useState(() => fechaKey(new Date()));
  const [citaSel, setCitaSel] = useState(null);
  const [tiposVisibles, setTiposVisibles] = useState({ evaluacion: true, clase: true, paseo: true });

  const { horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin } = useConfigItinerario();

  function toggleTipoVisible(id) {
    setTiposVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const itemsDelDia = useItemsPorDia({ citasAgenda, clientes, registroPaseos, rolActual, nombreActual, tiposVisibles, reprogramaciones });
  const grupos = construirItinerarioDia(itemsDelDia(diaSel), { horaInicioPaseos, duracionPaseoMin, trayectoMin });
  const fechaLabel = new Date(diaSel + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  function cambiarDia(delta) {
    const d = new Date(diaSel + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDiaSel(fechaKey(d));
  }

  return (
    <div>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ ...sectionTitle, textTransform: "capitalize", fontSize: 20 }}>{fechaLabel}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button onClick={() => cambiarDia(-1)} style={botonSecundario}>← Día anterior</button>
            <button onClick={() => setDiaSel(fechaKey(new Date()))} style={botonSecundario}>Hoy</button>
            <input type="date" value={diaSel} onChange={(e) => e.target.value && setDiaSel(e.target.value)} style={{ ...input, margin: 0, width: 150, flex: "1 1 130px" }} />
            <button onClick={() => cambiarDia(1)} style={botonSecundario}>Día siguiente →</button>
          </div>
        </div>
        <PastillasTipoCalendario tiposVisibles={tiposVisibles} toggleTipoVisible={toggleTipoVisible} />
        <ContenidoItinerarioDia grupos={grupos} diaKey={diaSel} citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes}
          horaInicioPaseos={horaInicioPaseos} setHoraInicioPaseos={setHoraInicioPaseos}
          duracionPaseoMin={duracionPaseoMin} setDuracionPaseoMin={setDuracionPaseoMin}
          trayectoMin={trayectoMin} setTrayectoMin={setTrayectoMin}
          onVerDetalle={(it) => setCitaSel(it)} />
      </div>
      {citaSel && <ModalDetalleCita cita={citaSel} onCerrar={() => setCitaSel(null)} onEliminar={setCitas ? (dbId) => eliminarCita(setCitas, dbId) : undefined} />}
    </div>
  );
}

// La pestaña "Calendario" del menú: un selector Mes / Día y abajo la
// vista elegida. Antes esto eran dos entradas separadas del menú
// ("Calendario" e "Itinerario") para lo que en realidad es el mismo dato
// con distinto zoom — la de día nació como "el modal que se abre al
// clicar un día", puesta directo como pestaña.
//
// El selector usa el mismo patrón de Clientes (Paseos/Adiestramiento) y
// de Boletas, que es el que ya está probado en la app.
//
// La elección se recuerda en localStorage porque cada persona usa una:
// coordinación vive en el día, y el mes se mira para planificar. Que te
// devuelva a la vista equivocada en cada entrada sería molesto.
const CLAVE_VISTA_CALENDARIO = "howria_calendario_vista";

export function PestanaCalendario(props) {
  const [vista, setVista] = useState(() => {
    try {
      const guardada = localStorage.getItem(CLAVE_VISTA_CALENDARIO);
      return guardada === "dia" || guardada === "mes" ? guardada : "mes";
    } catch {
      return "mes";
    }
  });

  function elegir(v) {
    setVista(v);
    try { localStorage.setItem(CLAVE_VISTA_CALENDARIO, v); } catch {}
  }

  return (
    <div>
      <div role="group" aria-label="Vista del calendario" style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[
          { id: "mes", nombre: "Mes" },
          { id: "dia", nombre: "Día" },
        ].map((v) => {
          const activo = vista === v.id;
          return (
            <button key={v.id} type="button" onClick={() => elegir(v.id)} aria-pressed={activo}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10, cursor: "pointer", fontSize: 14, minHeight: 46,
                border: "none", fontWeight: activo ? 700 : 500,
                background: activo ? NAVY : CREAM_SOFT, color: activo ? CREAM : INK,
              }}>
              {v.nombre}
            </button>
          );
        })}
      </div>
      {/* Sin onVolver a propósito: acá es la pestaña completa, no la
          sub-vista de Alumnos. */}
      {vista === "mes" ? <CalendarioAlumnos {...props} /> : <Itinerario {...props} />}
    </div>
  );
}
