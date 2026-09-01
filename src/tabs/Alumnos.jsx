// Pestaña Alumnos — seguimiento de clases de adiestramiento (planes,
// checklist, ficha de ingreso). Ver src/HowriaAdmin.jsx (React.lazy) por
// la lista completa de pestañas y src/tabs/_compartido.jsx para lo compartido.
import { useState, useMemo, useEffect } from "react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, TEMARIO_ADIESTRAMIENTO,
  tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario, SkeletonLista,
  ModalConfirmacion, fmtCLP, fechaKey, showToast, comprimirFotoPerfil, clienteEstaCerrado, tipoServicioComoAlumno,
} from "../HowriaAdmin.jsx";
import { hayChoqueHorario, fechaISOaInputLocal, SeccionPlegable } from "./_compartido.jsx";
import { supabase } from "../lib/supabaseClient.js";
// Alumnos incrusta el calendario del mes como una de sus vistas ("Ver
// calendario") — mismos datos, mismo componente que usa la pestaña
// Calendario independiente.
import { CalendarioAlumnos } from "./CalendarioItinerario.jsx";

const TEMAS_ADIESTRAMIENTO_FLAT = TEMARIO_ADIESTRAMIENTO.flatMap((g) => g.temas);
function nombreTema(id) {
  return TEMAS_ADIESTRAMIENTO_FLAT.find((t) => t.id === id)?.nombre || id;
}

