// Pestaña Prospección — seguimiento de leads antes de convertirse en
// cliente. Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas y
// src/tabs/_compartido.jsx para lo compartido.
import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, TIPOS_SERVICIO, ESTADOS_PROSPECTO, ORIGENES_PROSPECTO,
  tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario, Spinner,
  BotonEliminar, BotonConfirmable, fechaKey,
} from "../HowriaAdmin.jsx";
import { HistorialUnificado } from "./_compartido.jsx";

const PROSPECTO_VACIO = { nombre: "", telefono: "", perro: "", direccion: "", origen: "Instagram", tipoServicio: ["paseos"], estado: "nuevo", proximoSeguimiento: "", asignadoA: "", bitacora: [] };

export function Prospectos({ prospectos, setProspectos, setClientes, usuarios, permisosRoles, cargando, correos = [], enfoqueEmail, limpiarEnfoque, rolActual, nombreActual }) {
  // Crear/eliminar prospectos es trabajo de coordinador/administrador
  // únicamente — así lo exige la política de Postgres desde el principio
  // (mi_rol() in ('coordinador','administrador'), ver
  // 012_equipo_agenda_prospectos.sql), entrenador solo tiene una
  // excepción angosta para SUS propios prospectos (database/055).
  // "!== entrenador" dejaba pasar también a paseador, que nunca tuvo
  // permiso — tocar esos botones fallaría en silencio contra la
  // política de Postgres en vez de explicar por qué.
  const puedeCrearYEliminar = rolActual === "coordinador" || rolActual === "administrador";
  // Solo tiene sentido ofrecer como "responsable" a alguien que de verdad
  // puede entrar a esta pestaña — si permisosRoles todavía no cargó, se
  // muestra la lista completa para no dejar el selector vacío mientras tanto.
  const usuariosConAccesoSeguimiento = permisosRoles ? usuarios.filter((u) => permisosRoles[u.rol]?.includes("seguimiento")) : usuarios;
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(PROSPECTO_VACIO);
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [soloMios, setSoloMios] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [intentoCrear, setIntentoCrear] = useState(false);

  useEffect(() => {
    if (!enfoqueEmail) return;
    setBusqueda(enfoqueEmail);
    limpiarEnfoque();
  }, [enfoqueEmail]);

  function crearProspecto() {
    setIntentoCrear(true);
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setProspectos((prev) => [...prev, { ...form, id: Date.now(), nombre: form.nombre.trim() }]);
    setForm(PROSPECTO_VACIO);
    setMostrarForm(false);
    setIntentoCrear(false);
  }

  function actualizarCampo(id, campo, valor) {
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  function agregarNotaProspecto(id, texto) {
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, bitacora: [...p.bitacora, { creadoEn: new Date().toISOString(), texto }] } : p)));
  }

  function eliminarProspecto(id) {
    setProspectos((prev) => prev.filter((p) => p.id !== id));
  }

  function convertirACliente(p) {
    setClientes((prev) => [...prev, {
      id: Date.now(), nombre: p.nombre, perro: p.perro || "Sin nombre", telefono: p.telefono, email: p.email || null,
      valorPaseoRef: 0, raza: "", pesoKg: 0, fotoUrl: null, diasHabituales: [], planHabitual: "LV",
      objetivos: "", paseadorNombre: "", tarifaPaseador: 0, direccion: p.direccion || "", lat: null, lng: null, tipoServicio: p.tipoServicio,
      // Se lleva la bitácora del prospecto al historial del cliente
      // nuevo — al convertir se borra el prospecto, así que si no se
      // copia acá se pierde para siempre todo lo conversado antes.
      bitacora: p.bitacora || [],
    }]);
    setProspectos((prev) => prev.filter((x) => x.id !== p.id));
  }

  const hoyStr = fechaKey(new Date());
  const esVencido = (p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido";
  const busquedaLimpia = busqueda.trim().toLowerCase();

  const listaFiltrada = prospectos
    .filter((p) => !soloMios || p.asignadoA === nombreActual)
    .filter((p) => {
      if (busquedaLimpia) {
        return p.nombre.toLowerCase().includes(busquedaLimpia)
          || (p.telefono || "").toLowerCase().includes(busquedaLimpia)
          || (p.perro || "").toLowerCase().includes(busquedaLimpia)
          || (p.email || "").toLowerCase().includes(busquedaLimpia);
      }
      if (filtroEstado === "todos") return true;
      if (filtroEstado === "activos") return p.estado !== "ganado" && p.estado !== "perdido";
      if (filtroEstado === "vencidos") return esVencido(p);
      return p.estado === filtroEstado;
    })
    .sort((a, b) => (a.proximoSeguimiento || "9999").localeCompare(b.proximoSeguimiento || "9999"));

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando prospectos…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Seguimiento de prospectos</h2>
            <p style={hint}>Para no perder el hilo de una conversación de venta — cada contacto de campaña queda con su estado y notas.</p>
          </div>
          {puedeCrearYEliminar && (
            <button onClick={() => { setMostrarForm((v) => !v); setIntentoCrear(false); }} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>
              {mostrarForm ? "Cancelar" : "+ Nuevo prospecto"}
            </button>
          )}
        </div>

        {mostrarForm && puedeCrearYEliminar && (
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 18, margin: "16px 0" }}>
            <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <input placeholder="Teléfono / WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <input placeholder="Nombre del perro (si lo sabes)" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <select value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                {ORIGENES_PROSPECTO.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input type="date" value={form.proximoSeguimiento} onChange={(e) => setForm({ ...form, proximoSeguimiento: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <select value={form.asignadoA} onChange={(e) => setForm({ ...form, asignadoA: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                <option value="">Sin asignar</option>
                {usuariosConAccesoSeguimiento.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
              <input placeholder="Dirección (si la sabes)" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                style={{ ...input, marginBottom: 0, gridColumn: "1 / -1" }} />
            </div>
            <p style={{ ...label, marginTop: 12 }} id="prospecto-interes-label">Interés en</p>
            <div role="group" aria-labelledby="prospecto-interes-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {TIPOS_SERVICIO.map((t) => (
                <button key={t.id} type="button" onClick={() => setForm((f) => ({ ...f, tipoServicio: f.tipoServicio.includes(t.id) ? f.tipoServicio.filter((x) => x !== t.id) : [...f.tipoServicio, t.id] }))} aria-pressed={form.tipoServicio.includes(t.id)}
                  style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                    border: form.tipoServicio.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                    background: form.tipoServicio.includes(t.id) ? NAVY : "#FFFFFF", color: form.tipoServicio.includes(t.id) ? CREAM : INK }}>
                  {t.nombre}
                </button>
              ))}
            </div>
            {intentoCrear && (!form.nombre.trim() || !form.telefono.trim()) && (
              <p style={{ color: RUST, fontSize: 12.5, margin: "0 0 10px" }}>
                {!form.nombre.trim() ? "Falta el nombre del prospecto" : "Falta el teléfono"} — es obligatorio para guardar, así queda alguna forma de contactarlo después.
              </p>
            )}
            <button onClick={crearProspecto} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px", marginTop: 0, opacity: intentoCrear && (!form.nombre.trim() || !form.telefono.trim()) ? 0.6 : 1 }}>Guardar prospecto</button>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <div style={{ position: "relative", maxWidth: 340, flex: "1 1 260px" }}>
            <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input placeholder="Buscar por nombre, teléfono o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }} />
          </div>
          {nombreActual && (
            <button onClick={() => setSoloMios((v) => !v)}
              style={{ padding: "9px 16px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", flex: "none",
                border: soloMios ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: soloMios ? NAVY : "#FFFFFF", color: soloMios ? CREAM : INK, fontWeight: soloMios ? 600 : 400 }}>
              Asignados a mí
            </button>
          )}
        </div>
        <p style={{ ...hint, marginTop: 6 }}>La búsqueda revisa todos los prospectos guardados, sin importar su estado — útil para encontrar un contacto o cliente pasado.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, opacity: busquedaLimpia ? 0.4 : 1, pointerEvents: busquedaLimpia ? "none" : "auto" }}>
          <button onClick={() => setFiltroEstado("activos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "activos" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: filtroEstado === "activos" ? NAVY : "#FFFFFF", color: filtroEstado === "activos" ? CREAM : INK }}>
            Activos ({prospectos.filter((p) => p.estado !== "ganado" && p.estado !== "perdido").length})
          </button>
          <button onClick={() => setFiltroEstado("vencidos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "vencidos" ? `1.5px solid ${RUST}` : "1px solid #DCD2B4",
              background: filtroEstado === "vencidos" ? RUST : "#FFFFFF", color: filtroEstado === "vencidos" ? "#FFFFFF" : RUST, fontWeight: 600 }}>
            ⚠️ Vencidos ({prospectos.filter(esVencido).length})
          </button>
          <button onClick={() => setFiltroEstado("todos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "todos" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: filtroEstado === "todos" ? NAVY : "#FFFFFF", color: filtroEstado === "todos" ? CREAM : INK }}>
            Todos ({prospectos.length})
          </button>
          {ESTADOS_PROSPECTO.map((e) => (
            <button key={e.id} onClick={() => setFiltroEstado(e.id)}
              style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: filtroEstado === e.id ? `1.5px solid ${e.color}` : "1px solid #DCD2B4",
                background: filtroEstado === e.id ? e.bg : "#FFFFFF", color: e.color }}>
              {e.nombre} ({prospectos.filter((p) => p.estado === e.id).length})
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {listaFiltrada.map((p) => {
          const est = ESTADOS_PROSPECTO.find((e) => e.id === p.estado) || ESTADOS_PROSPECTO[0];
          const vencido = esVencido(p);
          return (
            <div key={p.id} className="howria-card" style={{ ...tarjeta, borderLeft: vencido ? `4px solid ${RUST}` : "4px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <b style={{ color: NAVY, fontSize: 15 }}>{p.nombre}</b>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8A7E5C" }}>
                    {p.telefono || "sin teléfono"} {p.email && `· ${p.email}`} {p.perro && `· 🐾 ${p.perro}`} · {p.origen}
                    {p.tipoServicio?.length > 0 && ` · interés: ${p.tipoServicio.map((t) => TIPOS_SERVICIO.find((x) => x.id === t)?.nombre).join(", ")}`}
                  </p>
                  {p.direccion && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>📍 {p.direccion}</p>}
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>
                    Responsable: <b style={{ color: p.asignadoA ? NAVY : "#8A7E5C" }}>{p.asignadoA || "sin asignar"}</b>
                  </p>
                  {p.proximoSeguimiento && (
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: vencido ? RUST : "#8A7E5C" }}>
                      {vencido ? "⚠️ Seguimiento vencido" : "Próximo seguimiento"}: {new Date(p.proximoSeguimiento + "T00:00:00").toLocaleDateString("es-CL")}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <select value={p.estado} onChange={(e) => actualizarCampo(p.id, "estado", e.target.value)}
                    style={{ border: "none", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: est.bg, color: est.color }}>
                    {ESTADOS_PROSPECTO.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  <input type="date" value={p.proximoSeguimiento || ""} onChange={(e) => actualizarCampo(p.id, "proximoSeguimiento", e.target.value)}
                    style={{ ...input, marginBottom: 0, padding: "6px 10px", fontSize: 12.5, width: 150 }} />
                  <select value={p.asignadoA || ""} onChange={(e) => actualizarCampo(p.id, "asignadoA", e.target.value)}
                    style={{ ...input, marginBottom: 0, padding: "6px 10px", fontSize: 12.5, width: 150 }}>
                    <option value="">Sin asignar</option>
                    {usuariosConAccesoSeguimiento.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14, background: CREAM_SOFT, borderRadius: 8, padding: 12 }}>
                <p style={{ ...label, marginBottom: 8 }}>Historial — notas y correos</p>
                <HistorialUnificado notas={p.bitacora} onAgregarNota={(texto) => agregarNotaProspecto(p.id, texto)}
                  correos={p._dbId ? correos.filter((c) => c.prospectoId === p._dbId) : []}
                  placeholderNota="Ej. quedó en confirmar el jueves..." />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {p.estado === "ganado" && puedeCrearYEliminar && (
                  <BotonConfirmable onConfirm={() => convertirACliente(p)} label="Convertir a cliente" confirmLabel="Sí, convertir" colorConfirmar="#2F6A46"
                    title="Crea el cliente y elimina este prospecto (se lleva la bitácora al historial del cliente)"
                    style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }} />
                )}
                {puedeCrearYEliminar && (
                  <BotonEliminar onConfirm={() => eliminarProspecto(p.id)} label="Eliminar prospecto" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
                )}
              </div>
            </div>
          );
        })}
        {listaFiltrada.length === 0 && (
          <div className="howria-card" style={tarjeta}><p style={{ ...hint, margin: 0 }}>No hay prospectos en este filtro.</p></div>
        )}
      </div>
    </div>
  );
}
