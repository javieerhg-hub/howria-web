// Pestaña Agenda — calendario de citas del entrenador y disponibilidad por
// bloques. Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas y
// src/tabs/_compartido.jsx para lo compartido.
import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, RUST, MESES, DIAS_SEMANA_LARGO, tarjeta, sectionTitle, hint, label,
  input, botonPrincipal, botonSecundario, Spinner, BotonEliminar, fechaKey, showToast,
} from "../HowriaAdmin.jsx";
import { diasDelMes } from "../lib/calculosBoletas.js";
import { CalendarioMes, fechaKeyMes } from "../lib/CalendarioMes.jsx";
import { TIPOS_CITA, hayChoqueHorario, NOMBRES_ESTADO_CITA, ModalDetalleCita, eliminarCita } from "./_compartido.jsx";

const BLOQUES_DIA = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

// Lo que el cliente dejó al pedir la cita desde la agenda pública — copia
// redundante guardada directo en citas_agenda (ver api/cliente-agenda.js),
// así el adiestrador la ve acá sin necesitar acceso a la tabla prospectos
// (coordinador/admin únicamente). Citas viejas, creadas antes de esta
// columna, o agendadas a mano por staff, simplemente no tienen nada que
// mostrar.
function DatosContactoCita({ cita, onAbrir }) {
  if (!cita.email && !cita.telefono && !cita.direccion) return null;
  return (
    <button type="button" onClick={onAbrir}
      style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8, padding: "8px 10px", background: CREAM_SOFT, border: "none", borderRadius: 6, fontSize: 12.5, color: "#5C5442", cursor: "pointer" }}>
      <p style={{ margin: 0, fontSize: 10.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>Datos que dejó al pedir la cita · toca para ver todo</p>
      {cita.email && <p style={{ margin: "4px 0 0" }}>✉️ {cita.email}</p>}
      {cita.telefono && <p style={{ margin: "2px 0 0" }}>📞 {cita.telefono}</p>}
      {cita.direccion && <p style={{ margin: "2px 0 0" }}>📍 {cita.direccion}</p>}
    </button>
  );
}