// Selector de temas agrupado por categoría — mismo botón-pastilla que ya
// usa TAGS_TEMPERAMENTO en mascotas, pero con encabezado de grupo. Se
// reusa tanto en la ficha de ingreso (temasObjetivo) como al marcar una
// clase (temas trabajados ese día).
function SelectorTemas({ seleccionados, onToggle, compacto = false }) {
  return (
    <>
      {TEMARIO_ADIESTRAMIENTO.map((grupo) => (
        <div key={grupo.grupo} style={{ marginBottom: compacto ? 6 : 10 }}>
          <p style={{ margin: "0 0 5px", fontSize: compacto ? 11.5 : 12.5, fontWeight: 600, color: INK }}>{grupo.grupo}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: compacto ? 5 : 6 }}>
            {grupo.temas.map((t) => {
              const activo = seleccionados.includes(t.id);
              return (
                <button key={t.id} type="button" onClick={() => onToggle(t.id)} aria-pressed={activo}
                  style={{ padding: compacto ? "4px 10px" : "6px 12px", borderRadius: 20, fontSize: compacto ? 11 : 12, cursor: "pointer",
                    border: activo ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                    background: activo ? NAVY : "#FFFFFF", color: activo ? CREAM : INK }}>
                  {t.nombre}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function FormularioIngresoAlumno({ inicial, entrenadores, esEntrenador, nombreActual, onGuardar, onCancelar, candidatosEvaluacion = [] }) {
  const [form, setForm] = useState(() => inicial
    ? { id: inicial.id, nombre: inicial.nombre || "", perro: inicial.perro || "", telefono: inicial.telefono || "", email: inicial.email || "",
        comuna: inicial.comuna || "", edad: inicial.edad || "", adiestradorNombre: inicial.adiestradorNombre || (esEntrenador ? nombreActual : ""),
        temasObjetivo: inicial.temasObjetivo || [], fotoUrl: inicial.fotoUrl || null }
    : { nombre: "", perro: "", telefono: "", email: "", comuna: "", edad: "", adiestradorNombre: esEntrenador ? nombreActual : "", temasObjetivo: [], fotoUrl: null });
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const formInvalido = !form.nombre.trim() || !form.perro.trim();

  // Al elegir a alguien de evaluación se copian sus datos y se guarda su
  // id: eso es lo que hace que al guardar se actualice su ficha en vez de
  // crear otra. Volver a "desde cero" limpia todo, id incluido.
  function elegirDesdeEvaluacion(valor) {
    if (!valor) {
      setForm({ nombre: "", perro: "", telefono: "", email: "", comuna: "", edad: "", adiestradorNombre: esEntrenador ? nombreActual : "", temasObjetivo: [], fotoUrl: null });
      return;
    }
    const c = candidatosEvaluacion.find((x) => String(x.id) === String(valor));
    if (!c) return;
    setForm({
      id: c.id,
      nombre: c.nombre || "", perro: c.perro || "", telefono: c.telefono || "", email: c.email || "",
      comuna: c.comuna || "", edad: c.edad || "",
      adiestradorNombre: c.adiestradorNombre || (esEntrenador ? nombreActual : ""),
      temasObjetivo: c.temasObjetivo || [], fotoUrl: c.fotoUrl || null,
    });
  }

  function toggleTema(id) {
    setForm((prev) => ({ ...prev, temasObjetivo: prev.temasObjetivo.includes(id) ? prev.temasObjetivo.filter((t) => t !== id) : [...prev.temasObjetivo, id] }));
  }

  async function subirFotoAlumno(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fotoUrl = await comprimirFotoPerfil(file);
    setForm((f) => ({ ...f, fotoUrl }));
  }

  function guardar() {
    setIntentoGuardar(true);
    if (formInvalido) return;
    onGuardar(form);
  }

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>{inicial ? "Editar ficha" : "Ficha de ingreso"}</h2>
      <p style={hint}>Datos del alumno y con qué objetivo llega — se usan para armar su caso de adiestramiento.</p>

      {/* Casi siempre el alumno nuevo YA es cliente: vino a evaluación por
          el link público y quedó registrado. Elegirlo acá rellena sus
          datos y, sobre todo, guarda sobre su ficha en vez de crear una
          segunda — antes la única opción era escribirlo todo de nuevo y
          quedaban dos fichas de la misma persona. */}
      {!inicial && candidatosEvaluacion.length > 0 && (
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 14, marginTop: 16 }}>
          <label style={label} htmlFor="alumno-desde-evaluacion">¿Ya vino a evaluación?</label>
          <select id="alumno-desde-evaluacion" value={form.id || ""} onChange={(e) => elegirDesdeEvaluacion(e.target.value)}
            style={{ ...input, marginBottom: 0 }}>
            <option value="">No — cargar un alumno desde cero</option>
            {candidatosEvaluacion.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>
            ))}
          </select>
          {form.id ? (
            <p style={{ ...hint, margin: "8px 0 0" }}>
              Se rellenaron sus datos. Al guardar se actualiza <b>su ficha</b> y pasa a clases — no se crea una nueva.
            </p>
          ) : (
            <p style={{ ...hint, margin: "8px 0 0" }}>
              Si la persona ya vino a evaluación, elígela acá para no dejar dos fichas de la misma.
            </p>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", flex: "none", background: form.fotoUrl ? `url(${form.fotoUrl}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
          {!form.fotoUrl && "Foto"}
        </div>
        <label style={{ ...botonSecundario, display: "inline-block", padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
          Subir foto
          <input type="file" accept="image/*" onChange={subirFotoAlumno} style={{ display: "none" }} />
        </label>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div>
          <label style={label} htmlFor="alumno-perro">Nombre del perro</label>
          <input id="alumno-perro" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-tutor">Tutor</label>
          <input id="alumno-tutor" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={label} htmlFor="alumno-telefono">Teléfono</label>
          <input id="alumno-telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-email">Correo</label>
          <input id="alumno-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={label} htmlFor="alumno-comuna">Comuna</label>
          <input id="alumno-comuna" value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-edad">Edad del perro</label>
          <input id="alumno-edad" placeholder="Ej. 3 meses, 2 años" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>

      <p style={{ ...label, marginTop: 16 }}>Entrenador asignado</p>
      <select value={form.adiestradorNombre} disabled={esEntrenador} onChange={(e) => setForm({ ...form, adiestradorNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {entrenadores.map((en) => <option key={en.id} value={en.nombre}>{en.nombre}</option>)}
      </select>

      <p style={label}>Servicio / objetivo de ingreso</p>
      <SelectorTemas seleccionados={form.temasObjetivo} onToggle={toggleTema} />

      {intentoGuardar && formInvalido && (
        <p style={{ color: RUST, fontSize: 12.5, margin: "10px 0 0" }}>Falta el nombre del perro y/o del tutor — son obligatorios para guardar.</p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, marginTop: 0, opacity: intentoGuardar && formInvalido ? 0.6 : 1 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

function BarraProgreso({ pct }) {
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 4, background: "#EDE4CE", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: pct >= 100 ? "#2F6A46" : GOLD, borderRadius: 4 }} />
    </div>
  );
}

// Una fila del checklist ("Evaluación" o "Clase N") — el casillero es un
// toggle directo (clic = marcar hecha hoy / clic de nuevo = deshacer, sin
// pedir confirmación, como cualquier casillero de una lista de tareas).
// "+ Detalle" es aparte y opcional, para quien quiera anotar fecha
// distinta, qué se trabajó o alguna nota — no es obligatorio completarlo.
function FilaChecklist({ etiqueta, existente, citaProgramada, onMarcarRapido, onDeshacer, onAbrirDetalle, onAbrirAgendar, onCancelarAgenda }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 2px" }}>
      <button onClick={() => (existente ? onDeshacer() : onMarcarRapido())} aria-pressed={!!existente}
        title={existente ? "Deshacer" : "Marcar realizada"}
        style={{ width: 20, height: 20, borderRadius: 5, marginTop: 1, border: existente ? "none" : "1.5px solid #C9BE9E",
          background: existente ? "#2F6A46" : "#FFFFFF", color: "#FFFFFF", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 12, lineHeight: 1, padding: 0 }}>
        {existente ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: existente ? "#2F6A46" : INK, fontWeight: existente ? 600 : 400 }}>{etiqueta}</span>
        {existente && <span style={{ marginLeft: 8, fontSize: 11, color: "#8A7E5C" }}>{existente.fechaRealizada}</span>}
        {existente?.temas?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
            {existente.temas.map((id) => <span key={id} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>{nombreTema(id)}</span>)}
          </div>
        )}
        {existente?.notas && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#8A7E5C" }}>{existente.notas}</p>}
        {!existente && citaProgramada && (
          <>
            <p style={{ margin: "3px 0 0", fontSize: 11, color: "#1E5A7A" }}>
              📅 Agendada {new Date(citaProgramada.fechaISO).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" })}{" "}
              {new Date(citaProgramada.fechaISO).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
              {" · "}
              {/* Si el cliente ya apretó el botón del correo se ve acá: es la
                  diferencia entre una hora que está puesta y una que la
                  persona efectivamente dijo que puede. */}
              {citaProgramada.confirmadaClienteEn
                ? <span style={{ color: "#2F6A46", fontWeight: 600 }}>✓ la confirmó</span>
                : <span style={{ color: "#8A7E5C" }}>sin confirmar</span>}
              {" · "}
              <button onClick={onCancelarAgenda} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 11, padding: 0 }}>quitar</button>
            </p>
            {citaProgramada.tema && (
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7E5C" }}>Tema: {citaProgramada.tema}</p>
            )}
          </>
        )}
      </div>
      {!existente && (
        <button onClick={onAbrirAgendar} title="Fijar fecha y hora de esta clase, para que aparezca en el Calendario"
          style={{ border: "none", background: "none", color: "#1E5A7A", cursor: "pointer", fontSize: 11, flex: "none" }}>
          {citaProgramada ? "Reagendar" : "Agendar"}
        </button>
      )}
      <button onClick={onAbrirDetalle} title="Qué vio el entrenador, fecha, notas (opcional)"
        style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 11, flex: "none" }}>
        {existente ? "Editar" : "+ Detalle"}
      </button>
    </div>
  );
}

// Un plan de clases (planes_clases) con su checklist — "Evaluación" usa
// numero_clase=0 si el plan la incluye, "Clase 1..N" según numClases. El
// número de clases y si incluye evaluación se editan en cualquier
// momento (no dependen de una factura); vincular/desvincular una
// factura ya enviada es aparte, solo para referencia contable.
function PlanClases({ plan, boletasDisponibles, clasesDelPlan, marcarClase, deshacerClase, actualizarPlan, nombreActual, cliente, citasAgenda = [], setCitas }) {
  const [editando, setEditando] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(null);
  const [fechaForm, setFechaForm] = useState("");
  const [temasForm, setTemasForm] = useState([]);
  const [notasForm, setNotasForm] = useState("");
  const [agendando, setAgendando] = useState(null);
  const [fechaAgendaForm, setFechaAgendaForm] = useState("");
  const [temaAgendaForm, setTemaAgendaForm] = useState("");
  const [agendaEnVuelo, setAgendaEnVuelo] = useState(false);
  const [quitandoCita, setQuitandoCita] = useState(null);

  const total = (plan.numClases || 0) + (plan.incluyeEvaluacion ? 1 : 0);
  const hechas = clasesDelPlan.length;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
  const boletaVinculada = boletasDisponibles.find((b) => b._dbId === plan.boletaAdiestramientoId);

  function itemDe(numero) {
    return clasesDelPlan.find((cr) => cr.numeroClase === numero);
  }
  // Cita agendada (citas_agenda, tipo "clase") para esta clase puntual del
  // plan — se busca por plan_id + numero_clase, no por cliente, porque un
  // mismo cliente puede tener más de un plan a la vez.
  function citaDe(numero) {
    return citasAgenda.find((c) => c.planId === plan._dbId && c.numeroClase === numero && c.estado !== "cancelada");
  }
  // Al marcar la clase como hecha, la cita agendada (si había) ya cumplió
  // su propósito de recordatorio — se borra para que no quede un pendiente
  // fantasma en el Calendario de algo que ya está registrado acá.
  function limpiarAgendaDe(numero) {
    const cita = citaDe(numero);
    if (cita?._dbId && setCitas) setCitas((prev) => prev.filter((c) => c._dbId !== cita._dbId));
  }
  async function marcarRapido(numero) {
    await marcarClase(plan._dbId, numero, { fechaRealizada: fechaKey(new Date()), temas: [], notas: "", creadoPor: nombreActual });
    limpiarAgendaDe(numero);
  }
  function abrirDetalle(numero) {
    const existente = itemDe(numero);
    setDetalleAbierto(numero);
    setFechaForm(existente?.fechaRealizada || fechaKey(new Date()));
    setTemasForm(existente?.temas || []);
    setNotasForm(existente?.notas || "");
  }
  function toggleTemaForm(id) {
    setTemasForm((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  async function guardarDetalle() {
    await marcarClase(plan._dbId, detalleAbierto, { fechaRealizada: fechaForm, temas: temasForm, notas: notasForm, creadoPor: nombreActual });
    limpiarAgendaDe(detalleAbierto);
    setDetalleAbierto(null);
  }
  function abrirAgendar(numero) {
    const cita = citaDe(numero);
    setAgendando(numero);
    setFechaAgendaForm(cita ? fechaISOaInputLocal(cita.fechaISO) : "");
    setTemaAgendaForm(cita?.tema || "");
  }
  // Agendar pasa por el servidor y no por un setCitas directo: además de
  // crear la cita, le manda al cliente el correo con el botón para
  // confirmar, y ese correo necesita el token que la fila recién tiene
  // cuando está guardada. Un 502 significa que la cita SÍ quedó y solo
  // falló el correo, así que igual hay que reflejarla en pantalla.
  async function guardarAgenda() {
    if (agendaEnVuelo) return;
    if (!fechaAgendaForm || !cliente?.adiestradorNombre || !setCitas) return;
    if (new Date(fechaAgendaForm).getTime() <= Date.now()) {
      showToast("La fecha y hora deben ser en el futuro.");
      return;
    }
    const existenteCita = citaDe(agendando);
    if (hayChoqueHorario(citasAgenda.filter((c) => !existenteCita || c._dbId !== existenteCita._dbId), cliente.adiestradorNombre, fechaAgendaForm)) {
      showToast(`${cliente.adiestradorNombre} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    const iso = new Date(fechaAgendaForm).toISOString();
    const tema = temaAgendaForm.trim();
    setAgendaEnVuelo(true);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/mover-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          accion: "agendar",
          citaId: existenteCita?._dbId || null, clienteId: cliente._dbId,
          planId: plan._dbId, numeroClase: agendando,
          adiestrador: cliente.adiestradorNombre, fechaISO: iso, tema,
        }),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo agendar la clase.");
        return;
      }
      const fila = resultado.cita;
      if (existenteCita?._dbId) {
        setCitas((prev) => prev.map((c) => (c._dbId === existenteCita._dbId
          ? { ...c, fechaISO: iso, tema, confirmadaClienteEn: null } : c)));
      } else if (fila) {
        // Llega con _dbId, así que el hook de sincronización no lo vuelve
        // a insertar (y realtime, si alcanza a avisar antes, lo reconoce
        // por ese mismo id en vez de duplicarlo).
        setCitas((prev) => [...prev, {
          id: Date.now(), _dbId: fila.id,
          clienteId: cliente._dbId, clienteNombre: cliente.nombre, perro: cliente.perro,
          email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion,
          tipo: "clase", adiestrador: cliente.adiestradorNombre, fechaISO: iso,
          estado: "agendada", origen: "staff", notas: "", tema, confirmadaClienteEn: null,
          planId: plan._dbId, numeroClase: agendando,
        }]);
      }
      setAgendando(null);
      if (resp.status === 502) showToast(resultado.error);
      else if (resultado.aviso) showToast(resultado.aviso);
      else showToast("Clase agendada — le llegó el correo para confirmar.", "exito");
    } catch {
      showToast("No se pudo conectar — revisa tu conexión.");
    } finally {
      setAgendaEnVuelo(false);
    }
  }
  // Quitar una clase agendada tiene dos caminos, y la diferencia es si el
  // cliente ya dijo "ahí estaré" desde el botón del correo:
  //
  //   - Si NO confirmó, la cita era un recordatorio interno y se borra,
  //     igual que siempre.
  //   - Si SÍ confirmó, hay una persona que cuenta con esa hora. Ahí no
  //     puede desaparecer en silencio: se cancela de verdad (la fila
  //     queda con estado "cancelada", así hay registro de que existió) y
  //     se le avisa por correo.
  //
  // La cancelación pasa por api/cancelar-cita.js, el mismo endpoint que
  // usa la ficha del cliente — no hay uno nuevo. Y como citaDe() ignora
  // las canceladas, la clase vuelve a verse como no agendada sola.
  function cancelarAgenda(numero) {
    const cita = citaDe(numero);
    if (!cita?._dbId || !setCitas) return;
    if (!cita.confirmadaClienteEn) {
      setCitas((prev) => prev.filter((c) => c._dbId !== cita._dbId));
      return;
    }
    setQuitandoCita(cita);
  }

  async function confirmarQuitarCita() {
    const cita = quitandoCita;
    if (!cita || agendaEnVuelo) return;
    setAgendaEnVuelo(true);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/cancelar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ citaId: cita._dbId, accion: "cancelar" }),
      });
      const resultado = await resp.json().catch(() => ({}));
      // 502 = la cita SÍ quedó cancelada y solo falló el correo, así que
      // igual hay que reflejarlo en pantalla.
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo cancelar la clase.");
        return;
      }
      setCitas((prev) => prev.map((c) => (c._dbId === cita._dbId ? { ...c, estado: "cancelada" } : c)));
      setQuitandoCita(null);
      if (resp.status === 502) showToast(resultado.error);
      else showToast("Clase cancelada — se le avisó al cliente por correo.", "exito");
    } catch {
      showToast("No se pudo conectar — revisa tu conexión.");
    } finally {
      setAgendaEnVuelo(false);
    }
  }

  if (!plan._dbId) {
    return <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12 }}><p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Guardando plan…</p></div>;
  }

  return (
    <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>{plan.nombre || `Plan de ${plan.numClases} clases`}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
            {hechas}/{total} completado · {pct}%{boletaVinculada ? ` · vinculado a N°${String(boletaVinculada.numero).padStart(3, "0")}` : ""}
          </p>
        </div>
        <button onClick={() => setEditando((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600, flex: "none" }}>
          {editando ? "Cerrar" : "Editar"}
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <BarraProgreso pct={pct} />
      </div>

      {editando && (
        <div style={{ marginTop: 12, background: CREAM_SOFT, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#6B6248" }}>Número de clases:</label>
            <button onClick={() => actualizarPlan({ numClases: Math.max(0, (plan.numClases || 0) - 1) })} style={{ ...botonSecundario, padding: "4px 10px" }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{plan.numClases}</span>
            <button onClick={() => actualizarPlan({ numClases: (plan.numClases || 0) + 1 })} style={{ ...botonSecundario, padding: "4px 10px" }}>+</button>
            <span style={{ fontSize: 11, color: "#8A7E5C" }}>agregá una si el cliente compró clases de más</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: INK, cursor: "pointer" }}>
            <input type="checkbox" checked={!!plan.incluyeEvaluacion} onChange={(e) => actualizarPlan({ incluyeEvaluacion: e.target.checked })} />
            Incluye evaluación
          </label>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6B6248" }}>Vincular a factura ya enviada</p>
            <select value={plan.boletaAdiestramientoId || ""} onChange={(e) => actualizarPlan({ boletaAdiestramientoId: e.target.value || null })} style={{ ...input, marginBottom: 0 }}>
              <option value="">Sin vincular</option>
              {boletasDisponibles.map((b) => (
                <option key={b._dbId} value={b._dbId}>N°{String(b.numero).padStart(3, "0")} · {b.cliente}{b.perro ? ` (${b.perro})` : ""} · {b.numClases > 0 ? b.numClases + " clases" : "Evaluación"} · {fmtCLP(b.total)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
        {plan.incluyeEvaluacion && (
          <FilaChecklist etiqueta="Evaluación" existente={itemDe(0)} citaProgramada={citaDe(0)}
            onMarcarRapido={() => marcarRapido(0)} onDeshacer={() => deshacerClase(plan._dbId, 0)}
            onAbrirDetalle={() => abrirDetalle(0)} onAbrirAgendar={() => abrirAgendar(0)} onCancelarAgenda={() => cancelarAgenda(0)} />
        )}
        {Array.from({ length: plan.numClases || 0 }, (_, i) => i + 1).map((n) => (
          <FilaChecklist key={n} etiqueta={`Clase ${n}`} existente={itemDe(n)} citaProgramada={citaDe(n)}
            onMarcarRapido={() => marcarRapido(n)} onDeshacer={() => deshacerClase(plan._dbId, n)}
            onAbrirDetalle={() => abrirDetalle(n)} onAbrirAgendar={() => abrirAgendar(n)} onCancelarAgenda={() => cancelarAgenda(n)} />
        ))}
        {detalleAbierto !== null && (
          <div style={{ marginTop: 6, background: CREAM_SOFT, borderRadius: 6, padding: 10 }}>
            <input type="date" value={fechaForm} onChange={(e) => setFechaForm(e.target.value)} style={{ ...input, marginBottom: 8, width: 160 }} />
            <SelectorTemas seleccionados={temasForm} onToggle={toggleTemaForm} compacto />
            <input placeholder="Qué vio el entrenador / notas (opcional)" value={notasForm} onChange={(e) => setNotasForm(e.target.value)} style={{ ...input, marginBottom: 8, marginTop: 6 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={guardarDetalle} style={{ ...botonPrincipal, width: "auto", padding: "7px 14px", marginTop: 0 }}>Guardar</button>
              <button onClick={() => setDetalleAbierto(null)} style={botonSecundario}>Cancelar</button>
            </div>
          </div>
        )}
        {quitandoCita && (
          <ModalConfirmacion
            titulo="¿Cancelar esta clase?"
            mensaje={`${String(quitandoCita.clienteNombre || "El cliente").split(" ")[0]} ya confirmó que viene a esta hora. Si la cancelas le va a llegar un correo avisándole, y la clase vuelve a quedar sin agendar.`}
            textoConfirmar={agendaEnVuelo ? "Cancelando…" : "Cancelar y avisar"}
            onConfirmar={confirmarQuitarCita}
            onCancelar={() => setQuitandoCita(null)}
          />
        )}
        {agendando !== null && (
          <div style={{ marginTop: 6, background: "#EAF2F6", borderRadius: 6, padding: 10 }}>
            <label style={{ fontSize: 12, color: "#6B6248", display: "block", marginBottom: 6 }}>
              Fecha y hora de {agendando === 0 ? "la evaluación" : `la clase ${agendando}`}{cliente?.adiestradorNombre ? ` con ${cliente.adiestradorNombre}` : ""}
            </label>
            {cliente?.adiestradorNombre ? (
              <>
                <input type="datetime-local" value={fechaAgendaForm} onChange={(e) => setFechaAgendaForm(e.target.value)} style={{ ...input, marginBottom: 8, maxWidth: 220 }} />
                <input
                  placeholder={agendando === 0 ? "Tema de la evaluación (opcional)" : "Tema de la clase — ej: llamado y correa suelta"}
                  value={temaAgendaForm}
                  onChange={(e) => setTemaAgendaForm(e.target.value)}
                  maxLength={90}
                  style={{ ...input, marginBottom: 8 }}
                />
                <p style={{ ...hint, marginTop: 0, marginBottom: 8 }}>
                  {cliente.email
                    ? <>Le llega un correo a <strong>{cliente.email}</strong> con un botón para confirmar.</>
                    : "Este alumno no tiene correo en su ficha — la clase queda agendada, pero tendrás que avisarle tú."}
                </p>
              </>
            ) : (
              <p style={{ ...hint, marginTop: 0, marginBottom: 8 }}>Este alumno no tiene entrenador asignado — asígnalo en "Editar ficha" antes de agendar.</p>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={guardarAgenda} disabled={!cliente?.adiestradorNombre || agendaEnVuelo} style={{ ...botonPrincipal, width: "auto", padding: "7px 14px", marginTop: 0, opacity: cliente?.adiestradorNombre && !agendaEnVuelo ? 1 : 0.5, cursor: cliente?.adiestradorNombre && !agendaEnVuelo ? "pointer" : "not-allowed" }}>{agendaEnVuelo ? "Agendando…" : "Guardar y avisar"}</button>
              <button onClick={() => setAgendando(null)} style={botonSecundario}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormularioNuevoPlan({ boletasDisponibles, onCrear, onCancelar }) {
  const [nombre, setNombre] = useState("");
  const [numClases, setNumClases] = useState(4);
  const [incluyeEvaluacion, setIncluyeEvaluacion] = useState(false);
  const [boletaId, setBoletaId] = useState("");

  function crear() {
    onCrear({ nombre: nombre.trim() || null, numClases: Number(numClases) || 0, incluyeEvaluacion, boletaAdiestramientoId: boletaId || null });
  }

  return (
    <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12, background: CREAM_SOFT }}>
      <p style={{ ...label, marginBottom: 8 }}>Nuevo plan de clases</p>
      <input placeholder="Nombre (opcional, ej. Obediencia básica)" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...input, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, color: "#6B6248" }}>Número de clases:</label>
        <input type="number" min="0" value={numClases} onChange={(e) => setNumClases(e.target.value)} style={{ ...input, marginBottom: 0, width: 80 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: INK, cursor: "pointer" }}>
          <input type="checkbox" checked={incluyeEvaluacion} onChange={(e) => setIncluyeEvaluacion(e.target.checked)} /> Incluye evaluación
        </label>
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6B6248" }}>Vincular a factura ya enviada (opcional)</p>
      <select value={boletaId} onChange={(e) => setBoletaId(e.target.value)} style={{ ...input, marginBottom: 12 }}>
        <option value="">Sin vincular</option>
        {boletasDisponibles.map((b) => (
          <option key={b._dbId} value={b._dbId}>N°{String(b.numero).padStart(3, "0")} · {b.cliente}{b.perro ? ` (${b.perro})` : ""} · {b.numClases > 0 ? b.numClases + " clases" : "Evaluación"} · {fmtCLP(b.total)}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={crear} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Crear plan</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

function CasoAlumno({ cliente, planes, boletasAdiestramiento, clasesRealizadas, marcarClase, deshacerClase, actualizarPlan, crearPlan, nombreActual, esAdmin, citasAgenda = [], setCitas, onEditar, onEliminar, onToggleAccesoRapido, onVolver }) {
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  // No se filtra por "es de este cliente" — Javier pidió ver las
  // facturas de adiestramiento recientes en general y elegir a mano,
  // porque el match automático por nombre/id puede fallar (ej. el
  // alumno se cargó con la ficha nueva y la factura se generó aparte
  // con el nombre escrito distinto). Se muestran las últimas ~30 sin
  // vincular a ningún plan todavía.
  const idsVinculados = new Set(planes.map((p) => p.boletaAdiestramientoId).filter(Boolean));
  const boletasRecientesSinVincular = boletasAdiestramiento
    .filter((b) => b._dbId && !idsVinculados.has(b._dbId))
    .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO))
    .slice(0, 30);

  return (
    <div>
      <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18 }}>← Volver a Alumnos</button>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", flex: "none", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, border: `2px solid ${CREAM_SOFT}` }} />
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 2 }}>{cliente.perro}</h2>
              <p style={{ margin: 0, color: "#8A7E5C" }}>Tutor: {cliente.nombre} {cliente.telefono ? `· ${cliente.telefono}` : ""}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cliente._dbId && (
              <button onClick={onToggleAccesoRapido} style={{ ...botonSecundario, color: cliente.accesoRapido ? GOLD : INK, borderColor: cliente.accesoRapido ? GOLD : "#DCD2B4" }}>
                {cliente.accesoRapido ? "★ Quitar de Inicio" : "☆ Agregar a Inicio"}
              </button>
            )}
            <button onClick={onEditar} style={botonSecundario}>Editar ficha</button>
            {esAdmin && cliente._dbId && (
              <button onClick={() => setConfirmandoEliminar(true)} style={{ ...botonSecundario, borderColor: RUST, color: RUST }}>Eliminar alumno</button>
            )}
          </div>
        </div>

        {confirmandoEliminar && (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${cliente.perro}?`}
            mensaje={`Se borra la ficha de ${cliente.perro} y de su tutor ${cliente.nombre} — sus planes de clases, historial y datos de contacto quedan asociados a un alumno que ya no vas a poder ver ni editar.`}
            textoConfirmar="Eliminar alumno"
            onConfirmar={() => { onEliminar(); setConfirmandoEliminar(false); }}
            onCancelar={() => setConfirmandoEliminar(false)}
          />
        )}

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 }}>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Comuna</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.comuna || "Sin dato"}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Edad</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.edad || "Sin dato"}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Entrenador</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.adiestradorNombre || "Sin asignar"}</p>
          </div>
        </div>

        {(cliente.temasObjetivo || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={label}>Objetivo de ingreso</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {cliente.temasObjetivo.map((id) => <span key={id} style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>{nombreTema(id)}</span>)}
            </div>
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={{ ...label, margin: 0 }}>Planes de clases</p>
            {cliente._dbId && (
              <button onClick={() => setCreandoPlan((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {creandoPlan ? "Cancelar" : "+ Nuevo plan"}
              </button>
            )}
          </div>
          {!cliente._dbId ? (
            <p style={{ ...hint, marginTop: 8 }}>Guardando alumno…</p>
          ) : (
            <>
              {creandoPlan && (
                <FormularioNuevoPlan boletasDisponibles={boletasRecientesSinVincular}
                  onCrear={(datos) => { crearPlan(datos); setCreandoPlan(false); }}
                  onCancelar={() => setCreandoPlan(false)} />
              )}
              {planes.length === 0 && !creandoPlan ? (
                <p style={{ ...hint, marginTop: 8 }}>Todavía no tiene ningún plan de clases — usa "+ Nuevo plan".</p>
              ) : (
                planes.map((plan) => (
                  <PlanClases key={plan._dbId || plan.id} plan={plan}
                    boletasDisponibles={plan.boletaAdiestramientoId ? [...boletasRecientesSinVincular, ...boletasAdiestramiento.filter((b) => b._dbId === plan.boletaAdiestramientoId)] : boletasRecientesSinVincular}
                    clasesDelPlan={clasesRealizadas.filter((cr) => cr.planId === plan._dbId)}
                    marcarClase={marcarClase} deshacerClase={deshacerClase}
                    actualizarPlan={(cambios) => actualizarPlan(plan._dbId, cambios)}
                    nombreActual={nombreActual} cliente={cliente} citasAgenda={citasAgenda} setCitas={setCitas} />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Colores por tipo en el calendario — evaluación/clase vienen de
// citas_agenda, paseo es un ítem "virtual" derivado de
// clientes.diasHabituales (los paseos no viven en citas_agenda, son
// recurrentes por día de semana, no fechas puntuales).

// Una fila de la lista de alumnos — foto chica, comuna, último tema
// trabajado y barra de progreso. Función normal (no componente JSX vía
// tag) para que no se re-monte en cada render, mismo criterio que
// renderFilaFactura en Facturas.

function renderFilaAlumno(a, onAbrir) {
  const c = a.cliente;
  return (
    <button key={c.id} onClick={() => onAbrir(c)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, border: "1px solid #EDE4CE", background: "#FFFFFF", marginBottom: 8, cursor: "pointer", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.perro} <span style={{ fontWeight: 400, color: "#8A7E5C" }}>· {c.nombre}</span></p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>{c.comuna || "Sin comuna"}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, flex: "none" }}>
        <span style={{ color: "#8A7E5C" }}>
          {a.ultimaClase?.temas?.[0]
            ? nombreTema(a.ultimaClase.temas[0])
            : a.total === 0
            ? "Sin plan"
            : a.hechas === 0
            ? "Sin clases aún"
            : "Sin temas registrados"}
        </span>
        {a.total > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 46 }}><BarraProgreso pct={a.pct} /></span>
            <span style={{ minWidth: 30, textAlign: "right" }}>{a.pct}%</span>
          </span>
        )}
      </div>
    </button>
  );
}

// Catálogo de packs de clases: lo que se vende, definido una vez y
// reusado en cada cliente (database/109). Distinto de planes_clases, que
// es el pack que YA compró alguien puntual. Se elige desde la ficha del
// cliente, en la sección Evaluación.
//
// Sin precio a propósito: el precio se escribe al emitir la boleta
// (modo "Pack con precio propio"), porque en la práctica no siempre es
// el mismo — hay descuentos y precios armados para un caso puntual.
function PacksClases({ packsClases, setPacksClases }) {
  const [creando, setCreando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [numClases, setNumClases] = useState(4);
  const [incluyeEvaluacion, setIncluyeEvaluacion] = useState(false);

  const activos = packsClases.filter((p) => p.activo);

  function crear() {
    if (!nombre.trim()) return;
    setPacksClases((prev) => [...prev, {
      nombre: nombre.trim(),
      numClases: Number(numClases) || 0,
      incluyeEvaluacion,
      activo: true,
      id: Date.now(),
    }]);
    setNombre("");
    setNumClases(4);
    setIncluyeEvaluacion(false);
    setCreando(false);
    showToast("Pack creado.", "exito");
  }

  function actualizar(pack, cambios) {
    setPacksClases((prev) => prev.map((p) => ((p._dbId || p.id) === (pack._dbId || pack.id) ? { ...p, ...cambios } : p)));
  }

  return (
    <SeccionPlegable titulo="Packs de clases" subtitulo={`${activos.length} activo(s) de ${packsClases.length}`}>
      <p style={{ ...hint, marginTop: 0 }}>
        Los packs que vendes. Aparecen para elegir en la ficha de un cliente que ya hizo su evaluación.
        El precio no va acá: se escribe al emitir la boleta, porque no siempre es el mismo.
      </p>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {packsClases.length === 0 && <p style={hint}>Todavía no hay packs.</p>}
        {packsClases.map((pack) => (
          <div key={pack._dbId || pack.id}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", background: CREAM_SOFT, borderRadius: 8, padding: "10px 14px", opacity: pack.activo ? 1 : 0.55 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>{pack.nombre}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#8A7E5C" }}>
                {pack.numClases} clase{pack.numClases === 1 ? "" : "s"}
                {pack.incluyeEvaluacion ? " · incluye evaluación" : ""}
                {pack.activo ? "" : " · desactivado"}
              </p>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button onClick={() => actualizar(pack, { incluyeEvaluacion: !pack.incluyeEvaluacion })}
                style={{ ...botonSecundario, width: "auto", padding: "6px 12px", fontSize: 12, margin: 0 }}>
                {pack.incluyeEvaluacion ? "Quitar evaluación" : "Incluir evaluación"}
              </button>
              {/* Desactivar en vez de borrar: un pack ya vendido sigue
                  nombrado en el plan de ese cliente. */}
              <button onClick={() => actualizar(pack, { activo: !pack.activo })}
                style={{ ...botonSecundario, width: "auto", padding: "6px 12px", fontSize: 12, margin: 0 }}>
                {pack.activo ? "Desactivar" : "Reactivar"}
              </button>
            </div>
          </div>
        ))}
      </div>

      {creando ? (
        <div style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 14, display: "grid", gap: 10 }}>
          <div>
            <label style={label} htmlFor="pack-nombre">Nombre del pack</label>
            <input id="pack-nombre" type="text" placeholder="ej. 8 clases intensivas" value={nombre}
              onChange={(e) => setNombre(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label} htmlFor="pack-clases">Cuántas clases trae</label>
            <input id="pack-clases" type="number" min="0" value={numClases}
              onChange={(e) => setNumClases(e.target.value)} style={{ ...input, marginBottom: 0, width: 110 }} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13.5, color: NAVY }}>
            <input type="checkbox" checked={incluyeEvaluacion} onChange={(e) => setIncluyeEvaluacion(e.target.checked)} style={{ width: 16, height: 16 }} />
            Incluye la evaluación
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={crear} disabled={!nombre.trim()}
              style={{ ...botonPrincipal, marginTop: 0, width: "auto", padding: "8px 18px", opacity: nombre.trim() ? 1 : 0.45 }}>Crear pack</button>
            <button onClick={() => setCreando(false)} style={{ ...botonSecundario, width: "auto", padding: "8px 18px", margin: 0 }}>Cancelar</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreando(true)} style={{ ...botonSecundario, width: "auto", padding: "8px 16px", margin: 0 }}>+ Nuevo pack</button>
      )}
    </SeccionPlegable>
  );
}

export function Alumnos({ clientes, setClientes, boletasAdiestramiento, usuarios, citasAgenda, setCitas, registroPaseos = {}, planesClases, setPlanesClases, cargandoPlanesClases, packsClases = [], setPacksClases, clasesRealizadas, marcarClase, deshacerClase, cargandoClasesRealizadas, rolActual, nombreActual, esAdmin, saltarAlumnoDbId, limpiarSaltoAlumno }) {
  const [vista, setVista] = useState("lista"); // "lista" | "ingreso" | "caso" | "calendario"
  const [clienteSelId, setClienteSelId] = useState(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const esEntrenador = rolActual === "entrenador";
  const entrenadores = usuarios.filter((u) => u.rol === "entrenador");

  const misAlumnos = useMemo(() => {
    return clientes.filter((c) => c.tipoServicio?.includes("clases"))
      .filter((c) => !esEntrenador || c.adiestradorNombre === nombreActual)
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }, [clientes, esEntrenador, nombreActual]);

  const clienteSel = clientes.find((c) => c.id === clienteSelId) || null;

  // Clientes que vinieron por evaluación y todavía no son alumnos. Un
  // entrenador solo ve los suyos, igual que en el resto de la pestaña.
  const candidatosEvaluacion = useMemo(() => clientes
    .filter((c) => c.tipoServicio?.includes("evaluacion") && !c.tipoServicio?.includes("clases"))
    .filter((c) => !clienteEstaCerrado(c))
    .filter((c) => !esEntrenador || c.adiestradorNombre === nombreActual)
    .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es")),
    [clientes, esEntrenador, nombreActual]);

  // Salto desde "Accesos directos" en el Inicio del entrenador — mismo
  // patrón que saltarClienteDbId (Mail → Clientes).
  useEffect(() => {
    if (!saltarAlumnoDbId) return;
    const c = clientes.find((x) => x._dbId === saltarAlumnoDbId);
    if (c) { setClienteSelId(c.id); setVista("caso"); }
    limpiarSaltoAlumno?.();
  }, [saltarAlumnoDbId, clientes]);

  // Mismo criterio que Clientes/App(): lista, ficha de ingreso, caso y
  // calendario son pantallas completas distintas — sin esto, entrar a un
  // alumno (o volver a la lista) dejaba la página a mitad de scroll de
  // donde se venía.
  useEffect(() => { window.scrollTo(0, 0); }, [vista]);

  function guardarAlumno(datos) {
    const id = datos.id || Date.now();
    if (datos.id) {
      // Se actualiza una ficha que ya existe. Si venía de evaluación hay
      // que dejarla como alumno, si no seguiría fuera de esta pestaña
      // (la lista filtra por tipoServicio que incluya "clases").
      setClientes((prev) => prev.map((c) => (c.id === datos.id
        ? { ...c, ...datos, tipoServicio: tipoServicioComoAlumno(c.tipoServicio), triagePendiente: false }
        : c)));
    } else {
      const nuevo = {
        nombre: "", perro: "", telefono: "", email: "", comuna: "", edad: "", adiestradorNombre: "", temasObjetivo: [],
        diasHabituales: [], tipoServicio: ["clases"], estadoCliente: "activo",
        ...datos, id,
      };
      setClientes((prev) => [...prev, nuevo]);
    }
    setClienteSelId(id);
    setVista("caso");
  }

  function actualizarPlan(planDbId, cambios) {
    setPlanesClases((prev) => prev.map((p) => (p._dbId === planDbId ? { ...p, ...cambios } : p)));
  }
  function crearPlan(cliente, datos) {
    setPlanesClases((prev) => [...prev, { ...datos, clienteId: cliente._dbId, creadoPor: nombreActual, id: Date.now() }]);
  }
  function toggleAccesoRapido(cliente) {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, accesoRapido: !c.accesoRapido } : c)));
  }
  function eliminarAlumno(cliente) {
    setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
    setVista("lista");
  }

  if (vista === "ingreso") {
    return <FormularioIngresoAlumno inicial={clienteSel} entrenadores={entrenadores} esEntrenador={esEntrenador} nombreActual={nombreActual}
      candidatosEvaluacion={candidatosEvaluacion}
      onGuardar={guardarAlumno} onCancelar={() => setVista(clienteSel ? "caso" : "lista")} />;
  }
  if (vista === "caso" && clienteSel) {
    return <CasoAlumno cliente={clienteSel}
      planes={planesClases.filter((p) => p.clienteId === clienteSel._dbId)}
      boletasAdiestramiento={boletasAdiestramiento}
      clasesRealizadas={clasesRealizadas} marcarClase={marcarClase} deshacerClase={deshacerClase}
      actualizarPlan={actualizarPlan} crearPlan={(datos) => crearPlan(clienteSel, datos)}
      nombreActual={nombreActual} esAdmin={esAdmin} citasAgenda={citasAgenda} setCitas={setCitas}
      onToggleAccesoRapido={() => toggleAccesoRapido(clienteSel)}
      onEliminar={() => eliminarAlumno(clienteSel)}
      onEditar={() => setVista("ingreso")} onVolver={() => setVista("lista")} />;
  }
  if (vista === "calendario") {
    return <CalendarioAlumnos citasAgenda={citasAgenda} setCitas={setCitas} clientes={clientes} setClientes={setClientes} registroPaseos={registroPaseos} rolActual={rolActual} nombreActual={nombreActual} onVolver={() => setVista("lista")} />;
  }

  const alumnosConProgreso = misAlumnos.map((c) => {
    const planes = planesClases.filter((p) => p.clienteId === c._dbId);
    const clases = clasesRealizadas.filter((cr) => planes.some((p) => p._dbId === cr.planId));
    const total = planes.reduce((acc, p) => acc + (p.numClases || 0) + (p.incluyeEvaluacion ? 1 : 0), 0);
    const hechas = clases.length;
    const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
    const completo = planes.length > 0 && total > 0 && hechas >= total;
    const ultimaClase = [...clases].sort((x, y) => new Date(y.fechaRealizada) - new Date(x.fechaRealizada))[0];
    return { cliente: c, total, hechas, pct, completo, ultimaClase };
  });
  const alumnosActivos = alumnosConProgreso.filter((a) => !a.completo);
  const alumnosHistorial = alumnosConProgreso.filter((a) => a.completo);
  const abrirCaso = (c) => { setClienteSelId(c.id); setVista("caso"); };

  return (
    <div className="howria-card" style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={sectionTitle}>Alumnos</h2>
          <p style={hint}>Seguimiento de clases de adiestramiento — quiénes son tus alumnos actuales y qué se ha trabajado con cada uno.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button onClick={() => setVista("calendario")} style={botonSecundario}>Calendario</button>
          <button onClick={() => { setClienteSelId(null); setVista("ingreso"); }} style={botonPrincipal}>+ Nuevo alumno</button>
        </div>
      </div>

      {/* Editar el catálogo es configuración, no operación del día:
          queda para coordinador/administrador. Un entrenador igual ve
          los packs cuando elige uno en la ficha de un cliente. */}
      {!esEntrenador && (
        <div style={{ marginTop: 18 }}>
          <PacksClases packsClases={packsClases} setPacksClases={setPacksClases} />
        </div>
      )}

      <div style={{ marginTop: 18 }}>
        {(cargandoClasesRealizadas || cargandoPlanesClases) ? (
          <SkeletonLista filas={3} alto={58} gap={8} />
        ) : alumnosConProgreso.length === 0 ? (
          <p style={hint}>No hay alumnos todavía — usa "+ Nuevo alumno" para cargar el primero.</p>
        ) : (
          <>
            {alumnosActivos.length === 0 ? (
              <p style={hint}>No hay alumnos activos — todos están en el historial de abajo.</p>
            ) : (
              alumnosActivos.map((a) => renderFilaAlumno(a, abrirCaso))
            )}

            {alumnosHistorial.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <button onClick={() => setHistorialAbierto((v) => !v)} style={{ ...botonSecundario, width: "auto" }}>
                  {historialAbierto ? "▾" : "▸"} Historial de alumnos ({alumnosHistorial.length})
                </button>
                {historialAbierto && (
                  <div style={{ marginTop: 10 }}>
                    {alumnosHistorial.map((a) => renderFilaAlumno(a, abrirCaso))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
