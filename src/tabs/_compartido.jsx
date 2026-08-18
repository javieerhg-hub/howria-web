// Piezas compartidas por 2+ pestañas de src/tabs/ — antes las 14+ pestañas
// vivían juntas en un solo HowriaAdminResto.jsx (~700KB), así que abrir
// cualquiera bajaba el código de todas (ver audit agosto 2026, hallazgo
// "un solo chunk gigante"). Al separarlas en un archivo por pestaña, lo
// que 2+ pestañas usan en común quedó acá, para que cada una lo importe
// solo a lo que necesita en vez de que Vite lo duplique en cada chunk.
// El dibujo de boletas en canvas + jsPDF vive aparte, en
// _compartido_pdf.jsx (ver ese archivo por qué).
import { useState, useEffect } from "react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST,
  MESES, ESTADOS_FACTURA,
  tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario,
  BotonEliminar, ModalConfirmacion, fmtCLP, fechaKey, showToast,
} from "../HowriaAdmin.jsx";
import { descargarPdfBoleta } from "./_compartido_pdf.jsx";

export function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function ordenarRutaCercanoMasProximo(puntos) {
  if (puntos.length <= 1) return puntos;
  const restantes = [...puntos];
  const ruta = [restantes.shift()];
  while (restantes.length) {
    const ultimo = ruta[ruta.length - 1];
    let mejorIdx = 0, mejorDist = Infinity;
    restantes.forEach((p, i) => {
      const d = distanciaKm(ultimo, p);
      if (d < mejorDist) { mejorDist = d; mejorIdx = i; }
    });
    ruta.push(restantes.splice(mejorIdx, 1)[0]);
  }
  return ruta;
}

export const FORMAS_PAGO = ["Transferencia", "Efectivo", "Webpay/Tarjeta", "Otro"];

// Tarjeta chica de resumen para la tira de KPI arriba de Facturas — mismos
// colores que ya usa cada estado en ESTADOS_FACTURA, para no inventar una
// paleta nueva que aprender.
export function TarjetaResumenFactura({ titulo, valor, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</p>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{valor}</p>
    </div>
  );
}


