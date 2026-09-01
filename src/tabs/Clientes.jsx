// Pestaña Clientes — ficha madre del cliente (formulario, mascotas, perfil,
// historial) y la lista con filtros. Ver src/HowriaAdmin.jsx (React.lazy)
// por la lista completa de pestañas y src/tabs/_compartido.jsx para lo compartido.
import { useState, useEffect } from "react";
import { Search, ArrowUpDown } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, PLANES, DIAS_SEMANA, MESES, TIPOS_SERVICIO, ESTADOS_CLIENTE,
  NIVELES_ENERGIA, TAGS_TEMPERAMENTO, tarjeta, sectionTitle, hint, label, input, botonPrincipal,
  botonSecundario, SkeletonTarjetaCliente, BotonEliminar, ModalConfirmacion, fmtCLP, esBoletaDeCliente, showToast,
  comprimirFotoPerfil, tipoServicioComoAlumno, BotonConfirmable,
} from "../HowriaAdmin.jsx";
import { supabase } from "../lib/supabaseClient.js";
import { calcularTotales, esVenta } from "../lib/calculosBoletas.js";
import { TarjetaResumenFactura, SeccionPlegable, TIPOS_CITA, hayChoqueHorario, fechaISOaInputLocal, HistorialUnificado, FilaBoletaVenta } from "./_compartido.jsx";

// Los dos negocios de Howria. Un cliente cae en uno o en otro (hoy
// ninguno hace las dos cosas, pero el filtro soporta que lo haga: en ese
// caso aparecería en las dos vistas, que es lo correcto).
function esDePaseos(c) {
  return (c.tipoServicio || []).includes("paseos");
}
function esDeAdiestramiento(c) {
  const t = c.tipoServicio || [];
  return t.includes("evaluacion") || t.includes("clases");
}

// Lo que hay que saber de un cliente de adiestramiento sin abrir su
// ficha: en qué va la evaluación, cuántas clases lleva y cuándo vuelve.
function resumenAdiestramiento(cliente, citasAgenda, planesClases, clasesRealizadas) {
  const suyas = citasAgenda.filter((c) => c.clienteId && c.clienteId === cliente._dbId);
  const evaluaciones = suyas.filter((c) => c.tipo === "evaluacion" && c.estado !== "cancelada");
  const hecha = evaluaciones.find((c) => c.estado === "realizada") || null;

  const planes = planesClases.filter((p) => p.clienteId === cliente._dbId);
  const totalClases = planes.reduce((acc, p) => acc + (p.numClases || 0), 0);
  const idsPlanes = new Set(planes.map((p) => p._dbId).filter(Boolean));
  const hechas = clasesRealizadas.filter((cr) => idsPlanes.has(cr.planId)).length;

  const ahora = Date.now();
  const proxima = suyas
    .filter((c) => c.estado !== "cancelada" && c.estado !== "realizada" && new Date(c.fechaISO).getTime() >= ahora)
    .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO))[0] || null;

  return {
    tieneEvaluacion: evaluaciones.length > 0,
    evaluacionHecha: !!hecha,
    evaluacionPagada: !!(hecha && hecha.pagada),
    totalClases,
    clasesHechas: hechas,
    proxima,
  };
}

const FORM_VACIO = { nombre: "", perro: "", telefono: "", email: "", valorPaseoRef: "", raza: "", pesoKg: "", fotoUrl: null, diasHabituales: [], diasPuntuales: [], horaHabitual: "", planHabitual: "LV", objetivos: "", paseadorNombre: "", tarifaPaseador: "", adiestradorNombre: "", responsableNombre: "", direccion: "", lat: null, lng: null, tipoServicio: ["paseos"], estadoCliente: "activo", fechaInicio: "" };