export function Agenda({ clientes, usuarios, citas, setCitas, cargando, disponibilidadFecha, toggleBloqueDisponibilidad, aplicarPatronSemanal, tarifas, actualizarTarifas, rolActual, nombreActual }) {
  const adiestradores = usuarios.filter((u) => u.rol === "entrenador");
  const [filtroAdiestrador, setFiltroAdiestrador] = useState("todos");
  const [busquedaCita, setBusquedaCita] = useState("");
  const [historialDesde, setHistorialDesde] = useState("");
  const [historialHasta, setHistorialHasta] = useState("");
  const [limiteHistorial, setLimiteHistorial] = useState(20);
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [tipo, setTipo] = useState("evaluacion");
  const [adiestrador, setAdiestrador] = useState(adiestradores[0]?.nombre ?? "");
  const [fechaHora, setFechaHora] = useState("");
  const [duracionCita, setDuracionCita] = useState(60);
  const [precioCita, setPrecioCita] = useState("");
  const [notasNuevas, setNotasNuevas] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [notasEdit, setNotasEdit] = useState("");
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [citaDetalleId, setCitaDetalleId] = useState(null);
  const [cancelandoId, setCancelandoId] = useState(null);
  const esEntrenador = rolActual === "entrenador";
  const [adiestradorHorario, setAdiestradorHorario] = useState(esEntrenador ? nombreActual : (adiestradores[0]?.nombre ?? ""));
  const [linkGenericoCopiado, setLinkGenericoCopiado] = useState(false);
  const hoyDisponibilidad = new Date();
  const [mesDisponibilidad, setMesDisponibilidad] = useState({ anio: hoyDisponibilidad.getFullYear(), mesIdx: hoyDisponibilidad.getMonth() });
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [diasPatron, setDiasPatron] = useState([]);
  const [bloquesPatron, setBloquesPatron] = useState([]);
  const [aplicandoPatron, setAplicandoPatron] = useState(false);
  const [mostrarFormAgendar, setMostrarFormAgendar] = useState(false);

  function copiarLinkGenerico() {
    const link = `${window.location.origin}/agendaadiestrador`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkGenericoCopiado(true);
      setTimeout(() => setLinkGenericoCopiado(false), 2500);
    });
  }

  function agendar() {
    const cliente = clientes.find((c) => c.id === Number(clienteId));
    if (!cliente || !fechaHora || !adiestrador) return;
    if (new Date(fechaHora).getTime() <= Date.now()) {
      showToast("La fecha y hora de la cita debe ser futura.");
      return;
    }
    const duracion = Number(duracionCita) || 60;
    if (hayChoqueHorario(citas, adiestrador, fechaHora, duracion)) {
      showToast(`${adiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => [...prev, {
      id: Date.now(), clienteId: cliente._dbId, clienteNombre: cliente.nombre, perro: cliente.perro,
      tipo, adiestrador, fechaISO: new Date(fechaHora).toISOString(), estado: "agendada", notas: notasNuevas.trim(), origen: "staff",
      duracionMin: duracion, precio: precioCita === "" ? null : Number(precioCita),
    }]);
    setFechaHora(""); setNotasNuevas(""); setDuracionCita(60); setPrecioCita(""); setMostrarFormAgendar(false);
  }

  // Cancelar y rechazar pasan por el servidor (api/cancelar-cita.js) y no
  // por un cambio de estado local, porque además de mover el estado le
  // avisan al cliente por correo. Mismo esquema que confirmar(): un 502
  // significa que la cita SÍ quedó cancelada y solo falló el correo, así
  // que igual hay que reflejarlo en pantalla.
  async function cambiarEstadoConAviso(cita, accion) {
    if (cancelandoId) return;
    setCancelandoId(cita.id);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/cancelar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ citaId: cita._dbId, accion }),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo cancelar la cita.");
        return;
      }
      const estadoNuevo = accion === "rechazar" ? "rechazada" : "cancelada";
      setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, estado: estadoNuevo } : c)));
      if (resp.status === 502) showToast(resultado.error);
      else if (resultado.aviso) showToast(resultado.aviso);
      else showToast(accion === "rechazar" ? "Hora rechazada — se le avisó al cliente." : "Cita cancelada — se le avisó al cliente.", "exito");
    } catch {
      showToast("No se pudo cancelar la cita — revisa tu conexión.");
    } finally {
      setCancelandoId(null);
    }
  }

  function confirmarRealizada(id) {
    setCitas((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "realizada", notas: notasEdit.trim() } : c)));
    setEditandoId(null); setNotasEdit("");
  }

  async function confirmar(cita) {
    if (confirmandoId) return;
    setConfirmandoId(cita.id);
    try {
      // refreshSession() en vez de getSession(): fuerza un token nuevo en
      // vez de reusar uno que puede haber vencido mientras la pestaña
      // estuvo inactiva (típico en el "app" instalada en el celular, que
      // no siempre alcanza a renovarlo sola en segundo plano).
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/confirmar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ citaId: cita._dbId }),
      });
      const resultado = await resp.json().catch(() => ({}));
      // 502 = la cita sí quedó confirmada en la base, pero el envío del
      // correo falló (ver api/confirmar-cita.js) — igual hay que reflejar
      // el cambio de estado en pantalla, no solo los errores de verdad.
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo confirmar la cita.");
        return;
      }
      setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, estado: "agendada" } : c)));
      showToast(resp.status === 502 ? resultado.error : "Cita confirmada — se le avisó al cliente por correo.");
    } catch {
      showToast("No se pudo confirmar la cita — revisa tu conexión.");
    } finally {
      setConfirmandoId(null);
    }
  }

  const citasFiltradas = filtroAdiestrador === "todos" ? citas : citas.filter((c) => c.adiestrador === filtroAdiestrador);
  const busquedaCitaLimpia = busquedaCita.trim().toLowerCase();
  const citasBuscadas = busquedaCitaLimpia
    ? citasFiltradas.filter((c) => c.clienteNombre?.toLowerCase().includes(busquedaCitaLimpia) || c.perro?.toLowerCase().includes(busquedaCitaLimpia))
    : citasFiltradas;
  const pendientes = citasBuscadas.filter((c) => c.estado === "pendiente").sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  const proximas = citasBuscadas.filter((c) => c.estado === "agendada").sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  let historialCompleto = citasBuscadas.filter((c) => !["agendada", "pendiente"].includes(c.estado)).sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  if (historialDesde) historialCompleto = historialCompleto.filter((c) => fechaKey(new Date(c.fechaISO)) >= historialDesde);
  if (historialHasta) historialCompleto = historialCompleto.filter((c) => fechaKey(new Date(c.fechaISO)) <= historialHasta);
  const historial = historialCompleto.slice(0, limiteHistorial);

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando agenda…</p></div>;
  }

  const citaDetalle = citaDetalleId ? citas.find((c) => c.id === citaDetalleId) : null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {citaDetalle && <ModalDetalleCita cita={citaDetalle} onCerrar={() => setCitaDetalleId(null)} onEliminar={(dbId) => eliminarCita(setCitas, dbId)} />}
      <div className="howria-agenda-link">
        <div className="howria-card howria-agenda-link-tarjeta" style={{ ...tarjeta, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Link público de agenda</h2>
            <p style={{ ...hint, margin: 0 }}>Compártelo donde quieras (Instagram, WhatsApp) — cualquier persona puede pedir hora y quedar como prospecto.</p>
          </div>
          <button onClick={copiarLinkGenerico} style={botonSecundario}>{linkGenericoCopiado ? "¡Copiado!" : "Copiar link genérico"}</button>
        </div>
        <button onClick={copiarLinkGenerico} title="Copiar link público de agenda" aria-label="Copiar link público de agenda"
          className="howria-agenda-link-boton"
          style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: linkGenericoCopiado ? "#2F6A46" : NAVY, color: CREAM, cursor: "pointer", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(20,33,61,0.15)" }}>
          {linkGenericoCopiado ? <Check size={18} /> : <Link2 size={18} />}
        </button>
      </div>

      <div className="howria-card howria-agenda-filtro" style={{ ...tarjeta, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: "1 1 220px" }}>
          <label style={label} htmlFor="agenda-buscar">Buscar cliente o perro</label>
          <input id="agenda-buscar" type="text" value={busquedaCita} onChange={(e) => setBusquedaCita(e.target.value)} placeholder="Nombre..." style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="agenda-filtro-adiestrador">Filtrar por entrenador</label>
          <select id="agenda-filtro-adiestrador" value={filtroAdiestrador} onChange={(e) => setFiltroAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0, width: 200 }}>
            <option value="todos">Todos los entrenadores</option>
            {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
          </select>
        </div>
        {(busquedaCita || filtroAdiestrador !== "todos") && (
          <p style={{ ...hint, margin: 0, flexBasis: "100%" }}>Se aplica a las tres listas de abajo: pendientes, próximas e historial.</p>
        )}
      </div>

      {pendientes.length > 0 && (
        <div className="howria-card howria-agenda-pendientes" style={{ ...tarjeta, background: "#F3E3B4", border: "1px solid #E3D08C" }}>
          <h2 style={sectionTitle}>Pendientes de confirmar ({pendientes.length})</h2>
          <p style={hint}>Solicitudes que dejaron los tutores desde su portal. Al confirmar, el cliente recibe un correo con la fecha y hora.</p>
          <div style={{ marginTop: 12 }}>
            {pendientes.map((c) => (
              <div key={c.id} style={{ padding: "12px 14px", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13.5 }}>
                    <b style={{ color: NAVY }}>{c.clienteNombre}</b> · 🐾 {c.perro}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                      {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>
                    {new Date(c.fechaISO).toLocaleString("es-CL", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.adiestrador}
                  </div>
                </div>
                <DatosContactoCita cita={c} onAbrir={() => setCitaDetalleId(c.id)} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {/* confirmar() se guarda contra doble-clic globalmente
                      (if (confirmandoId) return;), no solo por fila — el
                      disabled tiene que reflejar eso mismo, si no, tocar
                      "Confirmar" en OTRA fila mientras la primera sigue en
                      curso se ve habilitado pero no hace nada (clic
                      silencioso, sin ningún aviso). */}
                  <button onClick={() => confirmar(c)} disabled={!!confirmandoId}
                    style={{ ...botonPrincipal, width: "auto", padding: "7px 16px", marginTop: 0, fontSize: 12.5, opacity: confirmandoId ? 0.6 : 1 }}>
                    {confirmandoId === c.id ? "Confirmando..." : "Confirmar"}
                  </button>
                  <BotonEliminar onConfirm={() => cambiarEstadoConAviso(c, "rechazar")} disabled={!!confirmandoId || !!cancelandoId} label="Rechazar" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="howria-card howria-agenda-form" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Agendar evaluación o clase</h2>
            {!mostrarFormAgendar && <p style={{ ...hint, margin: "4px 0 0" }}>Se guarda en el calendario del adiestrador elegido y queda con seguimiento hasta marcarla como realizada.</p>}
          </div>
          <button onClick={() => setMostrarFormAgendar((v) => !v)} style={{ ...botonSecundario, width: "auto", flex: "none" }}>
            {mostrarFormAgendar ? "Cancelar" : "+ Agendar evaluación o clase"}
          </button>
        </div>

        {mostrarFormAgendar && (
          <>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div>
                <label style={label} htmlFor="agenda-cliente">Cliente</label>
                <select id="agenda-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-tipo">Tipo</label>
                <select id="agenda-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {TIPOS_CITA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-adiestrador">Entrenador</label>
                <select id="agenda-adiestrador" value={adiestrador} onChange={(e) => setAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-fecha-hora">Fecha y hora</label>
                <input id="agenda-fecha-hora" type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              </div>
              <div>
                <label style={label} htmlFor="agenda-duracion">Duración (minutos)</label>
                <input id="agenda-duracion" type="number" min="15" step="15" value={duracionCita} onChange={(e) => setDuracionCita(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              </div>
              <div>
                <label style={label} htmlFor="agenda-precio">Precio (opcional)</label>
                <input id="agenda-precio" type="number" min="0" placeholder="$" value={precioCita} onChange={(e) => setPrecioCita(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              </div>
            </div>
            <label style={{ ...label, marginTop: 12 }} htmlFor="agenda-notas">Notas (opcional)</label>
            <textarea id="agenda-notas" value={notasNuevas} onChange={(e) => setNotasNuevas(e.target.value)} placeholder="Ej. primera evaluación, revisar reactividad con otros perros..."
              style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} />
            <button onClick={agendar} disabled={!clienteId || !fechaHora || !adiestrador} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px", opacity: !clienteId || !fechaHora || !adiestrador ? 0.45 : 1 }}>
              Agendar
            </button>
          </>
        )}
      </div>

      <div className="howria-card howria-agenda-proximas" style={tarjeta}>
        <h2 style={sectionTitle}>Próximas citas</h2>

        <div style={{ marginTop: 14 }}>
          {proximas.map((c) => {
            const atrasada = new Date(c.fechaISO).getTime() < Date.now();
            return (
            <div key={c.id} style={{ padding: "12px 14px", background: "#FFFFFF", border: atrasada ? `1px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13.5 }}>
                  <b style={{ color: NAVY }}>{c.clienteNombre}</b> · 🐾 {c.perro}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                    {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                  </span>
                  {atrasada && (
                    <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#F1DCD2", color: RUST }}>⚠️ Atrasada</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>
                  {new Date(c.fechaISO).toLocaleString("es-CL", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.adiestrador}
                </div>
              </div>
              {c.notas && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#5C5442" }}>{c.notas}</p>}
              <DatosContactoCita cita={c} onAbrir={() => setCitaDetalleId(c.id)} />

              {editandoId === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea value={notasEdit} onChange={(e) => setNotasEdit(e.target.value)} placeholder="Seguimiento: cómo fue la sesión..."
                    style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => confirmarRealizada(c.id)} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Guardar seguimiento</button>
                    <button onClick={() => setEditandoId(null)} style={botonSecundario}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setEditandoId(c.id); setNotasEdit(c.notas || ""); }} style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5 }}>Marcar realizada</button>
                  <BotonEliminar onConfirm={() => cambiarEstadoConAviso(c, "cancelar")} disabled={!!cancelandoId} label="Cancelar cita" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
                </div>
              )}
            </div>
            );
          })}
          {proximas.length === 0 && <p style={hint}>No hay citas agendadas.</p>}
        </div>
      </div>

      <div className="howria-card howria-agenda-historial" style={tarjeta}>
        <h2 style={sectionTitle}>Historial y seguimiento</h2>
        <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 10 }}>
          <div>
            <label style={label} htmlFor="agenda-historial-desde">Desde</label>
            <input id="agenda-historial-desde" type="date" value={historialDesde} onChange={(e) => { setHistorialDesde(e.target.value); setLimiteHistorial(20); }} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label} htmlFor="agenda-historial-hasta">Hasta</label>
            <input id="agenda-historial-hasta" type="date" value={historialHasta} onChange={(e) => { setHistorialHasta(e.target.value); setLimiteHistorial(20); }} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>
        {historial.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>{historialCompleto.length === 0 ? "Todavía no hay citas realizadas o canceladas." : "Ninguna cita en ese rango de fechas."}</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {historial.map((c) => (
              <div key={c.id} style={{ padding: "12px 14px", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <b style={{ color: NAVY, fontSize: 15 }}>{c.clienteNombre}</b>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.estado === "realizada" ? "#D8ECDE" : "#F1DCD2", color: c.estado === "realizada" ? "#2F6A46" : RUST }}>
                    {NOMBRES_ESTADO_CITA[c.estado] || c.estado}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "#8A7E5C" }}>🐾 {c.perro}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                    {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                  </span>
                </div>
                <p style={{ margin: "8px 0 0", color: "#8A7E5C", fontSize: 12.5 }}>{c.adiestrador} · {new Date(c.fechaISO).toLocaleDateString("es-CL")}</p>
                {c.notas && <p style={{ margin: "6px 0 0", color: "#5C5442", fontSize: 13 }}>{c.notas}</p>}
                {c._dbId && (
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <BotonEliminar onConfirm={() => eliminarCita(setCitas, c._dbId)} label="Eliminar" style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, cursor: "pointer" }} />
                  </div>
                )}
              </div>
            ))}
            {historialCompleto.length > limiteHistorial && (
              <button onClick={() => setLimiteHistorial((n) => n + 20)} style={{ ...botonSecundario, justifySelf: "center" }}>
                Ver más ({historialCompleto.length - limiteHistorial} restantes)
              </button>
            )}
          </div>
        )}
      </div>

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card howria-agenda-disponibilidad" style={tarjeta}>
          <h2 style={sectionTitle}>Disponibilidad</h2>
          <p style={hint}>Clic en un día para ver y elegir qué bloques de hora quedan disponibles ese día — solo esos bloques van a aparecer para que los tutores agenden evaluaciones y clases.</p>
          {!esEntrenador && (
            <select value={adiestradorHorario} onChange={(e) => setAdiestradorHorario(e.target.value)} style={{ ...input, marginTop: 12, width: 240 }}>
              {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
          )}
          {(() => {
            const objetivo = esEntrenador ? nombreActual : adiestradorHorario;
            const hoyKey = fechaKey(new Date());

            function bloquesDe(key) {
              return disponibilidadFecha.filter((d) => d.adiestrador === objetivo && d.fecha === key).map((d) => d.horaInicio);
            }

            // Una hora que ya tiene cita (pedida o confirmada) sigue estando
            // en disponibilidad_fecha, así que se veía verde — como libre —
            // aunque estuviera tomada. En vez de borrar la fila al confirmar
            // (que perdería la disponibilidad para siempre si después se
            // cancela la cita), se cruza con las citas y se muestra ocupada.
            // La reserva pública ya la descartaba por su cuenta, así que
            // nunca hubo riesgo de doble reserva; esto arregla lo que ve el
            // adiestrador.
            function citaEnBloque(key, hora) {
              const inicioBloque = new Date(`${key}T${hora}:00`).getTime();
              const finBloque = inicioBloque + 60 * 60000;
              return citas.find((c) => {
                if (c.adiestrador !== objetivo) return false;
                if (c.estado !== "pendiente" && c.estado !== "agendada") return false;
                const ini = new Date(c.fechaISO).getTime();
                const fin = ini + (c.duracionMin || 60) * 60000;
                return inicioBloque < fin && finBloque > ini;
              });
            }

            function estadoDia(key) {
              if (key < hoyKey) return "pasado";
              const bloques = bloquesDe(key);
              if (bloques.length === 0) return "bloqueado";
              // Un día con todas sus horas ya reservadas no es un día
              // "disponible" — se marca como sin cupo para que no confunda.
              const libres = bloques.filter((h) => !citaEnBloque(key, h));
              return libres.length > 0 ? "disponible" : "bloqueado";
            }

            function onClickDia(key) {
              setDiaSeleccionado(key);
            }

            function toggleDiaPatron(dow) {
              setDiasPatron((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]));
            }

            function toggleBloquePatron(hora) {
              setBloquesPatron((prev) => (prev.includes(hora) ? prev.filter((h) => h !== hora) : [...prev, hora]));
            }

            async function aplicarPatron() {
              if (diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron) return;
              setAplicandoPatron(true);
              const total = diasDelMes(mesDisponibilidad.mesIdx, mesDisponibilidad.anio);
              const desde = fechaKeyMes(mesDisponibilidad.anio, mesDisponibilidad.mesIdx, 1);
              const hasta = fechaKeyMes(mesDisponibilidad.anio, mesDisponibilidad.mesIdx, total);
              await aplicarPatronSemanal(objetivo, diasPatron, bloquesPatron, desde, hasta);
              setAplicandoPatron(false);
            }

            const bloquesDelDiaSeleccionado = diaSeleccionado ? bloquesDe(diaSeleccionado) : [];

            return (
              <div style={{ marginTop: 14 }}>
                <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <p style={{ ...label, marginBottom: 4 }}>Aplicar horario habitual a este mes</p>
                  <p style={{ ...hint, marginTop: 0, marginBottom: 10 }}>Los días y bloques que elijas se SUMAN a lo que ya esté disponible este mes — no lo reemplazan. Para sacar un bloque puntual, haz clic en el día en el calendario de abajo y desmárcalo ahí.</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {DIAS_SEMANA_LARGO.map((nombreDia, dow) => (
                      <button key={dow} type="button" onClick={() => toggleDiaPatron(dow)}
                        style={{
                          borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: diasPatron.includes(dow) ? NAVY : "#FFFFFF", color: diasPatron.includes(dow) ? CREAM : "#6B6248",
                          border: diasPatron.includes(dow) ? "none" : "1px solid #E4DBC3",
                        }}>
                        {nombreDia.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {BLOQUES_DIA.map((hora) => (
                      <button key={hora} type="button" onClick={() => toggleBloquePatron(hora)}
                        style={{
                          borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: bloquesPatron.includes(hora) ? NAVY : "#FFFFFF", color: bloquesPatron.includes(hora) ? CREAM : "#6B6248",
                          border: bloquesPatron.includes(hora) ? "none" : "1px solid #E4DBC3",
                        }}>
                        {hora}
                      </button>
                    ))}
                  </div>
                  <button onClick={aplicarPatron} disabled={diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron}
                    style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron ? 0.5 : 1 }}>
                    {aplicandoPatron ? "Aplicando..." : `Aplicar a ${MESES[mesDisponibilidad.mesIdx]}`}
                  </button>
                </div>
                <CalendarioMes anio={mesDisponibilidad.anio} mesIdx={mesDisponibilidad.mesIdx} estadoDia={estadoDia} onClickDia={onClickDia}
                  onCambiarMes={(delta) => setMesDisponibilidad((prev) => {
                    const d = new Date(prev.anio, prev.mesIdx + delta, 1);
                    return { anio: d.getFullYear(), mesIdx: d.getMonth() };
                  })}
                  seleccionado={diaSeleccionado} />
                {diaSeleccionado && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #EDE4CE" }}>
                    <p style={{ ...label, marginBottom: 8 }}>
                      Bloques del {new Date(diaSeleccionado + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {BLOQUES_DIA.map((hora) => {
                        const activo = bloquesDelDiaSeleccionado.includes(hora);
                        const cita = citaEnBloque(diaSeleccionado, hora);
                        // Ocupado gana sobre disponible: no tiene sentido
                        // "quitar la disponibilidad" de una hora que ya está
                        // reservada — para liberarla hay que cancelar la cita.
                        if (cita) {
                          const quien = cita.clienteNombre || "cliente";
                          return (
                            <span key={hora}
                              title={`Reservado: ${quien}${cita.perro ? ` · 🐾 ${cita.perro}` : ""} — ${cita.estado === "pendiente" ? "por confirmar" : "confirmada"}. Para liberar esta hora hay que cancelar la cita.`}
                              style={{
                                borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600,
                                background: NAVY, color: CREAM, border: `1.5px solid ${NAVY}`,
                                display: "inline-flex", alignItems: "center", gap: 6, cursor: "default",
                              }}>
                              {hora} · reservado
                            </span>
                          );
                        }
                        return (
                          <button key={hora} type="button" onClick={() => toggleBloqueDisponibilidad(objetivo, diaSeleccionado, hora)}
                            style={{
                              borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                              background: activo ? "#D8ECDE" : "#FFFFFF", color: activo ? "#2F6A46" : "#6B6248",
                              border: activo ? "1.5px solid #2F6A46" : "1px solid #E4DBC3",
                            }}>
                            {hora}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card howria-agenda-precios" style={tarjeta}>
          <h2 style={sectionTitle}>Precios</h2>
          <p style={hint}>Lo que ve el tutor al reservar en el link público — se guarda en cada solicitud, así que si lo cambias no afecta las citas ya agendadas.</p>
          {!esEntrenador && (
            <select value={adiestradorHorario} onChange={(e) => setAdiestradorHorario(e.target.value)} style={{ ...input, marginTop: 12, width: 240 }}>
              {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
          )}
          {(() => {
            const objetivo = esEntrenador ? nombreActual : adiestradorHorario;
            const tarifa = tarifas.find((t) => t.adiestrador === objetivo) || { precioEvaluacion: 0, precioClase: 0 };
            return (
              <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                <div>
                  <label style={label} htmlFor="tarifa-evaluacion">Precio evaluación</label>
                  <input id="tarifa-evaluacion" type="number" min="0" value={tarifa.precioEvaluacion}
                    onChange={(e) => actualizarTarifas(objetivo, { precioEvaluacion: Number(e.target.value) })}
                    style={{ ...input, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={label} htmlFor="tarifa-clase">Precio clase</label>
                  <input id="tarifa-clase" type="number" min="0" value={tarifa.precioClase}
                    onChange={(e) => actualizarTarifas(objetivo, { precioClase: Number(e.target.value) })}
                    style={{ ...input, marginBottom: 0 }} />
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
