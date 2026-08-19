// Pestaña Usuarios (PanelAdmin) — altas/bajas de cuentas, permisos por
// rol, solicitudes de registro pendientes. Ver src/HowriaAdmin.jsx
// (React.lazy) por la lista completa de pestañas.
import { useState } from "react";
import { Users } from "lucide-react";
import { supabase, crearCuentaAcceso } from "../lib/supabaseClient.js";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, DIAS_SEMANA_LARGO, ROLES_APP, TODOS_LOS_TABS,
  PASOS_CAPACITACION, tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario,
  Spinner, BotonEliminar, ModalConfirmacion, fmtCLP, slugEmailUsuario, showToast, comprimirImagen,
} from "../HowriaAdmin.jsx";
import { diasSegunPlan } from "../lib/calculosBoletas.js";

const EVENTOS_NOTIFICACION = [
  { id: "cita", label: "Nueva solicitud de cita" },
  { id: "correo", label: "Nuevo correo entrante" },
];

// ---------- Utilidades de mapa (OpenStreetMap, sin API key) ----------

export function PanelAdmin({ usuarios, setUsuarios, clientes, setClientes, usuarioActual, permisosRoles, actualizarPermisoRol, notificacionesRoles, actualizarNotificacionRol, esAdmin, cargandoUsuarios, loginsPendientes, setLoginsPendientes, solicitudesRegistro, setSolicitudesRegistro, setTareasEquipo, setObjetivosSemanales, setObjetivosMensuales, setProspectos, setCitasAgenda }) {
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [filtroLogin, setFiltroLogin] = useState("todos");
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [borrarId, setBorrarId] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: "", rol: "paseador" });
  const [creando, setCreando] = useState(false);
  const [credencialesNuevo, setCredencialesNuevo] = useState(null);
  const [masOpciones, setMasOpciones] = useState(false);
  const [fotoUrlNuevo, setFotoUrlNuevo] = useState(null);
  const [fechaInicioNuevo, setFechaInicioNuevo] = useState("");
  const [bancoNuevo, setBancoNuevo] = useState("");
  const [tipoCuentaNuevo, setTipoCuentaNuevo] = useState("Cuenta corriente");
  const [numeroCuentaNuevo, setNumeroCuentaNuevo] = useState("");
  const [clientesSeleccionadosNuevo, setClientesSeleccionadosNuevo] = useState([]);
  const [capacitacionAbiertaId, setCapacitacionAbiertaId] = useState(null);
  const [gestionandoSolicitudId, setGestionandoSolicitudId] = useState(null);
  // Una solicitud de registro es gente nueva sin cuenta previa — no hay
  // "rol anterior" que restaurar (a diferencia de un login eliminado),
  // así que en vez de forzar "paseador" y confiar en que después alguien
  // se acuerde de corregirlo, se elige el rol acá mismo, como parte del
  // acto de aprobar.
  const [rolesSolicitud, setRolesSolicitud] = useState({});
  const [reseteandoId, setReseteandoId] = useState(null);
  const [passwordReseteada, setPasswordReseteada] = useState(null);

  const hoyNuevo = new Date();
  const mesActualNuevo = hoyNuevo.getMonth(), anioActualNuevo = hoyNuevo.getFullYear();

  async function subirFotoNuevo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoUrlNuevo(await comprimirImagen(file));
  }

  function toggleClienteNuevo(id) {
    setClientesSeleccionadosNuevo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const clientesElegidosNuevo = clientes.filter((c) => clientesSeleccionadosNuevo.includes(c.id));
  const horarioPorDiaNuevo = DIAS_SEMANA_LARGO.map((nombreDia, dow) => ({
    dia: nombreDia,
    clientes: clientesElegidosNuevo.filter((c) => c.diasHabituales?.includes(dow)),
  }));
  const paseosSemanaNuevo = clientesElegidosNuevo.reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
  const gananciaSemanalNuevo = clientesElegidosNuevo.reduce((acc, c) => acc + (c.diasHabituales?.length || 0) * Number(c.tarifaPaseador || 0), 0);
  const gananciaMensualNuevo = clientesElegidosNuevo.reduce((acc, c) => {
    const paseosMes = diasSegunPlan(mesActualNuevo, anioActualNuevo, c.diasHabituales || []).length;
    return acc + paseosMes * Number(c.tarifaPaseador || 0);
  }, 0);

  async function resetearPassword(u) {
    if (reseteandoId || !u.email) return;
    setReseteandoId(u.id);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/reset-password-usuario", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ email: u.email }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        showToast(data.error || "No se pudo resetear la contraseña");
        return;
      }
      setPasswordReseteada({ nombre: u.nombre, email: u.email, password: data.password });
    } catch {
      showToast("No se pudo resetear la contraseña — revisa tu conexión.");
    } finally {
      setReseteandoId(null);
    }
  }

  const filtrados = usuarios
    .filter((u) => u.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()))
    .filter((u) => filtroRol === "todos" || u.rol === filtroRol)
    .filter((u) => filtroLogin === "todos" || (filtroLogin === "con" ? !!u.email : !u.email));

  function clientesDe(nombre) {
    return clientes.filter((c) => c.paseadorNombre === nombre).length;
  }

  function actualizarRol(id, rol) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, rol } : u)));
  }

  function actualizarMetaMensual(id, valor) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, metaMensual: valor === "" ? null : Number(valor) } : u)));
  }

  function actualizarCapacidad(id, valor) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, capacidadMaxima: valor === "" ? null : Number(valor) } : u)));
  }

  function toggleCapacitacion(id, pasoId) {
    setUsuarios((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      const actual = u.capacitacionCompletada || [];
      const completado = actual.includes(pasoId)
        ? actual.filter((p) => p !== pasoId)
        : [...actual, pasoId];
      return { ...u, capacitacionCompletada: completado };
    }));
  }

  function empezarEdicionNombre(u) {
    setEditandoId(u.id);
    setNombreEditado(u.nombre);
  }

  function guardarNombre(id) {
    const nombreNuevo = nombreEditado.trim();
    if (nombreNuevo) {
      const usuario = usuarios.find((u) => u.id === id);
      setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, nombre: nombreNuevo } : u)));
      // El nombre se usa como referencia (no un id) en varias otras
      // pestañas — si no se propaga acá, la persona "desaparece" de sus
      // clientes/tareas/objetivos/prospectos/citas asignados apenas se
      // le cambia el nombre, aunque siga siendo la misma cuenta.
      if (usuario && usuario.nombre !== nombreNuevo) {
        const nombreViejo = usuario.nombre;
        setClientes((prev) => prev.map((c) => ({
          ...c,
          paseadorNombre: c.paseadorNombre === nombreViejo ? nombreNuevo : c.paseadorNombre,
          adiestradorNombre: c.adiestradorNombre === nombreViejo ? nombreNuevo : c.adiestradorNombre,
          responsableNombre: c.responsableNombre === nombreViejo ? nombreNuevo : c.responsableNombre,
        })));
        if (setTareasEquipo) setTareasEquipo((prev) => prev.map((t) => (t.asignadoA === nombreViejo ? { ...t, asignadoA: nombreNuevo } : t)));
        if (setObjetivosSemanales) setObjetivosSemanales((prev) => prev.map((o) => (o.asignadoA === nombreViejo ? { ...o, asignadoA: nombreNuevo } : o)));
        if (setObjetivosMensuales) setObjetivosMensuales((prev) => prev.map((o) => (o.asignadoA === nombreViejo ? { ...o, asignadoA: nombreNuevo } : o)));
        if (setProspectos) setProspectos((prev) => prev.map((p) => (p.asignadoA === nombreViejo ? { ...p, asignadoA: nombreNuevo } : p)));
        if (setCitasAgenda) setCitasAgenda((prev) => prev.map((c) => (c.adiestrador === nombreViejo ? { ...c, adiestrador: nombreNuevo } : c)));
      }
    }
    setEditandoId(null);
  }

  function confirmarBorrar(u) {
    setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
    if (u.email) {
      setLoginsPendientes((prev) => [...prev, { id: Date.now(), nombre: u.nombre, email: u.email, rol: u.rol, eliminadoEn: new Date().toISOString() }]);
    }
    setBorrarId(null);
  }

  function quitarLoginPendiente(id) {
    setLoginsPendientes((prev) => prev.filter((l) => l.id !== id));
  }

  // Reconstruye la fila de usuarios a partir de lo que quedó guardado en
  // logins_pendientes_borrar (nombre + email) al momento de eliminarlo. Su
  // cuenta de acceso en Supabase Auth no se borró (eliminar acá nunca la
  // toca, ver nota más abajo), así que solo hace falta el perfil — no se
  // crea una cuenta nueva ni se le cambia la contraseña.
  function restaurarLogin(l) {
    const rol = l.rol || "paseador";
    setUsuarios((prev) => [...prev, { id: Date.now(), nombre: l.nombre, rol, email: l.email }]);
    quitarLoginPendiente(l.id);
    showToast(l.rol
      ? `${l.nombre} fue restaurado con su rol anterior, "${rol}".`
      : `${l.nombre} fue restaurado — no se guardó su rol anterior (se borró antes de este cambio), quedó como "paseador". Ajústalo en la lista de arriba si corresponde otro.`);
  }

  async function agregar() {
    if (!nuevo.nombre.trim() || creando) return;
    setCreando(true);
    const nombreNuevo = nuevo.nombre.trim();
    const email = slugEmailUsuario(nombreNuevo);
    const { password, error } = await crearCuentaAcceso(email);
    if (error) {
      showToast(`No se pudo crear la cuenta de acceso: ${error.message}`);
      setCreando(false);
      return;
    }
    const usuarioNuevo = {
      id: Date.now(), nombre: nombreNuevo, rol: nuevo.rol, email,
      fotoUrl: fotoUrlNuevo, fechaInicio: fechaInicioNuevo,
      datosBancarios: { banco: bancoNuevo, tipoCuenta: tipoCuentaNuevo, numeroCuenta: numeroCuentaNuevo },
    };
    setUsuarios((prev) => [...prev, usuarioNuevo]);
    if (clientesSeleccionadosNuevo.length > 0) {
      setClientes((prev) => prev.map((c) => (clientesSeleccionadosNuevo.includes(c.id) ? { ...c, paseadorNombre: usuarioNuevo.nombre } : c)));
    }
    const detalleClientes = clientesElegidosNuevo.length > 0 ? ` con ${clientesElegidosNuevo.length} cliente(s) asignado(s)` : "";
    setCredencialesNuevo({ nombre: nombreNuevo, email, password, detalleClientes });
    setNuevo({ nombre: "", rol: "paseador" });
    setFotoUrlNuevo(null); setFechaInicioNuevo(""); setBancoNuevo(""); setNumeroCuentaNuevo(""); setClientesSeleccionadosNuevo([]);
    setMasOpciones(false);
    setCreando(false);
  }

  // La cuenta de acceso (Supabase Auth) ya existe desde que la persona
  // mandó el formulario — la creó api/solicitud-registro.js con la
  // contraseña que ella misma eligió. Aprobar solo activa su perfil en
  // usuarios, que es lo que realmente le da entrada a la app.
  async function aprobarSolicitud(s) {
    if (gestionandoSolicitudId) return;
    const rol = rolesSolicitud[s.id] || "paseador";
    setGestionandoSolicitudId(s.id);
    try {
      const email = slugEmailUsuario(s.nombre);
      setUsuarios((prev) => [...prev, { id: Date.now(), nombre: s.nombre, rol, email }]);
      const { error: errorUpdate } = await supabase.from("solicitudes_registro").update({ estado: "aprobada" }).eq("id", s.id);
      if (errorUpdate) showToast(`El perfil se creó, pero no se pudo marcar la solicitud como aprobada: ${errorUpdate.message}`);
      setSolicitudesRegistro((prev) => prev.filter((x) => x.id !== s.id));
      showToast(`${s.nombre} fue aprobado con rol "${rol}" — ya puede entrar con la contraseña que eligió.`);
    } catch (err) {
      showToast(`No se pudo aprobar la solicitud: ${err.message || "error desconocido"}`);
    } finally {
      setGestionandoSolicitudId(null);
    }
  }

  // Al rechazar queda una cuenta de Supabase Auth huérfana (se creó al
  // mandar el formulario, pero nunca va a tener perfil en usuarios) —
  // se agrega a la misma lista de "logins pendientes de borrar" que ya
  // se usa para las cuentas eliminadas, para que el administrador se
  // acuerde de borrarla a mano en el dashboard de Supabase.
  async function rechazarSolicitud(s) {
    if (gestionandoSolicitudId) return;
    setGestionandoSolicitudId(s.id);
    const { error } = await supabase.from("solicitudes_registro").update({ estado: "rechazada" }).eq("id", s.id);
    if (error) {
      showToast(`No se pudo rechazar la solicitud: ${error.message}`);
      setGestionandoSolicitudId(null);
      return;
    }
    setSolicitudesRegistro((prev) => prev.filter((x) => x.id !== s.id));
    setLoginsPendientes((prev) => [...prev, { id: Date.now(), nombre: s.nombre, email: slugEmailUsuario(s.nombre), eliminadoEn: new Date().toISOString() }]);
    setGestionandoSolicitudId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Permisos por rol — qué pestañas ve cada uno</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 16 }}>
          Marca o desmarca las pestañas que puede ver cada rol. Los cambios se aplican al instante — la próxima vez que esa persona entre (o recargue la página) va a ver el menú actualizado.
        </p>
        {!permisosRoles ? (
          <p style={{ fontSize: 13, color: "#8A7E5C", display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando permisos...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520, fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "#8A7E5C", fontWeight: 600, borderBottom: "1px solid #E4DBC3" }}>Pestaña</th>
                  {ROLES_APP.map((r) => (
                    <th key={r} style={{ textAlign: "center", padding: "6px 10px", color: NAVY, fontWeight: 700, borderBottom: "1px solid #E4DBC3", textTransform: "capitalize" }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TODOS_LOS_TABS.map((t) => (
                  <tr key={t.id}>
                    <td style={{ padding: "7px 10px", color: INK, borderBottom: "1px solid #F1EAD9" }}>{t.label}</td>
                    {ROLES_APP.map((r) => {
                      const bloqueado = r === "administrador" && t.id === "usuarios";
                      const soloLectura = bloqueado || !esAdmin;
                      const activo = permisosRoles[r]?.includes(t.id) || bloqueado;
                      return (
                        <td key={r} style={{ textAlign: "center", padding: "7px 10px", borderBottom: "1px solid #F1EAD9" }}>
                          <input type="checkbox" checked={activo} disabled={soloLectura}
                            title={bloqueado ? "El administrador siempre necesita ver Usuarios, para no perder acceso a esta pantalla" : !esAdmin ? "Solo un administrador puede cambiar los permisos" : ""}
                            onChange={(e) => actualizarPermisoRol(r, t.id, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: soloLectura ? "not-allowed" : "pointer" }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Notificaciones por rol — qué aviso push recibe cada uno</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 16 }}>
          Marca o desmarca qué rol recibe cada notificación. Solo le llega a quien además haya activado las notificaciones en su navegador (el ícono de campana del header).
        </p>
        {!notificacionesRoles ? (
          <p style={{ fontSize: 13, color: "#8A7E5C", display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando notificaciones...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520, fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "#8A7E5C", fontWeight: 600, borderBottom: "1px solid #E4DBC3" }}>Aviso</th>
                  {ROLES_APP.map((r) => (
                    <th key={r} style={{ textAlign: "center", padding: "6px 10px", color: NAVY, fontWeight: 700, borderBottom: "1px solid #E4DBC3", textTransform: "capitalize" }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTOS_NOTIFICACION.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ padding: "7px 10px", color: INK, borderBottom: "1px solid #F1EAD9" }}>{ev.label}</td>
                    {ROLES_APP.map((r) => {
                      const activo = notificacionesRoles[r]?.includes(ev.id);
                      return (
                        <td key={r} style={{ textAlign: "center", padding: "7px 10px", borderBottom: "1px solid #F1EAD9" }}>
                          <input type="checkbox" checked={activo} disabled={!esAdmin}
                            title={!esAdmin ? "Solo un administrador puede cambiar las notificaciones" : ""}
                            onChange={(e) => actualizarNotificacionRol(r, ev.id, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: esAdmin ? "pointer" : "not-allowed" }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Usuarios del sistema ({usuarios.length})</h2>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
          <input placeholder="Buscar por nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option value="todos">Todos los roles</option>
            {ROLES_APP.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={filtroLogin} onChange={(e) => setFiltroLogin(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option value="todos">Con o sin login</option>
            <option value="con">Con login</option>
            <option value="sin">Sin login</option>
          </select>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cargandoUsuarios && <p style={{ color: "#8A7E5C", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando usuarios…</p>}
          {!cargandoUsuarios && filtrados.map((u) => {
            const esUsuarioActual = usuarioActual && u.email === usuarioActual.email;
            return (
              <div key={u.id} style={{ padding: "14px 16px", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: "50%", background: u.fotoUrl ? `url(${u.fotoUrl}) center/cover` : NAVY, display: "flex", alignItems: "center", justifyContent: "center", color: CREAM, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {!u.fotoUrl && u.nombre.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div style={{ color: NAVY, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {editandoId === u.id ? (
                          <>
                            <input value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)} autoFocus
                              onKeyDown={(e) => e.key === "Enter" && guardarNombre(u.id)}
                              style={{ fontSize: 13.5, padding: "3px 6px", border: "1px solid #E4DBC3", borderRadius: 5, width: 160 }} />
                            <button onClick={() => guardarNombre(u.id)} style={{ border: "none", background: "none", color: "#2E5C41", cursor: "pointer", fontSize: 12 }}>Guardar</button>
                            <button onClick={() => setEditandoId(null)} style={{ border: "none", background: "none", color: "#8A7E5C", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            {u.nombre}
                            {esUsuarioActual && <span style={{ fontSize: 11, color: GOLD, fontWeight: 500 }}>(tú)</span>}
                            <button onClick={() => empezarEdicionNombre(u)} title="Cambiar nombre" style={{ border: "none", background: "none", color: "#B0A587", cursor: "pointer", fontSize: 12 }}>✎</button>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A7E5C" }}>{u.email || "sin correo asignado"}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: "#6B6248" }}>{clientesDe(u.nombre)} cliente(s) asignado(s)</span>
                    <button onClick={() => setCapacitacionAbiertaId(capacitacionAbiertaId === u.id ? null : u.id)}
                      style={{ border: "1px solid #E4DBC3", background: "none", color: NAVY, borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                      Capacitación {(u.capacitacionCompletada || []).length}/{PASOS_CAPACITACION.length} {capacitacionAbiertaId === u.id ? "▴" : "▾"}
                    </button>
                    {esAdmin ? (
                      <select value={u.rol} onChange={(e) => actualizarRol(u.id, e.target.value)} style={{ ...input, marginBottom: 0, width: 170, padding: "8px 10px", fontSize: 13 }}>
                        <option value="paseador">Paseador</option>
                        <option value="entrenador">Entrenador</option>
                        <option value="coordinador">Coordinador</option>
                        <option value="administrador">Administrador general</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "#6B6248" }}>
                        {{ paseador: "Paseador", entrenador: "Entrenador", coordinador: "Coordinador", administrador: "Administrador general" }[u.rol] || u.rol}
                      </span>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6248" }}>
                      Máx. perros/manada
                      <input type="number" min="0" placeholder="sin límite" value={u.capacidadMaxima ?? ""} onChange={(e) => actualizarCapacidad(u.id, e.target.value)}
                        style={{ width: 64, fontSize: 12.5, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6248" }}>
                      Meta mensual
                      <input type="number" min="0" placeholder="sin meta" value={u.metaMensual ?? ""} onChange={(e) => actualizarMetaMensual(u.id, e.target.value)}
                        style={{ width: 90, fontSize: 12.5, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6 }} />
                    </label>
                    {esAdmin && u.email && (
                      <BotonEliminar onConfirm={() => resetearPassword(u)} disabled={reseteandoId === u.id}
                        label={reseteandoId === u.id ? "Reseteando..." : "Resetear contraseña"}
                        style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5 }} />
                    )}
                    {esAdmin && (
                      <button onClick={() => setBorrarId(u.id)} disabled={esUsuarioActual}
                        title={esUsuarioActual ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
                        style={{ border: "none", background: "none", color: esUsuarioActual ? "#C9BFA0" : RUST, cursor: esUsuarioActual ? "not-allowed" : "pointer", fontSize: 12.5 }}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
                {capacitacionAbiertaId === u.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1EAD9", display: "flex", flexDirection: "column", gap: 8 }}>
                    {PASOS_CAPACITACION.map((paso) => {
                      const hecho = (u.capacitacionCompletada || []).includes(paso.id);
                      return (
                        <label key={paso.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: hecho ? "#2F6A46" : INK }}>
                          <input type="checkbox" checked={hecho} onChange={() => toggleCapacitacion(u.id, paso.id)} />
                          {paso.texto}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!cargandoUsuarios && filtrados.length === 0 && <p style={{ color: "#8A7E5C", fontSize: 13.5 }}>No hay usuarios que coincidan con la búsqueda.</p>}
        </div>

        {passwordReseteada && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8, fontSize: 13, color: "#8A6A1E", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ Contraseña reseteada para {passwordReseteada.nombre} — pásale estos datos:</p>
            <p style={{ margin: 0 }}>Correo: <b>{passwordReseteada.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña nueva: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{passwordReseteada.password}</b></p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigator.clipboard.writeText(`Correo: ${passwordReseteada.email}\nContraseña: ${passwordReseteada.password}`)}
                style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
              <button onClick={() => setPasswordReseteada(null)} style={{ border: "none", background: "none", color: "#8A6A1E", cursor: "pointer", fontSize: 12 }}>Cerrar</button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 14, lineHeight: 1.5 }}>
          Nota: eliminar aquí quita el acceso de esta persona a la app, pero su cuenta de acceso sigue existiendo en Supabase → Authentication → Users — bórrala también ahí si quieres cerrarla por completo. Cambiar el nombre (✎) no cambia su correo de acceso, así que puede seguir entrando con la misma contraseña de siempre.
        </p>
      </div>

      {esAdmin && (
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Agregar usuario</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <input placeholder="Nombre completo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} style={{ ...input, flex: 1, minWidth: 200, marginBottom: 0 }} />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} style={{ ...input, marginBottom: 0, width: 190 }}>
            <option value="paseador">Paseador</option>
            <option value="entrenador">Entrenador</option>
            <option value="coordinador">Coordinador</option>
            <option value="administrador">Administrador general</option>
          </select>
          <button onClick={agregar} disabled={!nuevo.nombre.trim() || creando} style={{ ...botonPrincipal, width: "auto", padding: "0 22px", opacity: !nuevo.nombre.trim() || creando ? 0.5 : 1 }}>
            {creando ? "Creando cuenta..." : "Agregar"}
          </button>
        </div>
        {!nuevo.nombre.trim() && <p style={{ color: "#8A7E5C", fontSize: 12.5, margin: "8px 0 0" }}>Ingresa el nombre para poder agregar.</p>}

        {!masOpciones ? (
          <button onClick={() => setMasOpciones(true)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600, marginTop: 12, padding: 0 }}>
            + Agregar foto, fecha de inicio, datos bancarios y clientes
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="howria-photo-row" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20 }}>
              <div>
                <div style={{ width: 100, height: 100, borderRadius: "50%", background: fotoUrlNuevo ? `url(${fotoUrlNuevo}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
                  {!fotoUrlNuevo && "Foto"}
                </div>
                <label style={{ ...botonSecundario, display: "inline-block", marginTop: 10, padding: "6px 10px", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
                  Subir foto
                  <input type="file" accept="image/*" onChange={subirFotoNuevo} style={{ display: "none" }} />
                </label>
              </div>
              <div>
                <label style={label} htmlFor="nuevo-fecha-inicio">Fecha de inicio de contrato</label>
                <input id="nuevo-fecha-inicio" type="date" value={fechaInicioNuevo} onChange={(e) => setFechaInicioNuevo(e.target.value)} style={{ ...input, marginBottom: 0, maxWidth: 220 }} />
              </div>
            </div>

            <p style={{ ...label, marginTop: 22 }}>Datos bancarios para el pago</p>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 6 }}>
              <input placeholder="Banco" value={bancoNuevo} onChange={(e) => setBancoNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={tipoCuentaNuevo} onChange={(e) => setTipoCuentaNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option>Cuenta corriente</option>
                <option>Cuenta vista</option>
                <option>Cuenta RUT</option>
              </select>
              <input placeholder="N° de cuenta" value={numeroCuentaNuevo} onChange={(e) => setNumeroCuentaNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>

            <p style={{ ...label, marginTop: 22 }}>Clientes a asignar (opcional)</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 6 }}>
              {clientes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: clientesSeleccionadosNuevo.includes(c.id) ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={clientesSeleccionadosNuevo.includes(c.id)} onChange={() => toggleClienteNuevo(c.id)} />
                  <span>{c.nombre} · 🐾 {c.perro} {c.paseadorNombre && <span style={{ color: "#8A7E5C", fontSize: 11.5 }}>(hoy: {c.paseadorNombre})</span>}</span>
                </label>
              ))}
            </div>
            <p style={hint}>Si un cliente ya tenía otro paseador asignado, al registrar quedará reasignado a este nuevo ingreso. Puedes dejarlo sin marcar y asignar clientes más adelante editando la ficha del cliente en Clientes.</p>

            <button onClick={() => setMasOpciones(false)} style={{ border: "none", background: "none", color: "#8A7E5C", cursor: "pointer", fontSize: 12.5, marginTop: 6, padding: 0 }}>
              Menos opciones
            </button>
          </div>
        )}

        {masOpciones && clientesElegidosNuevo.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDE4CE" }}>
            <h2 style={sectionTitle}>Horario resultante</h2>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {horarioPorDiaNuevo.map((d) => (
                <div key={d.dia} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                  <span style={{ width: 90, color: NAVY, fontWeight: 600 }}>{d.dia}</span>
                  <span style={{ color: d.clientes.length ? INK : "#B0A587" }}>
                    {d.clientes.length ? d.clientes.map((c) => `${c.nombre} (${c.perro})`).join(" · ") : "Libre"}
                  </span>
                </div>
              ))}
            </div>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 22 }}>
              <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
                <p style={{ ...label, marginBottom: 6 }}>Paseos por semana</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 19 }}>{paseosSemanaNuevo}</p>
              </div>
              <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia semanal estimada</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaSemanalNuevo)}</p>
              </div>
              <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia mensual estimada</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaMensualNuevo)}</p>
              </div>
            </div>
          </div>
        )}

        {credencialesNuevo && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, fontSize: 13, color: "#2F6A46", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ Cuenta creada para {credencialesNuevo.nombre}{credencialesNuevo.detalleClientes} — pásale estos datos para que pueda entrar:</p>
            <p style={{ margin: 0 }}>Correo: <b>{credencialesNuevo.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{credencialesNuevo.password}</b></p>
            <button onClick={() => navigator.clipboard.writeText(`Correo: ${credencialesNuevo.email}\nContraseña: ${credencialesNuevo.password}`)}
              style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
          </div>
        )}
      </div>
      )}

      {esAdmin && solicitudesRegistro.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#D8ECDE", border: "1px solid #2F6A46" }}>
          <h2 style={{ ...sectionTitle, color: "#2F6A46" }}>Solicitudes de registro pendientes ({solicitudesRegistro.length})</h2>
          <p style={{ fontSize: 13, color: "#2E5C41", marginTop: -8, marginBottom: 14 }}>
            Gente que pidió unirse al equipo desde "Registro de cuenta" en el login (ya eligieron su propia contraseña). Elige el rol que le corresponde antes de aprobar — activa su perfil con ese rol. Rechazar deja pendiente borrar su cuenta de acceso — se agrega abajo a "Logins pendientes de borrar".
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {solicitudesRegistro.map((s) => (
              <div key={s.id} style={{ background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <b style={{ color: NAVY, fontSize: 14 }}>{s.nombre}</b>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>
                      {s.email}{s.telefono ? ` · ${s.telefono}` : ""} · {new Date(s.creado_en).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <select value={rolesSolicitud[s.id] || "paseador"} onChange={(e) => setRolesSolicitud((prev) => ({ ...prev, [s.id]: e.target.value }))}
                      style={{ ...input, margin: 0, padding: "6px 8px", fontSize: 12.5, width: 130 }}>
                      {ROLES_APP.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <button onClick={() => aprobarSolicitud(s)} disabled={gestionandoSolicitudId === s.id}
                      style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      {gestionandoSolicitudId === s.id ? "Aprobando..." : "Aprobar"}
                    </button>
                    <BotonEliminar onConfirm={() => rechazarSolicitud(s)} disabled={gestionandoSolicitudId === s.id} label="Rechazar"
                      style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12, fontWeight: 600 }} />
                  </div>
                </div>
                {s.mensaje && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#5C5442", fontStyle: "italic" }}>"{s.mensaje}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {esAdmin && loginsPendientes.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#FBF6E9", border: `1px solid ${GOLD}` }}>
          <h2 style={{ ...sectionTitle, color: "#8A6A1E" }}>Logins pendientes de borrar en Supabase ({loginsPendientes.length})</h2>
          <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 14 }}>
            Al eliminar a alguien aquí, su acceso a la app se corta al instante, pero su cuenta de acceso sigue existiendo en Supabase → Authentication → Users hasta que la borres ahí a mano. Esta lista es solo para que no se te olvide.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loginsPendientes.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 13 }}>
                  <b style={{ color: NAVY }}>{l.nombre}</b> · {l.email}
                  <span style={{ color: "#8A7E5C", fontSize: 12 }}> · eliminado el {new Date(l.eliminadoEn).toLocaleDateString("es-CL")}</span>
                </span>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <button onClick={() => restaurarLogin(l)} title="Lo eliminé por error — recrear su perfil con este correo"
                    style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    Restaurar
                  </button>
                  <button onClick={() => quitarLoginPendiente(l.id)} title="Ya lo borré en Supabase"
                    style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    Ya lo borré, quitar de la lista
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {borrarId && (() => {
        const u = usuarios.find((x) => x.id === borrarId);
        if (!u) return null;
        return (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${u.nombre}?`}
            mensaje="Pierde el acceso a la app al instante. Su cuenta de acceso en Supabase no se borra sola — queda anotada abajo, en 'Logins pendientes de borrar', para que te acuerdes de borrarla ahí también."
            textoConfirmar="Eliminar usuario"
            onConfirmar={() => confirmarBorrar(u)}
            onCancelar={() => setBorrarId(null)}
          />
        );
      })()}
    </div>
  );
}