// Calendario para marcar fechas sueltas de paseo. Existe para el cliente
// que no tiene días fijos sino los que el tutor avisa cada mes: sin esto
// quedaba sin ningún día, o sea invisible en Coordinación, imposible de
// marcar y por lo tanto imposible de pagarle al paseador.
//
// Guarda claves "2026-09-02" y no números de día, porque una fecha suelta
// pertenece a un mes concreto — a diferencia de los días habituales, que
// se repiten todas las semanas.
function CalendarioDiasPuntuales({ seleccionados, onToggle, mesOffset, onMes }) {
  const base = new Date();
  const mes = new Date(base.getFullYear(), base.getMonth() + mesOffset, 1);
  const anio = mes.getFullYear(), mesIdx = mes.getMonth();
  const total = new Date(anio, mesIdx + 1, 0).getDate();
  const offset = (new Date(anio, mesIdx, 1).getDay() + 6) % 7;
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  const claveDe = (d) => `${anio}-${String(mesIdx + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const enEsteMes = seleccionados.filter((k) => k.startsWith(`${anio}-${String(mesIdx + 1).padStart(2, "0")}`));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
        <p style={{ ...label, marginBottom: 0 }}>Fechas sueltas (para quien no tiene días fijos)</p>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => onMes(mesOffset - 1)} aria-label="Mes anterior"
            style={{ border: "1px solid #DCD2B4", background: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 13 }}>←</button>
          <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600, minWidth: 110, textAlign: "center" }}>
            {MESES[mesIdx]} {anio}
          </span>
          <button type="button" onClick={() => onMes(mesOffset + 1)} aria-label="Mes siguiente"
            style={{ border: "1px solid #DCD2B4", background: "#fff", borderRadius: 6, padding: "2px 8px", cursor: "pointer", fontSize: 13 }}>→</button>
        </div>
      </div>
      <p style={{ ...hint, marginTop: 0, marginBottom: 8 }}>
        Marca los días que te avisó el tutor. Se suman a los días de arriba, así que un cliente con días fijos no necesita tocar esto.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DIAS_SEMANA.map((d, i) => <div key={i} style={{ textAlign: "center", fontSize: 10.5, color: "#9A9179", fontWeight: 600 }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {celdas.map((d, i) => {
          if (d === null) return <div key={`v${i}`} />;
          const clave = claveDe(d);
          const activo = seleccionados.includes(clave);
          return (
            <button key={clave} type="button" onClick={() => onToggle(clave)} aria-pressed={activo}
              style={{ aspectRatio: "1", borderRadius: 6, cursor: "pointer", fontSize: 12.5,
                border: activo ? `1.5px solid ${GOLD}` : "1px solid #E4DBC3",
                background: activo ? NAVY : "#FFFFFF", color: activo ? CREAM : INK, fontWeight: activo ? 600 : 400 }}>
              {d}
            </button>
          );
        })}
      </div>
      <p style={{ ...hint, marginTop: 6, marginBottom: 0 }}>
        {enEsteMes.length === 0 ? "Ninguna fecha marcada este mes." : `${enEsteMes.length} paseo(s) marcado(s) en ${MESES[mesIdx]}.`}
      </p>
    </div>
  );
}

function FormularioCliente({ inicial, paseadores, entrenadores, responsables, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial ?? FORM_VACIO);
  // Mes que se está mirando en el calendario de fechas sueltas. 0 = el
  // actual; los cobros del mes que viene se preparan desde el 20, así que
  // hay que poder adelantarse.
  const [mesPuntual, setMesPuntual] = useState(0);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const formInvalido = !form.nombre.trim() || !form.perro.trim();

  function toggleDiaHabitual(dow) {
    setForm((f) => ({ ...f, diasHabituales: f.diasHabituales.includes(dow) ? f.diasHabituales.filter((d) => d !== dow) : [...f.diasHabituales, dow].sort() }));
  }
  // Fechas sueltas: para el cliente que no tiene días fijos sino los que
  // el tutor avisa mes a mes. Se guardan como "2026-09-02" para que
  // estaProgramadoEnFecha pueda compararlas con fechaKey directo.
  function toggleDiaPuntual(clave) {
    setForm((f) => {
      const actuales = f.diasPuntuales || [];
      return { ...f, diasPuntuales: actuales.includes(clave) ? actuales.filter((d) => d !== clave) : [...actuales, clave].sort() };
    });
  }

  function toggleTipoServicio(tipoId) {
    setForm((f) => ({ ...f, tipoServicio: f.tipoServicio.includes(tipoId) ? f.tipoServicio.filter((t) => t !== tipoId) : [...f.tipoServicio, tipoId] }));
  }

  function elegirPlan(planId) {
    const plan = PLANES.find((p) => p.id === planId);
    setForm((f) => ({ ...f, planHabitual: planId, diasHabituales: plan.id === "PERSONALIZADO" ? f.diasHabituales : plan.dias }));
  }

  async function subirFoto(e) {
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
    <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 22, margin: "16px 0" }}>
      <h3 style={{ ...sectionTitle, fontSize: 15, marginBottom: 14 }}>Datos del cliente y del perro</h3>
      <div className="howria-photo-row" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20 }}>
        <div>
          <div style={{ width: 100, height: 100, borderRadius: 10, background: form.fotoUrl ? `url(${form.fotoUrl}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
            {!form.fotoUrl && "Foto del perro"}
          </div>
          <label style={{ ...botonSecundario, display: "inline-block", marginTop: 10, padding: "6px 10px", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
            Subir foto
            <input type="file" accept="image/*" onChange={subirFoto} style={{ display: "none" }} />
          </label>
        </div>

        <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input placeholder="Nombre cliente" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Teléfono / WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input type="email" placeholder="Correo (para que pueda entrar a su portal)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Nombre del perro" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Raza" value={form.raza} onChange={(e) => setForm({ ...form, raza: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Peso (kg)" type="number" min="0" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Valor paseo referencial" type="number" min="0" value={form.valorPaseoRef} onChange={(e) => setForm({ ...form, valorPaseoRef: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Dirección (para la pestaña Mapa)" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value, lat: null, lng: null })} style={{ ...input, marginBottom: 0, gridColumn: "1 / -1" }} />
        </div>
      </div>

      <h3 style={{ ...sectionTitle, fontSize: 15, marginTop: 26, paddingTop: 20, borderTop: "1px solid #E4DBC3", marginBottom: 14 }}>Plan y horario de paseo</h3>
      <p style={{ ...label, marginTop: 0 }} id="cliente-plan-label">Plan que normalmente contrata</p>
      <div role="group" aria-labelledby="cliente-plan-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PLANES.filter((p) => p.id !== "PERSONALIZADO").map((p) => (
          <button key={p.id} type="button" onClick={() => elegirPlan(p.id)} aria-pressed={form.planHabitual === p.id}
            style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: form.planHabitual === p.id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.planHabitual === p.id ? NAVY : "#FFFFFF",
              color: form.planHabitual === p.id ? CREAM : INK }}>
            {p.nombre}
          </button>
        ))}
      </div>

      {form.tipoServicio.includes("paseos") && (
        <>
          <p style={label} id="cliente-dias-label">Días de paseo habituales</p>
          <div role="group" aria-labelledby="cliente-dias-label" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
            {DIAS_SEMANA.map((d, dow) => (
              <button key={dow} type="button" onClick={() => toggleDiaHabitual(dow)} aria-pressed={form.diasHabituales.includes(dow)}
                style={{ width: 34, height: 34, borderRadius: 8, cursor: "pointer",
                  border: form.diasHabituales.includes(dow) ? `1.5px solid ${GOLD}` : "1px solid #DCD2B4",
                  background: form.diasHabituales.includes(dow) ? NAVY : "#FFFFFF",
                  color: form.diasHabituales.includes(dow) ? CREAM : INK, fontSize: 13 }}>
                {d}
              </button>
            ))}
          </div>

          <CalendarioDiasPuntuales
            seleccionados={form.diasPuntuales || []}
            onToggle={toggleDiaPuntual}
            mesOffset={mesPuntual}
            onMes={setMesPuntual}
          />

          <label style={label} htmlFor="cliente-hora-habitual">Hora habitual del paseo (opcional)</label>
          <input id="cliente-hora-habitual" type="time" value={form.horaHabitual} onChange={(e) => setForm({ ...form, horaHabitual: e.target.value })} style={{ ...input, maxWidth: 160 }} />
        </>
      )}

      <h3 style={{ ...sectionTitle, fontSize: 15, marginTop: 26, paddingTop: 20, borderTop: "1px solid #E4DBC3", marginBottom: 14 }}>Estado y objetivos</h3>
      <p style={{ ...label, marginTop: 0 }}>Estado del cliente y fecha de inicio</p>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <select value={form.estadoCliente} onChange={(e) => setForm({ ...form, estadoCliente: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          {ESTADOS_CLIENTE.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} style={{ ...input, marginBottom: 0 }} />
      </div>

      <p style={label} id="cliente-tiposervicio-label">Tipo de servicio</p>
      <div role="group" aria-labelledby="cliente-tiposervicio-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {TIPOS_SERVICIO.map((t) => (
          <button key={t.id} type="button" onClick={() => toggleTipoServicio(t.id)} aria-pressed={form.tipoServicio.includes(t.id)}
            style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: form.tipoServicio.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.tipoServicio.includes(t.id) ? NAVY : "#FFFFFF",
              color: form.tipoServicio.includes(t.id) ? CREAM : INK }}>
            {t.nombre}
          </button>
        ))}
      </div>
      {form.tipoServicio.includes("evaluacion") && (
        <p style={{ ...hint, marginTop: -10 }}>Para agendar la evaluación con el entrenador, guarda la ficha y ve a la pestaña "Agenda".</p>
      )}

      <label style={label} htmlFor="cliente-objetivos">Objetivos a cumplir</label>
      <textarea id="cliente-objetivos" value={form.objetivos} onChange={(e) => setForm({ ...form, objetivos: e.target.value })} placeholder="Ej. socialización, bajar ansiedad, mejorar caminata con correa..."
        style={{ ...input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />

      <h3 style={{ ...sectionTitle, fontSize: 15, marginTop: 26, paddingTop: 20, borderTop: "1px solid #E4DBC3", marginBottom: 14 }}>Equipo asignado</h3>
      <p style={{ ...label, marginTop: 0 }}>Paseador asignado</p>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <select value={form.paseadorNombre} onChange={(e) => setForm({ ...form, paseadorNombre: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          <option value="">Sin asignar</option>
          {paseadores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <input placeholder="Tarifa a pagar al paseador por paseo" type="number" min="0" value={form.tarifaPaseador} onChange={(e) => setForm({ ...form, tarifaPaseador: e.target.value })} style={{ ...input, marginBottom: 0 }} />
      </div>
      <p style={{ ...hint, marginTop: -10 }}>Esta tarifa es lo que se le paga al paseador por cada paseo de este cliente — puede ser distinta al valor cobrado al cliente.</p>
      {Number(form.tarifaPaseador) > 0 && Number(form.tarifaPaseador) > Number(form.valorPaseoRef || 0) && (
        <p style={{ ...hint, marginTop: -10, color: RUST, fontWeight: 600 }}>
          ⚠️ La tarifa del paseador ({fmtCLP(Number(form.tarifaPaseador))}) es mayor al valor cobrado al cliente ({fmtCLP(Number(form.valorPaseoRef))}) — Howria pierde plata en cada paseo de este cliente.
        </p>
      )}

      <p style={label}>Entrenador asignado (para clases de adiestramiento)</p>
      <select value={form.adiestradorNombre} onChange={(e) => setForm({ ...form, adiestradorNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {entrenadores.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
      </select>
      <p style={{ ...hint, marginTop: -10 }}>Define de quién son "sus" clientes en la Finanzas personal del entrenador.</p>

      <p style={label}>Responsable de la cuenta</p>
      <select value={form.responsableNombre} onChange={(e) => setForm({ ...form, responsableNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {responsables.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
      </select>
      <p style={{ ...hint, marginTop: -10 }}>Quién es el dueño del caso (ej. Javier Arniaz) — define de quién son las ventas de este cliente en la Finanzas personal de esa persona, sin importar su rol en la app.</p>

      <div style={{ marginTop: 26, paddingTop: 20, borderTop: "1px solid #E4DBC3" }}>
        {intentoGuardar && formInvalido && (
          <p style={{ color: RUST, fontSize: 12.5, margin: "0 0 10px" }}>Falta el nombre del cliente y/o del perro — son obligatorios para guardar.</p>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={guardar} style={{ ...botonPrincipal, marginTop: 0, opacity: intentoGuardar && formInvalido ? 0.6 : 1 }}>Guardar ficha</button>
          <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Mascotas (perfil del perro, separado del tutor) ----------
function FormularioMascota({ inicial, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial ?? { nombre: "", raza: "", pesoKg: "", nivelEnergia: "", temperamento: [], notas: "" });

  function toggleTemperamento(tagId) {
    setForm((f) => ({ ...f, temperamento: f.temperamento.includes(tagId) ? f.temperamento.filter((t) => t !== tagId) : [...f.temperamento, tagId] }));
  }

  function guardar() {
    if (!form.nombre.trim()) return;
    onGuardar({ ...form, pesoKg: Number(form.pesoKg) || 0 });
  }

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: 16, marginBottom: 10 }}>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input placeholder="Nombre del perro" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <input placeholder="Raza" value={form.raza} onChange={(e) => setForm({ ...form, raza: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <input placeholder="Peso (kg)" type="number" min="0" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <select value={form.nivelEnergia || ""} onChange={(e) => setForm({ ...form, nivelEnergia: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          <option value="">Nivel de energía...</option>
          {NIVELES_ENERGIA.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>
      <p style={{ ...label, marginTop: 12 }} id="mascota-temperamento-label">Temperamento</p>
      <div role="group" aria-labelledby="mascota-temperamento-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {TAGS_TEMPERAMENTO.map((t) => (
          <button key={t.id} type="button" onClick={() => toggleTemperamento(t.id)} aria-pressed={form.temperamento.includes(t.id)}
            style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: form.temperamento.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.temperamento.includes(t.id) ? NAVY : "#FFFFFF",
              color: form.temperamento.includes(t.id) ? CREAM : INK }}>
            {t.nombre}
          </button>
        ))}
      </div>
      <input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ ...input, marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// Cada perro con sus datos y, si ya tiene _dbId, un desplegable para
// marcar con quién no se lleva bien (persiste al toque, sin botón de
// guardar aparte — mismo criterio que el resto de los checkboxes de la app).
function FilaMascota({ mascota, todasLasMascotas, incompatibilidades, setMascotaIncompatibilidades, onEditar, onEliminar }) {
  const [verIncompatibles, setVerIncompatibles] = useState(false);
  const misIncompatibles = incompatibilidades.filter((i) => i.mascotaId1 === mascota._dbId || i.mascotaId2 === mascota._dbId);
  const idsIncompatibles = new Set(misIncompatibles.map((i) => (i.mascotaId1 === mascota._dbId ? i.mascotaId2 : i.mascotaId1)));
  const otrasMascotas = todasLasMascotas.filter((m) => m._dbId && m._dbId !== mascota._dbId);

  function toggleIncompatible(otraId) {
    if (idsIncompatibles.has(otraId)) {
      setMascotaIncompatibilidades((prev) => prev.filter((i) =>
        !((i.mascotaId1 === mascota._dbId && i.mascotaId2 === otraId) || (i.mascotaId1 === otraId && i.mascotaId2 === mascota._dbId))));
    } else {
      setMascotaIncompatibilidades((prev) => [...prev, { id: Date.now(), mascotaId1: mascota._dbId, mascotaId2: otraId }]);
    }
  }

  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: NAVY, fontSize: 13.5 }}>🐾 {mascota.nombre}</span>
          {mascota.necesitaRevision && (
            <span title="Puede ser más de un perro escrito junto — revisar y separar" style={{ marginLeft: 8, fontSize: 11, color: RUST, fontWeight: 600 }}>⚠️ Revisar</span>
          )}
          <span style={{ marginLeft: 8, fontSize: 12, color: "#8A7E5C" }}>
            {mascota.raza || "raza sin especificar"}{mascota.pesoKg ? ` · ${mascota.pesoKg} kg` : ""}
            {mascota.nivelEnergia ? ` · energía ${NIVELES_ENERGIA.find((n) => n.id === mascota.nivelEnergia)?.nombre?.toLowerCase()}` : ""}
          </span>
          {mascota.temperamento?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {mascota.temperamento.map((t) => (
                <span key={t} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 20, background: "#fff", color: "#8A7E5C" }}>
                  {TAGS_TEMPERAMENTO.find((x) => x.id === t)?.nombre || t}
                </span>
              ))}
            </div>
          )}
          {misIncompatibles.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: RUST }}>
              ⚠️ No se lleva bien con: {[...idsIncompatibles].map((id) => todasLasMascotas.find((m) => m._dbId === id)?.nombre || "?").join(", ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {mascota._dbId && (
            <button onClick={() => setVerIncompatibles((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12 }}>
              {verIncompatibles ? "Cerrar" : "Incompatibilidades"}
            </button>
          )}
          <button onClick={onEditar} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Editar</button>
          <BotonEliminar onConfirm={onEliminar} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
        </div>
      </div>
      {verIncompatibles && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4DBC3" }}>
          {otrasMascotas.length === 0 ? (
            <p style={{ ...hint, margin: 0 }}>No hay otros perros cargados todavía.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {otrasMascotas.map((m) => (
                <button key={m._dbId} onClick={() => toggleIncompatible(m._dbId)}
                  style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11.5, cursor: "pointer",
                    border: idsIncompatibles.has(m._dbId) ? `1.5px solid ${RUST}` : "1px solid #DCD2B4",
                    background: idsIncompatibles.has(m._dbId) ? RUST : "#FFFFFF",
                    color: idsIncompatibles.has(m._dbId) ? "#FFFFFF" : INK }}>
                  {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Perfil de cliente ----------
// Sección "Evaluación" de la ficha del cliente: en qué va cada
// evaluación y si ya la pagaron. "Ya se hizo" no es un campo nuevo — es
// el estado de la cita, que ya tenía 'realizada' desde database/012 y se
// marcaba solo desde Agenda; acá se puede marcar sin salir de la ficha.
// "Pagó" sí es nuevo (database/108) y es una marca simple, no una boleta.
function InterruptorEval({ activo, onClick, siText, noText, colorSi }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activo}
      style={{
        padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", minHeight: 38,
        border: activo ? `1.5px solid ${colorSi}` : "1px solid #DCD2B4",
        background: activo ? colorSi : "#FFFFFF",
        color: activo ? "#FFFFFF" : "#6B6248", fontWeight: activo ? 700 : 400,
      }}>
      {activo ? siText : noText}
    </button>
  );
}

function SeccionEvaluacion({ cliente, citasEvaluacion, setCitas, onArchivar, packsClases = [], onComproPack, citasAgenda = [] }) {
  // Cita sobre la que se está eligiendo hora nueva, y la hora elegida.
  const [reprogramandoId, setReprogramandoId] = useState(null);
  const [nuevaFechaHora, setNuevaFechaHora] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Cancelar y reprogramar pasan por el servidor y no por un cambio de
  // estado local: además de mover la cita, le avisan al cliente por
  // correo. Un 502 significa que la cita SÍ cambió y solo falló el
  // correo, así que igual hay que reflejarlo en pantalla.
  async function llamarApi(ruta, cuerpo, alExito) {
    if (enviando) return;
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify(cuerpo),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo completar la acción.");
        return;
      }
      alExito();
      if (resp.status === 502) showToast(resultado.error);
      else if (resultado.aviso) showToast(resultado.aviso);
      else showToast("Listo — se le avisó al cliente por correo.", "exito");
    } catch {
      showToast("No se pudo conectar — revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  function cancelarCita(cita) {
    // Una cita que nunca se confirmó se "rechaza"; una confirmada se
    // "cancela". El correo que recibe el cliente es distinto en cada
    // caso (ver api/cancelar-cita.js), por eso no es lo mismo.
    const accion = cita.estado === "pendiente" ? "rechazar" : "cancelar";
    llamarApi("/api/cancelar-cita", { citaId: cita._dbId, accion }, () => {
      const estadoNuevo = accion === "rechazar" ? "rechazada" : "cancelada";
      setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, estado: estadoNuevo } : c)));
    });
  }

  function reprogramarCita(cita) {
    if (!nuevaFechaHora) return;
    if (new Date(nuevaFechaHora).getTime() <= Date.now()) {
      showToast("La fecha nueva tiene que ser en el futuro.");
      return;
    }
    if (hayChoqueHorario(citasAgenda.filter((c) => c.id !== cita.id), cita.adiestrador, nuevaFechaHora, cita.duracionMin || 60)) {
      showToast(`${cita.adiestrador} ya tiene otra cita en ese horario.`);
      return;
    }
    const iso = new Date(nuevaFechaHora).toISOString();
    llamarApi("/api/mover-cita", { citaId: cita._dbId, fechaNueva: iso }, () => {
      setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, fechaISO: iso } : c)));
      setReprogramandoId(null);
      setNuevaFechaHora("");
    });
  }

  const hechas = citasEvaluacion.filter((c) => c.estado === "realizada").length;
  const pagadas = citasEvaluacion.filter((c) => c.pagada).length;

  function actualizarCita(cita, cambios) {
    setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, ...cambios } : c)));
  }

  function toggleRealizada(cita) {
    actualizarCita(cita, { estado: cita.estado === "realizada" ? "agendada" : "realizada" });
  }

  function togglePagada(cita) {
    const pagaAhora = !cita.pagada;
    actualizarCita(cita, {
      pagada: pagaAhora,
      pagadaEn: pagaAhora ? new Date().toISOString().slice(0, 10) : null,
    });
  }

  // Solo tiene sentido archivar a alguien que vino por la evaluación, ya
  // la hizo, y no quedó tomando nada más.
  const soloVinoPorEvaluacion = (cliente.tipoServicio || []).every((t) => t === "evaluacion");
  const yaEstaCerrado = (cliente.estadoCliente || "activo") === "evaluado";
  const puedeArchivar = soloVinoPorEvaluacion && hechas > 0 && !yaEstaCerrado;

  const resumen = citasEvaluacion.length === 0
    ? "Sin evaluaciones agendadas"
    : `${hechas} de ${citasEvaluacion.length} realizada(s) · ${pagadas} pagada(s)`;

  return (
    <SeccionPlegable titulo="Evaluación" subtitulo={resumen} defaultAbierta>
      {citasEvaluacion.length === 0 ? (
        <p style={hint}>Este cliente no tiene evaluaciones agendadas.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {citasEvaluacion.map((cita) => (
            <div key={cita.id} style={{ background: CREAM_SOFT, borderRadius: 10, padding: 12 }}>
              <p style={{ margin: "0 0 8px", fontSize: 13.5, color: NAVY, fontWeight: 600 }}>
                {new Date(cita.fechaISO).toLocaleString("es-CL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                {cita.adiestrador ? ` · ${cita.adiestrador}` : ""}
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <InterruptorEval activo={cita.estado === "realizada"} onClick={() => toggleRealizada(cita)}
                  siText="✓ Ya se hizo" noText="Marcar como hecha" colorSi="#2F6A46" />
                <InterruptorEval activo={!!cita.pagada} onClick={() => togglePagada(cita)}
                  siText="✓ Pagada" noText="Marcar como pagada" colorSi={GOLD} />
              </div>

              {/* Solo mientras la cita sigue viva. Una ya realizada o
                  cancelada no se mueve ni se cancela de nuevo. */}
              {["pendiente", "agendada"].includes(cita.estado) && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <BotonConfirmable onConfirm={() => cancelarCita(cita)}
                    label={cita.estado === "pendiente" ? "Rechazar hora" : "Cancelar cita"} colorConfirmar={RUST}
                    style={{ border: "1px solid #DCD2B4", background: "#FFFFFF", color: RUST, borderRadius: 20, padding: "7px 14px", fontSize: 12.5, cursor: "pointer", minHeight: 38 }} />
                  {/* Reprogramar solo tiene sentido en una cita ya
                      confirmada: una pendiente todavía no tiene hora
                      comprometida con nadie, ahí se confirma o se rechaza. */}
                  {cita.estado === "agendada" && (
                    <button type="button" disabled={enviando}
                      onClick={() => {
                        setReprogramandoId(reprogramandoId === cita.id ? null : cita.id);
                        setNuevaFechaHora(fechaISOaInputLocal(cita.fechaISO));
                      }}
                      style={{ border: "1px solid #DCD2B4", background: "#FFFFFF", color: NAVY, borderRadius: 20, padding: "7px 14px", fontSize: 12.5, cursor: "pointer", minHeight: 38, opacity: enviando ? 0.5 : 1 }}>
                      {reprogramandoId === cita.id ? "Cerrar" : "Reprogramar cita"}
                    </button>
                  )}
                </div>
              )}

              {reprogramandoId === cita.id && (
                <div style={{ marginTop: 10, padding: 12, background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8 }}>
                  <label style={label} htmlFor={`reprogramar-${cita.id}`}>Nueva fecha y hora</label>
                  <input id={`reprogramar-${cita.id}`} type="datetime-local" value={nuevaFechaHora}
                    onChange={(e) => setNuevaFechaHora(e.target.value)} style={{ ...input, marginBottom: 10, maxWidth: 240 }} />
                  <p style={{ ...hint, margin: "0 0 10px" }}>Al guardar se le manda un correo al cliente con la hora nueva y la anterior tachada.</p>
                  <button onClick={() => reprogramarCita(cita)} disabled={!nuevaFechaHora || enviando}
                    style={{ ...botonPrincipal, marginTop: 0, width: "auto", padding: "8px 18px", opacity: !nuevaFechaHora || enviando ? 0.45 : 1 }}>
                    {enviando ? "Guardando..." : "Guardar y avisar"}
                  </button>
                </div>
              )}
              {cita.pagada && cita.pagadaEn && (
                <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8A7E5C" }}>Pagó el {cita.pagadaEn}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* El otro final posible de una evaluación: en vez de cerrarse, el
          cliente compra clases. Se elige el pack y pasa a ser alumno con
          su plan ya armado. La boleta se emite aparte, en Boletas
          (modo "Pack con precio propio"), porque el precio no siempre es
          el mismo para todos. */}
      {!yaEstaCerrado && hechas > 0 && !(cliente.tipoServicio || []).includes("clases") && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E4DBC3" }}>
          <p style={{ ...label, marginBottom: 6 }}>¿Compró un pack de clases?</p>
          {packsClases.filter((p) => p.activo).length === 0 ? (
            <p style={{ ...hint, margin: 0 }}>No hay packs cargados todavía — se crean en Alumnos, sección “Packs de clases”.</p>
          ) : (
            <>
              <p style={{ ...hint, margin: "0 0 8px" }}>
                Al elegirlo pasa de evaluación a clases, con el plan creado para ir marcando cada una.
                La boleta se emite aparte, en Boletas.
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {packsClases.filter((p) => p.activo).map((pack) => (
                  <button key={pack._dbId || pack.id} type="button" onClick={() => onComproPack(pack)}
                    style={{ ...botonSecundario, width: "auto", padding: "8px 16px", margin: 0 }}>
                    {pack.nombre} ({pack.numClases} clase{pack.numClases === 1 ? "" : "s"})
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {yaEstaCerrado && (
        <p style={{ ...hint, marginTop: 12, color: "#6B6248" }}>
          Este cliente está archivado como <b>Solo evaluación</b>. Para reactivarlo, cámbiale el estado desde “Editar”.
        </p>
      )}
      {puedeArchivar && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E4DBC3" }}>
          <p style={{ ...hint, margin: "0 0 8px" }}>
            Vino solo por la evaluación y ya se hizo. Si no va a seguir con paseos ni clases, archívalo:
            sale de las listas de pendientes y queda bajo el filtro “Solo evaluación”.
          </p>
          <button onClick={onArchivar} style={{ ...botonSecundario, width: "auto", padding: "8px 16px" }}>
            Solo evaluación — archivar cliente
          </button>
        </div>
      )}
    </SeccionPlegable>
  );
}

function PerfilCliente({ cliente, boletasCliente, boletasAdiestramientoCliente, correosCliente = [], citasCliente = [], usuarios = [], citasAgenda = [], packsClases = [], setPlanesClases, nombreUsuario: _nombreUsuarioPerfil, setCitas, setClientes, setBoletasEmitidas, setBoletasAdiestramiento, onVolver, onEditar, onEliminar, puedeEliminar, nombreUsuario, mascotas = [], setMascotas, mascotaIncompatibilidades = [], setMascotaIncompatibilidades }) {
  const plan = PLANES.find((p) => p.id === cliente.planHabitual);
  const historialVentas = [
    ...boletasCliente.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramientoCliente.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  const totalHistorico = calcularTotales(historialVentas.filter(esVenta)).ingresos;
  const puedeAgendar = cliente.tipoServicio?.includes("clases") || cliente.tipoServicio?.includes("evaluacion");
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [mostrarFormMascota, setMostrarFormMascota] = useState(false);
  const [editandoMascotaId, setEditandoMascotaId] = useState(null);
  const mascotasDelCliente = mascotas.filter((m) => m.clienteId === cliente._dbId);

  const adiestradoresDisponibles = usuarios.filter((u) => u.rol === "entrenador");
  const [mostrarAgendar, setMostrarAgendar] = useState(false);
  const [agendarAdiestrador, setAgendarAdiestrador] = useState(cliente.adiestradorNombre || adiestradoresDisponibles[0]?.nombre || "");
  const [agendarTipo, setAgendarTipo] = useState(cliente.tipoServicio?.includes("evaluacion") ? "evaluacion" : "clase");
  const [agendarFechaHora, setAgendarFechaHora] = useState("");

  function agregarAlCalendario() {
    if (!agendarFechaHora || !agendarAdiestrador) return;
    if (new Date(agendarFechaHora).getTime() <= Date.now()) {
      showToast("La fecha y hora deben ser en el futuro.");
      return;
    }
    if (hayChoqueHorario(citasAgenda, agendarAdiestrador, agendarFechaHora)) {
      showToast(`${agendarAdiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => [...prev, {
      id: Date.now(), clienteId: cliente._dbId, clienteNombre: cliente.nombre, perro: cliente.perro,
      email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion,
      tipo: agendarTipo, adiestrador: agendarAdiestrador, fechaISO: new Date(agendarFechaHora).toISOString(),
      estado: "agendada", origen: "staff", notas: "",
    }]);
    setAgendarFechaHora("");
    setMostrarAgendar(false);
    showToast(`Agregado al calendario de ${agendarAdiestrador}.`);
  }

  function copiarLinkAgenda() {
    const link = `${window.location.origin}/agendaadiestrador?c=${cliente._dbId}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    });
  }

  function guardarMascota(datos) {
    if (editandoMascotaId) {
      setMascotas((prev) => prev.map((m) => (m.id === editandoMascotaId ? { ...datos, id: editandoMascotaId, _dbId: m._dbId, clienteId: cliente._dbId } : m)));
    } else {
      setMascotas((prev) => [...prev, { ...datos, id: Date.now(), clienteId: cliente._dbId }]);
    }
    setMostrarFormMascota(false);
    setEditandoMascotaId(null);
  }

  function eliminarMascota(m) {
    setMascotas((prev) => prev.filter((x) => x.id !== m.id));
    if (m._dbId) {
      setMascotaIncompatibilidades((prev) => prev.filter((i) => i.mascotaId1 !== m._dbId && i.mascotaId2 !== m._dbId));
    }
  }

  function agregarNotaCliente(texto) {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, bitacora: [...(c.bitacora || []), { creadoEn: new Date().toISOString(), texto }] } : c)));
  }

  // Resúmenes de una línea para cada sección plegable de abajo — se ven
  // aunque la sección esté cerrada, así una ficha larga (mucho historial,
  // muchas boletas) sigue siendo escaneable sin tener que abrir todo.
  const resumenMascotas = mascotasDelCliente.length === 0
    ? "Sin perfil de mascota todavía."
    : `${mascotasDelCliente.length} mascota${mascotasDelCliente.length > 1 ? "s" : ""} registrada${mascotasDelCliente.length > 1 ? "s" : ""}.`;
  const resumenPlanTrabajo = !cliente.tipoServicio?.includes("paseos")
    ? "Este cliente no tiene paseos en su plan."
    : cliente.diasHabituales?.length
    ? `Paseos: ${cliente.diasHabituales.map((d) => DIAS_SEMANA[d]).join(" ")}${cliente.horaHabitual ? ` · ${cliente.horaHabitual}` : ""}`
    : "Sin días de paseo asignados todavía.";
  const totalItemsHistorial = (cliente.bitacora?.length || 0) + correosCliente.length + citasCliente.length;
  const resumenHistorial = totalItemsHistorial === 0
    ? "Sin notas, correos ni citas registradas."
    : `${totalItemsHistorial} registro(s) — notas, correos y citas.`;
  const resumenVentas = historialVentas.length === 0
    ? "Todavía no se le ha generado ninguna boleta."
    : `${historialVentas.length} boleta(s) · total histórico ${fmtCLP(totalHistorico)}.`;

  return (
    <div>
      <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18, flex: "none" }}>← Volver a clientes</button>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A7E5C", fontSize: 12, flex: "none", border: `3px solid ${CREAM_SOFT}` }}>
              {!cliente.fotoUrl && "Sin foto"}
            </div>
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 2 }}>{cliente.perro}
                {(() => { const e = ESTADOS_CLIENTE.find((x) => x.id === (cliente.estadoCliente || "activo")); return (
                  <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: e.bg, color: e.color, verticalAlign: "middle" }}>{e.nombre}</span>
                ); })()}
                {cliente.tipoServicio?.includes("evaluacion") && (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#D6E6EE", color: "#1E5A7A", verticalAlign: "middle" }}>Evaluación</span>
                )}
              </h2>
              <p style={{ margin: "0 0 4px", color: "#8A7E5C", fontSize: 14 }}>Dueño/a: {cliente.nombre}</p>
              <p style={{ margin: 0, color: "#8A7E5C", fontSize: 14 }}>{cliente.telefono || "sin teléfono"} {cliente.email ? `· ${cliente.email}` : "· sin correo (no puede entrar a su portal)"}</p>
              <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>{cliente.raza || "Raza no especificada"} {cliente.pesoKg ? `· ${cliente.pesoKg} kg` : ""}</p>
              <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>📍 {cliente.direccion || "Sin dirección registrada"}</p>
              {cliente.fechaInicio && <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>Cliente desde: {new Date(cliente.fechaInicio + "T00:00:00").toLocaleDateString("es-CL")}</p>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {(cliente.tipoServicio || []).map((t) => (
                  <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>
                    {TIPOS_SERVICIO.find((x) => x.id === t)?.nombre || t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "none", maxWidth: "100%", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {puedeAgendar && cliente._dbId && (
              <button onClick={copiarLinkAgenda} style={botonSecundario}>{linkCopiado ? "¡Copiado!" : "Copiar link de agenda"}</button>
            )}
            {adiestradoresDisponibles.length > 0 && cliente._dbId && (
              <button onClick={() => setMostrarAgendar((v) => !v)} style={botonSecundario}>
                {mostrarAgendar ? "Cancelar" : "+ Agregar al calendario del adiestrador"}
              </button>
            )}
            <button onClick={onEditar} style={botonSecundario}>Editar</button>
            {puedeEliminar && (
              <button onClick={() => setConfirmandoEliminar(true)} style={{ ...botonSecundario, borderColor: RUST, color: RUST }}>Eliminar</button>
            )}
          </div>
        </div>

        {mostrarAgendar && (
          <div style={{ marginTop: 18, padding: 14, background: CREAM_SOFT, borderRadius: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={label} htmlFor="agendar-adiestrador">Entrenador</label>
              <select id="agendar-adiestrador" value={agendarAdiestrador} onChange={(e) => setAgendarAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {adiestradoresDisponibles.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="agendar-tipo">Tipo</label>
              <select id="agendar-tipo" value={agendarTipo} onChange={(e) => setAgendarTipo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {TIPOS_CITA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="agendar-fecha">Fecha y hora</label>
              <input id="agendar-fecha" type="datetime-local" value={agendarFechaHora} onChange={(e) => setAgendarFechaHora(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button onClick={agregarAlCalendario} disabled={!agendarFechaHora} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: agendarFechaHora ? 1 : 0.6 }}>
                Agregar al calendario
              </button>
            </div>
          </div>
        )}

        {confirmandoEliminar && (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${cliente.nombre}?`}
            mensaje={`Se borra la ficha de ${cliente.nombre} y de su perro ${cliente.perro} — boletas, historial y datos de contacto quedan asociados a un cliente que ya no vas a poder ver ni editar.`}
            textoConfirmar="Eliminar cliente"
            onConfirmar={() => { onEliminar(); setConfirmandoEliminar(false); }}
            onCancelar={() => setConfirmandoEliminar(false)}
          />
        )}

        <div style={{ marginTop: 28, paddingTop: 22, borderTop: "1px solid #EDE4CE" }}>
          <h3 style={sectionTitle}>Datos clave</h3>
          <div className="howria-g5" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12 }}>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Plan habitual</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{plan?.nombre || "No definido"}</p>
            </div>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Valor de paseo referencial</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{fmtCLP(cliente.valorPaseoRef)}</p>
            </div>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Paseador asignado</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>
                {cliente.paseadorNombre || "Sin asignar"}{cliente.tarifaPaseador ? ` · ${fmtCLP(cliente.tarifaPaseador)}/paseo` : ""}
              </p>
            </div>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Responsable de la cuenta</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{cliente.responsableNombre || "Sin asignar"}</p>
            </div>
            <div style={{ background: NAVY, borderRadius: 8, padding: 14 }}>
              <p style={{ margin: "0 0 6px", fontSize: 11, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>Total facturado histórico</p>
              <p style={{ margin: 0, color: CREAM, fontWeight: 700, fontSize: 15 }}>{fmtCLP(totalHistorico)}</p>
            </div>
          </div>
        </div>
      </div>

      <SeccionPlegable titulo="Mascotas" subtitulo={resumenMascotas} defaultAbierta>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: mostrarFormMascota ? 12 : 4 }}>
          <button onClick={() => { setEditandoMascotaId(null); setMostrarFormMascota((v) => !v); }} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
            {mostrarFormMascota && !editandoMascotaId ? "Cancelar" : "+ Agregar mascota"}
          </button>
        </div>
        {mostrarFormMascota && (
          <FormularioMascota
            inicial={editandoMascotaId ? mascotasDelCliente.find((m) => m.id === editandoMascotaId) : null}
            onGuardar={guardarMascota}
            onCancelar={() => { setMostrarFormMascota(false); setEditandoMascotaId(null); }}
          />
        )}
        {mascotasDelCliente.length === 0 ? (
          <p style={hint}>Sin perfil de mascota todavía — usa "+ Agregar mascota" para cargar raza, energía y temperamento.</p>
        ) : (
          <div>
            {mascotasDelCliente.map((m) => (
              <FilaMascota key={m.id} mascota={m} todasLasMascotas={mascotas} incompatibilidades={mascotaIncompatibilidades}
                setMascotaIncompatibilidades={setMascotaIncompatibilidades}
                onEditar={() => { setEditandoMascotaId(m.id); setMostrarFormMascota(true); }}
                onEliminar={() => eliminarMascota(m)} />
            ))}
          </div>
        )}
      </SeccionPlegable>

      <SeccionPlegable titulo="Plan de trabajo" subtitulo={resumenPlanTrabajo} defaultAbierta>
        <div style={{ display: "grid", gap: 18 }}>
          {cliente.tipoServicio?.includes("paseos") && (
            <div>
              <p style={label}>Días de paseo habituales{cliente.horaHabitual ? ` · ${cliente.horaHabitual}` : ""}</p>
              <div style={{ display: "flex", gap: 6 }}>
                {DIAS_SEMANA.map((d, dow) => (
                  <span key={dow} style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                    background: cliente.diasHabituales?.includes(dow) ? NAVY : "#EDE4CE", color: cliente.diasHabituales?.includes(dow) ? CREAM : "#B0A587" }}>
                    {d}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div>
            <p style={label}>Objetivos a cumplir</p>
            <p style={{ margin: 0, color: INK, fontSize: 14, lineHeight: 1.6 }}>{cliente.objetivos || "Sin objetivos registrados."}</p>
          </div>
        </div>
      </SeccionPlegable>

      <SeccionEvaluacion cliente={cliente}
        citasEvaluacion={citasCliente.filter((c) => c.tipo === "evaluacion").sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO))}
        setCitas={setCitas}
        citasAgenda={citasAgenda}
        packsClases={packsClases}
        onComproPack={(pack) => {
          // El cliente deja de estar "en evaluación" y pasa a ser alumno.
          // La evaluación que ya hizo no se pierde: sigue como cita en su
          // historial, solo deja de ser el servicio que tiene contratado.
          setClientes((prev) => prev.map((c) => (c.id === cliente.id
            ? { ...c, tipoServicio: tipoServicioComoAlumno(c.tipoServicio), estadoCliente: "activo", triagePendiente: false }
            : c)));
          setPlanesClases((prev) => [...prev, {
            clienteId: cliente._dbId,
            nombre: pack.nombre,
            numClases: pack.numClases,
            incluyeEvaluacion: pack.incluyeEvaluacion,
            boletaAdiestramientoId: null,
            creadoPor: _nombreUsuarioPerfil || null,
            id: Date.now(),
          }]);
          showToast(`${cliente.nombre} pasó a clases con "${pack.nombre}".`, "exito");
        }}
        onArchivar={() => {
          // Archivar es también sacarlo del panel de clientes nuevos: ya
          // se decidió qué pasaba con él, que es justo lo que ese panel
          // pregunta.
          setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, estadoCliente: "evaluado", triagePendiente: false } : c)));
          showToast("Cliente archivado como solo evaluación.", "exito");
        }} />

      <SeccionPlegable titulo="Historial" subtitulo={resumenHistorial}>
        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16 }}>
          <HistorialUnificado notas={cliente.bitacora || []} onAgregarNota={agregarNotaCliente}
            correos={correosCliente} citas={citasCliente}
            placeholderNota="Ej. llamó para reagendar, quedamos el jueves..." />
        </div>
      </SeccionPlegable>

      <SeccionPlegable titulo="Historial de ventas" subtitulo={resumenVentas}>
        {historialVentas.length === 0 ? (
          <p style={hint}>Todavía no se le ha generado ninguna boleta.</p>
        ) : (
          <div>
            {historialVentas.map((b) => (
              <FilaBoletaVenta key={`${b._tipo}-${b.numero}`} boleta={b} tipo={b._tipo}
                setBoletasEmitidas={setBoletasEmitidas} setBoletasAdiestramiento={setBoletasAdiestramiento} nombreUsuario={nombreUsuario} />
            ))}
          </div>
        )}
      </SeccionPlegable>
      </div>
    </div>
  );
}

// ---------- Clientes (base de datos madre) ----------

// Filtros/orden de la lista (no la búsqueda de texto, que es más
// puntual) sobreviven a un refresh — se guardan en localStorage apenas
// cambian, mismo criterio que howria_pago_ajustes.
function cargarFiltrosClientesGuardados() {
  try { return JSON.parse(localStorage.getItem("howria_filtros_clientes") || "{}"); } catch { return {}; }
}

// Mismo lenguaje visual para las pastillas de filtro rápido de estado y
// de evaluación — antes el estado era un <select> y evaluación una
// pastilla aparte, dos widgets distintos para el mismo tipo de acción.
function estiloPillaFiltro(activo, color, bg) {
  return {
    padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
    border: activo ? `1.5px solid ${color}` : "1px solid #DCD2B4",
    background: activo ? bg : "#FFFFFF", color: activo ? color : "#8A7E5C", fontWeight: activo ? 600 : 400,
  };
}

export function Clientes({ clientes, setClientes, boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, usuarios, puedeEliminar, cargandoClientes, correos = [], citasAgenda = [], setCitas, saltarClienteDbId, limpiarSaltoCliente, nombreUsuario, mascotas, setMascotas, mascotaIncompatibilidades, setMascotaIncompatibilidades, packsClases = [], planesClases = [], setPlanesClases, clasesRealizadas = [] }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [perfilId, setPerfilId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const filtrosGuardados = cargarFiltrosClientesGuardados();
  const [filtroPaseador, setFiltroPaseador] = useState(filtrosGuardados.filtroPaseador || "todos");
  const [filtroEstado, setFiltroEstado] = useState(filtrosGuardados.filtroEstado || "todos");
  // Paseos y adiestramiento se gestionan distinto, así que la lista se
  // mira de a un negocio por vez. Se recuerda, como el resto de filtros.
  const [negocio, setNegocio] = useState(filtrosGuardados.negocio || "paseos");
  // Cliente al que se le esta preguntando si pasa a alumno. Se confirma
  // antes de aplicar: cambia en que pestañas aparece y de que listas sale.
  const [alumnoPendiente, setAlumnoPendiente] = useState(null);

  function pasarAAlumno(c) {
    // tipoServicioComoAlumno saca "evaluacion" y agrega "clases" SIN
    // pisar los otros servicios: si ademas hace paseos, los conserva.
    setClientes((prev) => prev.map((x) => (x.id === c.id
      ? { ...x, tipoServicio: tipoServicioComoAlumno(x.tipoServicio), estadoCliente: "activo", triagePendiente: false }
      : x)));
    setAlumnoPendiente(null);
    showToast(`${c.nombre} ahora es alumno de Howria.`, "exito");
  }
  const [soloEvaluacion, setSoloEvaluacion] = useState(filtrosGuardados.soloEvaluacion || false);
  const [orden, setOrden] = useState(filtrosGuardados.orden || "nombre-asc");

  useEffect(() => {
    try { localStorage.setItem("howria_filtros_clientes", JSON.stringify({ filtroPaseador, filtroEstado, soloEvaluacion, orden, negocio })); } catch {}
  }, [filtroPaseador, filtroEstado, soloEvaluacion, orden, negocio]);

  useEffect(() => {
    if (!saltarClienteDbId) return;
    const c = clientes.find((x) => x._dbId === saltarClienteDbId);
    if (c) setPerfilId(c.id);
    limpiarSaltoCliente();
  }, [saltarClienteDbId, clientes]);

  // Entrar a la ficha de un cliente (o volver a la lista) es un cambio de
  // pantalla completo, igual que cambiar de pestaña — mismo criterio que
  // el scrollTo(0,0) de App() al cambiar `tab`, para que no quede a mitad
  // de la lista larga de la que se venía.
  useEffect(() => { window.scrollTo(0, 0); }, [perfilId]);

  function guardar(datos) {
    const limpio = { ...datos, valorPaseoRef: Number(datos.valorPaseoRef) || 0, pesoKg: Number(datos.pesoKg) || 0, tarifaPaseador: Number(datos.tarifaPaseador) || 0 };
    if (editandoId) {
      setClientes((prev) => prev.map((c) => (c.id === editandoId ? { ...limpio, id: editandoId } : c)));
    } else {
      setClientes((prev) => [...prev, { ...limpio, id: Date.now() }]);
    }
    setMostrarForm(false);
    setEditandoId(null);
  }

  const clientePerfil = clientes.find((c) => c.id === perfilId);
  if (clientePerfil) {
    return (
      <PerfilCliente
        cliente={clientePerfil}
        boletasCliente={boletasEmitidas.filter((b) => esBoletaDeCliente(b, clientePerfil))}
        boletasAdiestramientoCliente={boletasAdiestramiento.filter((b) => esBoletaDeCliente(b, clientePerfil))}
        correosCliente={correos.filter((c) => c.clienteId === clientePerfil._dbId)}
        citasCliente={citasAgenda.filter((c) => c.clienteId === clientePerfil._dbId)}
        packsClases={packsClases} setPlanesClases={setPlanesClases}
        usuarios={usuarios}
        citasAgenda={citasAgenda}
        setCitas={setCitas}
        setClientes={setClientes}
        setBoletasEmitidas={setBoletasEmitidas}
        setBoletasAdiestramiento={setBoletasAdiestramiento}
        onVolver={() => setPerfilId(null)}
        onEditar={() => { setEditandoId(clientePerfil.id); setPerfilId(null); setMostrarForm(true); }}
        onEliminar={() => { setClientes((prev) => prev.filter((x) => x.id !== clientePerfil.id)); setPerfilId(null); }}
        puedeEliminar={puedeEliminar}
        nombreUsuario={nombreUsuario}
        mascotas={mascotas}
        setMascotas={setMascotas}
        mascotaIncompatibilidades={mascotaIncompatibilidades}
        setMascotaIncompatibilidades={setMascotaIncompatibilidades}
      />
    );
  }

  const clientesPaseos = clientes.filter(esDePaseos);
  const clientesAdiestramiento = clientes.filter(esDeAdiestramiento);
  const esVistaPaseos = negocio === "paseos";
  // Todo lo de abajo (conteos, pastillas, buscador, lista) trabaja sobre
  // el negocio elegido: mezclarlos era justo lo que hacía que los 12 de
  // adiestramiento se perdieran entre los 40 de paseos.
  const delNegocio = esVistaPaseos ? clientesPaseos : clientesAdiestramiento;

  const paseadoresDisponibles = [...new Set(delNegocio.map((c) => c.paseadorNombre).filter(Boolean))].sort();
  const conteoPorEstado = { activo: 0, pausado: 0, baja: 0 };
  delNegocio.forEach((c) => { conteoPorEstado[c.estadoCliente || "activo"] = (conteoPorEstado[c.estadoCliente || "activo"] || 0) + 1; });
  const totalEvaluacion = delNegocio.filter((c) => c.tipoServicio?.includes("evaluacion")).length;

  const filtrados = delNegocio
    .filter((c) => {
      const q = busqueda.trim().toLowerCase();
      if (q && !(c.nombre.toLowerCase().includes(q) || c.perro.toLowerCase().includes(q))) return false;
      if (esVistaPaseos && filtroPaseador !== "todos" && c.paseadorNombre !== filtroPaseador) return false;
      if (filtroEstado !== "todos" && (c.estadoCliente || "activo") !== filtroEstado) return false;
      if (soloEvaluacion && !c.tipoServicio?.includes("evaluacion")) return false;
      return true;
    })
    .sort((a, b) => {
      switch (orden) {
        case "nombre-desc": return b.nombre.localeCompare(a.nombre, "es");
        case "perro-asc": return a.perro.localeCompare(b.perro, "es");
        case "perro-desc": return b.perro.localeCompare(a.perro, "es");
        case "paseador-asc": return (a.paseadorNombre || "").localeCompare(b.paseadorNombre || "", "es");
        case "valor-desc": return (b.valorPaseoRef || 0) - (a.valorPaseoRef || 0);
        case "valor-asc": return (a.valorPaseoRef || 0) - (b.valorPaseoRef || 0);
        case "recientes": return new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0);
        default: return a.nombre.localeCompare(b.nombre, "es");
      }
    });

  return (
    <div className="howria-card" style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Clientes registrados</h2>
          <p style={hint}>Ficha completa por cliente — es la base madre que alimenta boletas, finanzas y perfiles. {clientes.length} en total.</p>
        </div>
        <button onClick={() => { setEditandoId(null); setMostrarForm((v) => !v); }} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>
          {mostrarForm ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </div>

      {mostrarForm && (
        <FormularioCliente
          inicial={editandoId ? clientes.find((c) => c.id === editandoId) : null}
          paseadores={usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador")}
          entrenadores={usuarios.filter((u) => u.rol === "entrenador")}
          responsables={usuarios}
          onGuardar={guardar}
          onCancelar={() => { setMostrarForm(false); setEditandoId(null); }}
        />
      )}

      {/* Los dos negocios, como las sub-pestañas de Boletas. Todo lo de
          abajo responde a esta elección. */}
      <div role="group" aria-label="Tipo de cliente" style={{ display: "flex", gap: 8, marginTop: 18 }}>
        {[
          { id: "paseos", nombre: "Paseos", n: clientesPaseos.length },
          { id: "adiestramiento", nombre: "Adiestramiento", n: clientesAdiestramiento.length },
        ].map((n) => {
          const activo = negocio === n.id;
          return (
            <button key={n.id} type="button" onClick={() => setNegocio(n.id)} aria-pressed={activo}
              style={{
                flex: 1, padding: "11px 14px", borderRadius: 10, cursor: "pointer", fontSize: 14, minHeight: 46,
                border: "none", fontWeight: activo ? 700 : 500,
                background: activo ? NAVY : CREAM_SOFT, color: activo ? CREAM : INK,
              }}>
              {n.nombre} ({n.n})
            </button>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, marginTop: 20 }}>
        <TarjetaResumenFactura titulo={esVistaPaseos ? "Clientes de paseo" : "De adiestramiento"} valor={delNegocio.length} color={NAVY} bg={CREAM_SOFT} />
        <TarjetaResumenFactura titulo="Activos" valor={conteoPorEstado.activo} color={ESTADOS_CLIENTE[0].color} bg={ESTADOS_CLIENTE[0].bg} />
        <TarjetaResumenFactura titulo="Pausados" valor={conteoPorEstado.pausado} color={ESTADOS_CLIENTE[1].color} bg={ESTADOS_CLIENTE[1].bg} />
        {!esVistaPaseos && <TarjetaResumenFactura titulo="Evaluación pendiente" valor={totalEvaluacion} color="#1E5A7A" bg="#D6E6EE" />}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        <button onClick={() => setFiltroEstado("todos")} style={estiloPillaFiltro(filtroEstado === "todos", NAVY, CREAM)}>
          Todos ({delNegocio.length})
        </button>
        {ESTADOS_CLIENTE.map((e) => (
          <button key={e.id} onClick={() => setFiltroEstado(e.id)} style={estiloPillaFiltro(filtroEstado === e.id, e.color, e.bg)}>
            {e.nombre} ({conteoPorEstado[e.id] || 0})
          </button>
        ))}
        {!esVistaPaseos && (
          <button onClick={() => setSoloEvaluacion((v) => !v)} style={estiloPillaFiltro(soloEvaluacion, "#1E5A7A", "#D6E6EE")}>
            Evaluación ({totalEvaluacion})
          </button>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 4 }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input placeholder="Buscar por cliente o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }} />
        </div>
        {esVistaPaseos && (
          <select value={filtroPaseador} onChange={(e) => setFiltroPaseador(e.target.value)} style={{ ...input, margin: 0, width: "auto", flex: "1 1 170px" }}>
            <option value="todos">Todos los paseadores</option>
            {paseadoresDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ ...input, margin: 0, width: "auto", flex: "1 1 150px" }}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
          <option value="baja">Baja</option>
        </select>
        <div style={{ position: "relative", flex: "1 1 190px" }}>
          <ArrowUpDown size={14} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <select value={orden} onChange={(e) => setOrden(e.target.value)} style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }}>
            <option value="nombre-asc">Nombre (A-Z)</option>
            <option value="nombre-desc">Nombre (Z-A)</option>
            <option value="perro-asc">Perro (A-Z)</option>
            <option value="perro-desc">Perro (Z-A)</option>
            <option value="paseador-asc">Paseador (A-Z)</option>
            <option value="valor-desc">Valor paseo (mayor a menor)</option>
            <option value="valor-asc">Valor paseo (menor a mayor)</option>
            <option value="recientes">Más recientes primero</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "#8A7E5C", margin: "6px 0 0" }}>{filtrados.length} de {delNegocio.length} cliente(s) de {esVistaPaseos ? "paseos" : "adiestramiento"}</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 14 }}>
        {cargandoClientes ? (
          // 8 tarjetas fantasma — llenan la grilla visible sin fingir un
          // total (el número real recién se sabe al llegar los datos).
          Array.from({ length: 8 }).map((_, i) => <SkeletonTarjetaCliente key={i} />)
        ) : (
          <>
            {filtrados.map((c) => {
              const estado = ESTADOS_CLIENTE.find((e) => e.id === (c.estadoCliente || "activo"));
              return (
                <button key={c.id} onClick={() => setPerfilId(c.id)} className="howria-card" style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 14, padding: 16, cursor: "pointer", font: "inherit", position: "relative" }}>
                  {/* Las etiquetas van en su propia línea, no flotando en la
                      esquina: cuando estaban absolutas obligaban a reservar
                      70px a la derecha de TODA la fila, y al nombre le
                      quedaban unos 70px útiles — los clientes con varios
                      dueños ("Carolina, Xavier, Eugenia") se partían en tres
                      líneas apretadas contra la etiqueta. */}
                  <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 4, marginBottom: 8, minHeight: 19 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: estado.bg, color: estado.color }}>{estado.nombre}</span>
                    {c.tipoServicio?.includes("clases") && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: "#D8ECDE", color: "#2F6A46" }}>Alumno</span>
                    )}
                    {c.tipoServicio?.includes("evaluacion") && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#D6E6EE", color: "#1E5A7A" }}>Evaluación</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none", border: "2px solid #EDE4CE" }} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: NAVY, lineHeight: 1.3 }}>{c.nombre}</div>
                      <div style={{ fontSize: 13, color: "#8A7E5C", lineHeight: 1.35 }}>🐾 {c.perro} · {c.raza || "raza s/i"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#5C5442", marginTop: 10, lineHeight: 1.7 }}>
                    {c.telefono || "Sin teléfono"}<br />
                    {esVistaPaseos ? (
                      <>
                        Ref: {fmtCLP(c.valorPaseoRef)} / paseo<br />
                        Paseador: {c.paseadorNombre || "sin asignar"}
                      </>
                    ) : (() => {
                      const r = resumenAdiestramiento(c, citasAgenda, planesClases, clasesRealizadas);
                      return (
                        <>
                          {r.tieneEvaluacion
                            ? (r.evaluacionHecha
                              ? <span style={{ color: "#2F6A46", fontWeight: 600 }}>Evaluación hecha{r.evaluacionPagada ? " y pagada" : " · sin pagar"}</span>
                              : <span style={{ color: "#8A6A1E", fontWeight: 600 }}>Evaluación pendiente</span>)
                            : <span style={{ color: "#8A7E5C" }}>Sin evaluación agendada</span>}
                          <br />
                          {r.totalClases > 0
                            ? <>Clases: {r.clasesHechas} de {r.totalClases}</>
                            : <span style={{ color: "#8A7E5C" }}>Sin pack de clases</span>}
                          <br />
                          {r.proxima
                            ? <>Próxima: {new Date(r.proxima.fechaISO).toLocaleDateString("es-CL", { day: "numeric", month: "short" })} · {new Date(r.proxima.fechaISO).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}</>
                            : <span style={{ color: RUST }}>Sin nada agendado</span>}
                        </>
                      );
                    })()}
                  </div>

                  {/* Atajo para lo que hoy obliga a entrar a la ficha y
                      abrir "Editar": marcar que la persona dejo de estar
                      solo evaluandose y ya es alumna. Va dentro de una
                      tarjeta que es un boton, asi que el clic se detiene
                      acá para no abrir el perfil de paso. */}
                  {!esVistaPaseos && !c.tipoServicio?.includes("clases") && (
                    <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #EDE4CE" }}>
                      {alumnoPendiente === c.id ? (
                        <div>
                          <p style={{ margin: "0 0 6px", fontSize: 11.5, color: RUST, lineHeight: 1.35 }}>
                            ¿Marcar a {c.nombre} como alumno? Pasa a la pestaña Alumnos y deja de contar como evaluación pendiente.
                          </p>
                          <div style={{ display: "flex", gap: 6 }}>
                            <button onClick={() => pasarAAlumno(c)}
                              style={{ border: "none", background: "#2F6A46", color: "#fff", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", minHeight: 36 }}>
                              Sí, es alumno
                            </button>
                            <button onClick={() => setAlumnoPendiente(null)}
                              style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer", minHeight: 36 }}>
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button onClick={() => setAlumnoPendiente(c.id)}
                          style={{ border: "1px solid #DCD2B4", background: "#FFFFFF", color: "#2F6A46", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", minHeight: 36 }}>
                          Pasar a alumno
                        </button>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p style={{ ...hint, gridColumn: "1 / -1" }}>
                {clientes.length === 0 ? "No hay clientes registrados todavía." : `No se encontraron clientes con "${busqueda}".`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
