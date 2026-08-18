// Pestaña Equipo — objetivos semanales/mensuales y tareas internas del
// staff. Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { Users } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, DIAS_SEMANA, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, Spinner, FilaLista, BotonEliminar, fechaKey, rangoPeriodo,
} from "../HowriaAdmin.jsx";

export function EquipoTrabajo({ usuarios, objetivos = [], setObjetivos, objetivosMensuales = [], setObjetivosMensuales, tareas = [], setTareas, cargando, esAdmin = false }) {
  const hoy = new Date();
  const [semanaOffset, setSemanaOffset] = useState(0);
  const fechaRef = useMemo(() => { const d = new Date(hoy); d.setDate(d.getDate() + semanaOffset * 7); return d; }, [semanaOffset]);
  const { desde, hasta, etiqueta } = rangoPeriodo("semana", fechaRef);
  const semanaKey = fechaKey(desde);
  const mesKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [vistaObjetivos, setVistaObjetivos] = useState("semana");
  const [nuevoObjetivoMes, setNuevoObjetivoMes] = useState("");
  const [asignadoObjetivoMes, setAsignadoObjetivoMes] = useState("");

  const [nuevoObjetivo, setNuevoObjetivo] = useState("");
  const [asignadoObjetivo, setAsignadoObjetivo] = useState("");
  const [diaSeleccionado, setDiaSeleccionado] = useState((hoy.getDay() + 6) % 7);
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [asignadoTarea, setAsignadoTarea] = useState("");
  const [enlaceTarea, setEnlaceTarea] = useState("");
  // Antes solo se podía marcar completo o eliminar — un error de tipeo
  // significaba borrar y recrear, perdiendo si ya se había completado.
  const [editando, setEditando] = useState(null); // { tipo: "objetivo" | "objetivoMes" | "tarea", id }
  const [textoEdit, setTextoEdit] = useState("");

  function iniciarEdicion(tipo, id, textoActual) {
    setEditando({ tipo, id });
    setTextoEdit(textoActual);
  }
  function cancelarEdicion() {
    setEditando(null);
    setTextoEdit("");
  }
  function guardarEdicion() {
    if (!textoEdit.trim() || !editando) return;
    const setters = { objetivo: setObjetivos, objetivoMes: setObjetivosMensuales, tarea: setTareas };
    const campo = editando.tipo === "tarea" ? "titulo" : "texto";
    setters[editando.tipo]((prev) => prev.map((x) => (x.id === editando.id ? { ...x, [campo]: textoEdit.trim() } : x)));
    cancelarEdicion();
  }

  const diasSemanaVista = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(desde); d.setDate(d.getDate() + i); return d; }), [desde]);

  // Fila compartida por las 3 listas (objetivos semana/mes, tareas) — antes
  // solo se podía marcar completo o eliminar, así que un error de tipeo
  // significaba borrar y recrear, perdiendo el historial de si ya se
  // había completado.
  function FilaEditable({ item, tipo, campo, marcado, onToggle, onEliminar, extra }) {
    const enEdicion = editando?.tipo === tipo && editando.id === item.id;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: marcado ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 8, gap: 10 }}>
        {enEdicion ? (
          <>
            <input value={textoEdit} onChange={(e) => setTextoEdit(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") guardarEdicion(); if (e.key === "Escape") cancelarEdicion(); }} autoFocus
              style={{ ...input, marginBottom: 0, flex: 1 }} />
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={guardarEdicion} disabled={!textoEdit.trim()}
                style={{ border: "none", background: NAVY, color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer", opacity: !textoEdit.trim() ? 0.5 : 1 }}>
                Guardar
              </button>
              <button onClick={cancelarEdicion} style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
          </>
        ) : (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
              <input type="checkbox" checked={marcado} onChange={onToggle} />
              <span style={{ fontSize: 13.5, textDecoration: marcado ? "line-through" : "none", color: marcado ? "#5C5442" : INK }}>
                {item[campo]} {item.asignadoA && <span style={{ color: "#8A7E5C", fontSize: 12 }}>· {item.asignadoA}</span>}
                {extra}
              </span>
            </label>
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              <button onClick={() => iniciarEdicion(tipo, item.id, item[campo])} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                Editar
              </button>
              <BotonEliminar onConfirm={onEliminar} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
            </div>
          </>
        )}
      </div>
    );
  }

  const objetivosSemana = objetivos.filter((o) => o.semanaKey === semanaKey);
  const tareasSemana = tareas.filter((t) => { const f = new Date(t.fechaISO); return f >= desde && f < hasta; });
  const tareasDelDia = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(diasSemanaVista[diaSeleccionado]));

  function agregarObjetivo() {
    if (!nuevoObjetivo.trim()) return;
    setObjetivos((prev) => [...prev, { id: Date.now(), texto: nuevoObjetivo.trim(), asignadoA: asignadoObjetivo, semanaKey, cumplido: false }]);
    setNuevoObjetivo(""); setAsignadoObjetivo("");
  }
  function toggleObjetivo(id) {
    setObjetivos((prev) => prev.map((o) => (o.id === id ? { ...o, cumplido: !o.cumplido } : o)));
  }
  function eliminarObjetivo(id) {
    setObjetivos((prev) => prev.filter((o) => o.id !== id));
  }

  const objetivosDelMes = objetivosMensuales.filter((o) => o.mesKey === mesKey);
  function agregarObjetivoMes() {
    if (!nuevoObjetivoMes.trim()) return;
    setObjetivosMensuales((prev) => [...prev, { id: Date.now(), texto: nuevoObjetivoMes.trim(), asignadoA: asignadoObjetivoMes, mesKey, cumplido: false }]);
    setNuevoObjetivoMes(""); setAsignadoObjetivoMes("");
  }
  function toggleObjetivoMes(id) {
    setObjetivosMensuales((prev) => prev.map((o) => (o.id === id ? { ...o, cumplido: !o.cumplido } : o)));
  }
  function eliminarObjetivoMes(id) {
    setObjetivosMensuales((prev) => prev.filter((o) => o.id !== id));
  }

  // Antes un enlace sin "http(s)://" (ej. pegar solo "docs.google.com/...")
  // se guardaba tal cual y producía un link roto al tocarlo.
  function normalizarEnlace(valor) {
    const v = valor.trim();
    if (!v) return "";
    return /^https?:\/\//i.test(v) ? v : `https://${v}`;
  }

  function agregarTarea() {
    if (!nuevaTarea.trim()) return;
    setTareas((prev) => [...prev, { id: Date.now(), titulo: nuevaTarea.trim(), asignadoA: asignadoTarea, enlace: normalizarEnlace(enlaceTarea), fechaISO: diasSemanaVista[diaSeleccionado].toISOString(), estado: "pendiente" }]);
    setNuevaTarea(""); setAsignadoTarea(""); setEnlaceTarea("");
  }
  function toggleTarea(id) {
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado: t.estado === "hecho" ? "pendiente" : "hecho" } : t)));
  }
  function eliminarTarea(id) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
  }

  const progresoPorPersona = usuarios.map((p) => {
    const suyas = tareasSemana.filter((t) => t.asignadoA === p.nombre);
    const hechas = suyas.filter((t) => t.estado === "hecho").length;
    return { persona: p.nombre, total: suyas.length, hechas };
  });
  const totalTareasSemana = tareasSemana.length;
  const totalHechasSemana = tareasSemana.filter((t) => t.estado === "hecho").length;
  const objetivosCumplidos = objetivosSemana.filter((o) => o.cumplido).length;

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando equipo…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Equipo Howria</h2>
            <p style={hint}>Objetivos de la semana, tareas del día a día, y quién lleva qué. Trabajo semana a semana.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSemanaOffset((s) => s - 1)} style={botonSecundario}>← Semana anterior</button>
            <button onClick={() => setSemanaOffset(0)} disabled={semanaOffset === 0} style={{ ...botonSecundario, opacity: semanaOffset === 0 ? 0.5 : 1 }}>Esta semana</button>
            <button onClick={() => setSemanaOffset((s) => Math.min(s + 1, 0))} disabled={semanaOffset >= 0} style={{ ...botonSecundario, opacity: semanaOffset >= 0 ? 0.5 : 1 }}>Siguiente →</button>
          </div>
        </div>
        <p style={{ ...hint, marginTop: 10 }}>Semana: <b style={{ color: NAVY }}>{etiqueta}</b></p>

        <p style={{ ...label, marginTop: 16 }}>Equipo</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {usuarios.map((persona) => (
            <span key={persona.id} style={{ padding: "6px 14px", borderRadius: 20, background: CREAM_SOFT, color: NAVY, fontSize: 13, fontWeight: 600 }}>{persona.nombre}</span>
          ))}
        </div>
        <p style={hint}>{esAdmin ? 'Para agregar o sacar a alguien del equipo, hazlo desde la pestaña "Usuarios".' : "Para agregar o sacar a alguien del equipo, pídeselo a un administrador — esa pestaña es solo suya."}</p>
      </div>

      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={sectionTitle}>Objetivos</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setVistaObjetivos("semana")} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", border: vistaObjetivos === "semana" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4", background: vistaObjetivos === "semana" ? NAVY : "#FFFFFF", color: vistaObjetivos === "semana" ? CREAM : INK }}>Semana</button>
            <button onClick={() => setVistaObjetivos("mes")} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", border: vistaObjetivos === "mes" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4", background: vistaObjetivos === "mes" ? NAVY : "#FFFFFF", color: vistaObjetivos === "mes" ? CREAM : INK }}>Mes</button>
          </div>
        </div>

        {vistaObjetivos === "semana" ? (
          <>
            <p style={hint}>{objetivosCumplidos} de {objetivosSemana.length} objetivos de la semana cumplidos.</p>
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              {objetivosSemana.map((o) => (
                <FilaEditable key={o.id} item={o} tipo="objetivo" campo="texto" marcado={o.cumplido}
                  onToggle={() => toggleObjetivo(o.id)} onEliminar={() => eliminarObjetivo(o.id)} />
              ))}
              {objetivosSemana.length === 0 && <p style={{ ...hint, marginTop: 4 }}>Todavía no hay objetivos para esta semana.</p>}
            </div>

            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
              <input placeholder="Nuevo objetivo de la semana" value={nuevoObjetivo} onChange={(e) => setNuevoObjetivo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={asignadoObjetivo} onChange={(e) => setAsignadoObjetivo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option value="">Equipo (todos)</option>
                {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivo} disabled={!nuevoObjetivo.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevoObjetivo.trim() ? 0.5 : 1 }}>Agregar</button>
            </div>
          </>
        ) : (
          <>
            <p style={hint}>{objetivosDelMes.filter((o) => o.cumplido).length} de {objetivosDelMes.length} objetivos del mes cumplidos — para metas más largas, no solo semanales.</p>
            <p style={{ ...hint, marginTop: -8, fontSize: 11.5 }}>Siempre es el mes calendario actual — el navegador de semana de arriba no le aplica.</p>
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              {objetivosDelMes.map((o) => (
                <FilaEditable key={o.id} item={o} tipo="objetivoMes" campo="texto" marcado={o.cumplido}
                  onToggle={() => toggleObjetivoMes(o.id)} onEliminar={() => eliminarObjetivoMes(o.id)} />
              ))}
              {objetivosDelMes.length === 0 && <p style={{ ...hint, marginTop: 4 }}>Todavía no hay objetivos para este mes.</p>}
            </div>

            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
              <input placeholder="Nuevo objetivo del mes" value={nuevoObjetivoMes} onChange={(e) => setNuevoObjetivoMes(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={asignadoObjetivoMes} onChange={(e) => setAsignadoObjetivoMes(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option value="">Equipo (todos)</option>
                {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivoMes} disabled={!nuevoObjetivoMes.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevoObjetivoMes.trim() ? 0.5 : 1 }}>Agregar</button>
            </div>
          </>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Tareas diarias</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 16, flexWrap: "wrap" }}>
          {diasSemanaVista.map((d, i) => {
            const total = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(d)).length;
            const hechas = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(d) && t.estado === "hecho").length;
            return (
              <button key={i} onClick={() => setDiaSeleccionado(i)}
                style={{ padding: "10px 8px", minWidth: 70, borderRadius: 8, cursor: "pointer", textAlign: "center",
                  border: diaSeleccionado === i ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                  background: diaSeleccionado === i ? NAVY : "#FFFFFF", color: diaSeleccionado === i ? CREAM : INK }}>
                <div style={{ fontSize: 11, textTransform: "uppercase" }}>{DIAS_SEMANA[i]} {d.getDate()}</div>
                <div style={{ fontSize: 11, marginTop: 2, color: diaSeleccionado === i ? "#9BAAB8" : "#8A7E5C" }}>{hechas}/{total}</div>
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 16 }}>
          {tareasDelDia.map((t) => (
            <FilaEditable key={t.id} item={t} tipo="tarea" campo="titulo" marcado={t.estado === "hecho"}
              onToggle={() => toggleTarea(t.id)} onEliminar={() => eliminarTarea(t.id)}
              extra={t.enlace && <> · <a href={t.enlace} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#1F5C8A" }}>🔗 documento</a></>} />
          ))}
          {tareasDelDia.length === 0 && <p style={hint}>No hay tareas para este día.</p>}
        </div>

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10 }}>
          <input placeholder="Nueva tarea para este día" value={nuevaTarea} onChange={(e) => setNuevaTarea(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <select value={asignadoTarea} onChange={(e) => setAsignadoTarea(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option value="">Sin asignar</option>
            {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
          <input placeholder="Enlace a documento (opcional)" value={enlaceTarea} onChange={(e) => setEnlaceTarea(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <button onClick={agregarTarea} disabled={!nuevaTarea.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevaTarea.trim() ? 0.5 : 1 }}>Agregar</button>
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Progreso de la semana</h2>
        <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18, margin: "14px 0 20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Tareas completadas</p>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 22, fontFamily: "Georgia, serif" }}>{totalHechasSemana} / {totalTareasSemana}</p>
        </div>
        <p style={label}>Por persona</p>
        {progresoPorPersona.map((p) => (
          <FilaLista key={p.persona} Icono={Users} titulo={p.persona} valor={`${p.hechas} / ${p.total} tareas`} />
        ))}
      </div>
    </div>
  );
}