export function SeccionPlegable({ titulo, subtitulo, defaultAbierta, children }) {
  const [abierta, setAbierta] = useState(!!defaultAbierta);
  return (
    <div className="howria-card" style={tarjeta}>
      <button onClick={() => setAbierta((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}>
        <div>
          <h2 style={sectionTitle}>{titulo}</h2>
          {subtitulo && <p style={{ ...hint, marginTop: 4 }}>{subtitulo}</p>}
        </div>
        <span style={{ fontSize: 18, color: "#8A7E5C", flexShrink: 0, marginTop: 4, transform: abierta ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}>▾</span>
      </button>
      {abierta && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// Fila de un cliente en el calendario del día: en celular se ven grandes
// las 2 acciones más usadas (marcar hecho / cancelar) y reasignar + nota
// quedan detrás de "Más" para no saturar.

export const TIPOS_CITA = [
  { id: "evaluacion", nombre: "Evaluación" },
  { id: "clase", nombre: "Clase" },
];

// Compartida entre el formulario de Agenda y el botón "Agregar al
// calendario del adiestrador" de PerfilCliente — mismo criterio de choque
// en los dos lugares donde se agenda una cita a mano.
export function hayChoqueHorario(citas, adiestrador, fechaISO, duracionMin = 60) {
  const inicioNuevo = new Date(fechaISO).getTime();
  const finNuevo = inicioNuevo + duracionMin * 60000;
  return citas.some((c) => {
    if (c.adiestrador !== adiestrador || !["pendiente", "agendada"].includes(c.estado)) return false;
    const oIni = new Date(c.fechaISO).getTime();
    const oFin = oIni + (c.duracionMin || 60) * 60000;
    return inicioNuevo < oFin && finNuevo > oIni;
  });
}

// Convierte un fechaISO guardado (siempre en UTC, via toISOString()) al
// valor que espera un <input type="datetime-local"> para precargarlo con
// la hora LOCAL correcta — slice(0,16) directo sobre el ISO se queda con
// la hora en UTC, que se ve corrida si el horario local no coincide.
export function fechaISOaInputLocal(fechaISO) {
  const d = new Date(fechaISO);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export const NOMBRES_ESTADO_CITA = { pendiente: "Pendiente", agendada: "Agendada", rechazada: "Rechazada", cancelada: "Cancelada", realizada: "Realizada" };

// Bloques horarios de 1 hora que el adiestrador puede habilitar por día —
// mismo horizonte que cubre un negocio de paseos/adiestramiento (8am-8pm).

export function FilaDetalleCita({ label, valor }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 13.5, color: NAVY }}>{valor}</p>
    </div>
  );
}

// Mismo criterio visual que ModalConfirmacion (HowriaAdmin.jsx) — fondo
// oscuro + tarjeta centrada — pero de solo lectura, sin botones de acción.
export function ModalDetalleCita({ cita, onCerrar, onEliminar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);

  const esPaseo = cita.tipo === "paseo";
  const tipoTexto = esPaseo ? "Paseo" : TIPOS_CITA.find((t) => t.id === cita.tipo)?.nombre || cita.tipo;
  const estadoTexto = NOMBRES_ESTADO_CITA[cita.estado] || cita.estado;
  const puedeEliminar = onEliminar && cita._dbId && ["cancelada", "rechazada", "realizada"].includes(cita.estado);

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-detalle-cita-titulo"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <h3 id="modal-detalle-cita-titulo" style={{ margin: "0 0 4px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{cita.clienteNombre}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8A7E5C" }}>🐾 {cita.perro} · {tipoTexto} · {estadoTexto}</p>

        <div style={{ display: "grid", gap: 14 }}>
          <FilaDetalleCita label={esPaseo ? "Fecha" : "Fecha y hora"} valor={esPaseo
            ? new Date(cita.fechaISO).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
            : new Date(cita.fechaISO).toLocaleString("es-CL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} />
          <FilaDetalleCita label={esPaseo ? "Paseador" : "Entrenador"} valor={cita.adiestrador} />
          {cita.precio != null && <FilaDetalleCita label="Precio" valor={fmtCLP(cita.precio)} />}
          <FilaDetalleCita label="Correo" valor={cita.email || "Sin correo"} />
          <FilaDetalleCita label="Teléfono" valor={cita.telefono || "Sin teléfono"} />
          <FilaDetalleCita label="Dirección" valor={cita.direccion || "Sin dirección"} />
          {cita.notas && <FilaDetalleCita label="Notas" valor={cita.notas} />}
          {!esPaseo && <FilaDetalleCita label="Origen" valor={cita.origen === "cliente" ? "Pedida por el cliente (agenda pública)" : "Agendada por el equipo"} />}
          {cita.confirmadaEn && <FilaDetalleCita label="Confirmada el" valor={new Date(cita.confirmadaEn).toLocaleString("es-CL")} />}
        </div>

        {puedeEliminar && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #EDE4CE", display: "flex", justifyContent: "flex-end" }}>
            <BotonEliminar onConfirm={() => { onEliminar(cita._dbId); onCerrar(); }} label="Eliminar cita" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
          </div>
        )}
      </div>
    </div>
  );
}

// Pestaña "Notificaciones" — coordinación/administración escriben un aviso
// a mano y eligen a quién de terreno (entrenador o paseador) se lo mandan.
// A diferencia de los avisos automáticos (cita nueva, correo entrante,
// ronda que arranca), acá el mensaje y el destinatario los decide una
// persona en el momento — pasa por api/enviar-notificacion-manual.js, que
// vuelve a validar el rol del que lo manda (esta pestaña ya está gateada
// por permisos_roles, pero eso es cosmético, no seguridad real).

export function fechaNotaVieja(fechaStr) {
  if (!fechaStr) return new Date(0);
  const [d, m, y] = fechaStr.split("-");
  if (!d || !m || !y) return new Date(0);
  return new Date(`${y}-${m}-${d}`);
}

// Línea de tiempo de todo lo que se sabe de un contacto (cliente o
// prospecto) en un solo lugar: notas libres + correos + (citas y
// boletas, cuando aplica) — ordenado del más reciente al más viejo, con
// un campo arriba para dejar una nota nueva. Reemplaza los bloques
// sueltos de "Bitácora"/"Correo" que antes vivían por separado.
export function HistorialUnificado({ notas = [], onAgregarNota, correos = [], citas = [], boletas = [], placeholderNota = "Ej. llamó para confirmar, quedamos el jueves..." }) {
  const [notaNueva, setNotaNueva] = useState("");

  function agregar() {
    const texto = notaNueva.trim();
    if (!texto || !onAgregarNota) return;
    onAgregarNota(texto);
    setNotaNueva("");
  }

  const entradas = [
    ...notas.map((n) => ({ fechaOrden: n.creadoEn ? new Date(n.creadoEn) : fechaNotaVieja(n.fecha), icono: "📝", texto: n.texto })),
    ...correos.map((c) => ({
      fechaOrden: new Date(c.creadoEn),
      icono: c.direccion === "entrante" ? "📥" : "📤",
      texto: `${c.direccion === "entrante" ? "Recibido" : "Enviado"}: ${c.asunto || "(sin asunto)"}`,
    })),
    ...citas.map((c) => ({
      fechaOrden: new Date(c.fechaISO),
      icono: "📅",
      texto: `${TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre || c.tipo} con ${c.adiestrador} — ${NOMBRES_ESTADO_CITA[c.estado] || c.estado}`,
    })),
    ...boletas.map((b) => ({
      fechaOrden: new Date(b.fechaISO),
      icono: "🧾",
      texto: `Boleta N°${String(b.numero).padStart(3, "0")} — ${fmtCLP(b.total)} — ${ESTADOS_FACTURA.find((e) => e.id === b.estado)?.nombre || b.estado}`,
    })),
  ].sort((a, b) => b.fechaOrden - a.fechaOrden);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder={placeholderNota} value={notaNueva} onChange={(e) => setNotaNueva(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()} style={{ ...input, marginBottom: 0, flex: 1 }} />
        <button onClick={agregar} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>Agregar nota</button>
      </div>
      {entradas.length === 0 ? (
        <p style={{ ...hint, margin: 0 }}>Sin actividad registrada todavía.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {entradas.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 13, color: INK }}>
              <span style={{ marginRight: 6 }}>{e.icono}</span>
              {e.texto}
              <span style={{ color: "#8A7E5C", fontSize: 12 }}> · {e.fechaOrden.toLocaleDateString("es-CL")}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}


// Identifican la boleta por _dbId (id interno, estable) y no por "numero"
// — ese campo es editable a mano y no está garantizado único en la base,
// así que dos boletas con el mismo número habrían aplicado la acción a
// ambas a la vez si se matcheaba por numero. Sin dbId no hay manera
// confiable de saber a cuál boleta se refiere (ej. recién creada, todavía
// sin volver de Supabase) — mejor no hacer nada que arriesgar matchear de
// más (varias boletas sin _dbId, todas comparando undefined === undefined).
// Antes solo "Editar" (una corrección) registraba quién hizo algo — el
// resto de las acciones sobre una boleta (aceptar, marcar pagada,
// cancelar, revertir, reactivar) no dejaban ningún rastro de quién ni
// cuándo. Se agrega este sello genérico a todas ellas.
export function conUltimaAccion(cambios, autor) {
  return autor ? { ...cambios, ultimaAccionPor: autor, ultimaAccionEn: new Date().toISOString() } : cambios;
}

export function aceptarBoleta(setBoletas, dbId, autor) {
  if (!dbId) return;
  setBoletas((prev) => prev.map((b) => (b._dbId === dbId ? { ...b, ...conUltimaAccion({ estado: "pendiente_pago" }, autor) } : b)));
}

export function eliminarBoleta(setBoletas, dbId) {
  if (!dbId) return;
  setBoletas((prev) => prev.filter((b) => b._dbId !== dbId));
}

export function eliminarCita(setCitas, dbId) {
  if (!dbId) return;
  setCitas((prev) => prev.filter((c) => c._dbId !== dbId));
}

export function editarBoleta(setBoletas, dbId, cambios) {
  if (!dbId) return;
  setBoletas((prev) => prev.map((b) => (b._dbId === dbId ? { ...b, ...cambios } : b)));
}


export function EditorBoletaBasico({ boleta, tipo, onGuardar, onCancelar }) {
  const [total, setTotal] = useState(boleta.total);
  const [mensaje, setMensaje] = useState(boleta.mensajePersonalizado || "");
  const [mes, setMes] = useState(boleta.mes || MESES[0]);
  const [anio, setAnio] = useState(boleta.anio || new Date().getFullYear());
  const [montoResponsable, setMontoResponsable] = useState(boleta.montoResponsable ?? boleta.total);

  function guardar() {
    const cambios = { total: Number(total) || 0, mensajePersonalizado: mensaje.trim() || null };
    if (tipo === "paseo") { cambios.mes = mes; cambios.anio = Number(anio) || boleta.anio; }
    if (tipo === "adiestramiento") { cambios.montoResponsable = Number(montoResponsable) || 0; }
    onGuardar(cambios);
  }

  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={label} htmlFor={`editar-boleta-total-${tipo}-${boleta.numero}`}>Total</label>
          <input id={`editar-boleta-total-${tipo}-${boleta.numero}`} type="number" min="0" value={total}
            onChange={(e) => setTotal(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>
        {tipo === "paseo" && (
          <>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label} htmlFor={`editar-boleta-mes-${boleta.numero}`}>Mes</label>
              <select id={`editar-boleta-mes-${boleta.numero}`} value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 100px" }}>
              <label style={label} htmlFor={`editar-boleta-anio-${boleta.numero}`}>Año</label>
              <input id={`editar-boleta-anio-${boleta.numero}`} type="number" value={anio}
                onChange={(e) => setAnio(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
          </>
        )}
        {tipo === "adiestramiento" && (
          <div style={{ flex: "1 1 200px" }}>
            <label style={label} htmlFor={`editar-boleta-monto-responsable-${boleta.numero}`}>Monto para el responsable</label>
            <input id={`editar-boleta-monto-responsable-${boleta.numero}`} type="number" min="0" value={montoResponsable}
              onChange={(e) => setMontoResponsable(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            <p style={{ ...hint, margin: "4px 0 0" }}>Para Howria: {fmtCLP((Number(total) || 0) - (Number(montoResponsable) || 0))}</p>
          </div>
        )}
      </div>
      <div>
        <label style={label} htmlFor={`editar-boleta-mensaje-${tipo}-${boleta.numero}`}>Mensaje personalizado</label>
        <input id={`editar-boleta-mensaje-${tipo}-${boleta.numero}`} type="text" value={mensaje}
          onChange={(e) => setMensaje(e.target.value)} style={{ ...input, marginBottom: 0 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// Fila de una venta (boleta de paseo o de adiestramiento) con acciones: aceptar, marcar pagada, editar, eliminar.
export function FilaBoletaVenta({ boleta, tipo, setBoletasEmitidas, setBoletasAdiestramiento, nombreUsuario }) {
  const [editando, setEditando] = useState(false);
  const [pagoPendiente, setPagoPendiente] = useState(false);
  const [fechaPagoForm, setFechaPagoForm] = useState(() => fechaKey(new Date()));
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);
  const [generandoComprobante, setGenerandoComprobante] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const setBoletas = tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  const est = ESTADOS_FACTURA.find((e) => e.id === boleta.estado) || ESTADOS_FACTURA[0];

  function confirmarPago() {
    editarBoleta(setBoletas, boleta._dbId, conUltimaAccion({ estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm }, nombreUsuario));
    setPagoPendiente(false);
  }

  // Comprobante bajo demanda: no hace falta mantener un canvas montado
  // por cada fila del historial — se arma uno descartable solo cuando
  // de verdad se pide descargar.
  async function descargarComprobante() {
    setGenerandoComprobante(true);
    try {
      await descargarPdfBoleta(boleta, tipo, boleta.editadaPor ? "-corregida" : "");
    } catch {
      showToast("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerandoComprobante(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #EDE4CE" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13.5 }}>
        <span style={{ color: INK }}>
          N°{String(boleta.numero).padStart(3, "0")} · {tipo === "paseo" ? `${boleta.mes} ${boleta.anio} · ${boleta.cantidad} paseos` : `Adiestramiento · ${boleta.modalidad}`}
          <span title={boleta.ultimaAccionPor ? `Último cambio: ${boleta.ultimaAccionPor} — ${new Date(boleta.ultimaAccionEn).toLocaleString("es-CL")}` : undefined}
            style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: est.bg, color: est.color, cursor: boleta.ultimaAccionPor ? "help" : "default" }}>{est.nombre}</span>
          {boleta.estado === "pagada" && boleta.formaPago && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#8A7E5C" }}>{boleta.formaPago} · {boleta.fechaPago}</span>
          )}
          {boleta.editadaPor && (
            <span title={`Corregida por ${boleta.editadaPor} el ${new Date(boleta.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 8, fontSize: 11.5, color: GOLD, cursor: "help" }}>
              ✎ corregida
            </span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ color: NAVY }}>{fmtCLP(boleta.total)}</b>
          {!boleta._dbId ? (
            // Todavía no vuelve el id real de Supabase (recién se creó) —
            // sin él, aceptar/editar/eliminar no tienen forma confiable de
            // saber a cuál boleta se refieren, así que se espera a que
            // termine de guardarse antes de habilitar las acciones.
            <span style={{ fontSize: 12, color: "#8A7E5C" }}>Guardando…</span>
          ) : (
            <>
              {boleta.estado === "no_enviada" && (
                <button onClick={() => aceptarBoleta(setBoletas, boleta._dbId, nombreUsuario)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Aceptar</button>
              )}
              {boleta.estado !== "pagada" && boleta.estado !== "cancelada" && (
                <button onClick={() => setPagoPendiente(true)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Marcar pagada</button>
              )}
              <button onClick={descargarComprobante} disabled={generandoComprobante}
                style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, opacity: generandoComprobante ? 0.5 : 1 }}>
                {generandoComprobante ? "Generando..." : boleta.editadaPor ? "Descargar comprobante actualizado" : "Descargar PDF"}
              </button>
              <button onClick={() => setEditando((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Editar</button>
              <button onClick={() => setConfirmandoEliminar(true)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }}>Eliminar</button>
            </>
          )}
        </div>
      </div>
      {confirmandoEliminar && (
        <ModalConfirmacion
          titulo={`¿Eliminar la boleta N°${String(boleta.numero).padStart(3, "0")}?`}
          mensaje={`Se borra para siempre esta boleta por ${fmtCLP(boleta.total)} — no queda ningún registro de que existió.`}
          textoConfirmar="Eliminar boleta"
          onConfirmar={() => { eliminarBoleta(setBoletas, boleta._dbId); setConfirmandoEliminar(false); }}
          onCancelar={() => setConfirmandoEliminar(false)}
        />
      )}
      {pagoPendiente && (
        <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, padding: 12, marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={fechaPagoForm} onChange={(e) => setFechaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} />
          <select value={formaPagoForm} onChange={(e) => setFormaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
            {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={confirmarPago} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Confirmar</button>
          <button onClick={() => setPagoPendiente(false)} style={botonSecundario}>Cancelar</button>
        </div>
      )}
      {editando && (
        <EditorBoletaBasico boleta={boleta} tipo={tipo}
          onGuardar={(cambios) => { editarBoleta(setBoletas, boleta._dbId, { ...cambios, editadaPor: nombreUsuario, editadaEn: new Date().toISOString() }); setEditando(false); }}
          onCancelar={() => setEditando(false)} />
      )}
    </div>
  );
}
