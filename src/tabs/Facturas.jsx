// Pestaña Facturas — todas las boletas (paseo + adiestramiento) emitidas,
// con acciones por estado. Ver src/HowriaAdmin.jsx (React.lazy) por la
// lista completa de pestañas y src/tabs/_compartido.jsx para lo compartido.
import { useState, useMemo, Fragment } from "react";
import { Search } from "lucide-react";
import {
  NAVY, CREAM, GOLD, INK, RUST, ESTADOS_FACTURA, tarjeta, sectionTitle, hint, input,
  botonPrincipal, botonSecundario, SkeletonLista, BotonConfirmable, ModalConfirmacion,
  fmtCLP, fechaKey, esBoletaDeCliente, showToast,
} from "../HowriaAdmin.jsx";
import { calcularTotales, esVenta, esPorCobrar, montoParaResponsable } from "../lib/calculosBoletas.js";
import { FORMAS_PAGO, TarjetaResumenFactura, conUltimaAccion, aceptarBoleta, eliminarBoleta, editarBoleta, EditorBoletaBasico } from "./_compartido.jsx";
import { descargarPdfBoleta } from "./_compartido_pdf.jsx";

export function Facturas({ boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, clientes, setClientes, usuarios, cargandoBoletas, nombreUsuario }) {
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagoPendienteDbId, setPagoPendienteDbId] = useState(null);
  const [pagoPendienteTipo, setPagoPendienteTipo] = useState(null);
  const [pagoPendienteNumero, setPagoPendienteNumero] = useState(null);
  const [editandoBoleta, setEditandoBoleta] = useState(null);
  const [fechaPagoForm, setFechaPagoForm] = useState("");
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);
  const [descargando, setDescargando] = useState(null);
  // Cambiar el responsable reescribe el cliente completo (afecta todas
  // sus boletas pasadas y futuras, no solo esta), así que en vez de
  // aplicar apenas cambia el <select> se deja pendiente de confirmar —
  // mismo espíritu que BotonConfirmable, adaptado a un selector.
  const [responsablePendiente, setResponsablePendiente] = useState(null); // { claveFila, nombre }
  // Eliminar una boleta la borra para siempre, sin dejar rastro — antes
  // pasaba por la confirmación liviana (BotonEliminar), la misma que se
  // usa para cosas de bajo riesgo. Se sube al modal pesado, reservado
  // para lo que de verdad conviene que cueste un poco más tocar por error.
  const [eliminandoBoleta, setEliminandoBoleta] = useState(null);
  // Colapsa solo la TABLA de facturas ya ingresadas (puede ser larga) —
  // los KPIs y los filtros/búsqueda de más arriba están siempre a la
  // vista, no dependen de este toggle. Antes todo vivía detrás de este
  // mismo acordeón y al entrar a la pestaña no se veía ningún total.
  const [yaIngresadasAbiertas, setYaIngresadasAbiertas] = useState(false);

  async function descargarPdf(b, claveFila) {
    setDescargando(claveFila);
    try {
      await descargarPdfBoleta(b, b._tipo, b.editadaPor ? "-corregida" : "");
    } catch {
      showToast("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setDescargando(null);
    }
  }

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ], [boletasEmitidas, boletasAdiestramiento]);

  function setterDe(tipo) {
    return tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  }

  // El responsable vive en el cliente, no en la boleta — se resuelve
  // buscando al cliente dueño de cada boleta (mismo match que usa el
  // resto de la app para asociar boleta↔cliente).
  function responsableDe(b) {
    return clientes.find((c) => esBoletaDeCliente(b, c))?.responsableNombre;
  }

  // El responsable es del cliente, no de la boleta puntual — cambiar acá
  // actualiza a todo el cliente dueño de esta boleta, igual que el
  // selector de FormularioCliente.
  function actualizarResponsable(b, nuevoNombre) {
    setClientes((prev) => prev.map((c) => (esBoletaDeCliente(b, c) ? { ...c, responsableNombre: nuevoNombre || undefined } : c)));
  }

  // Selector de responsable con confirmación — se usa tanto en la tabla
  // de escritorio como en la tarjeta mobile, así queda editable en las
  // dos (antes solo existía en la tarjeta) y ningún cambio se aplica sin
  // confirmar, porque afecta retroactivamente TODAS las boletas del
  // cliente, no solo esta.
  function SelectorResponsable({ b, claveFila }) {
    const responsable = responsableDe(b);
    const pendiente = responsablePendiente?.claveFila === claveFila ? responsablePendiente : null;
    if (pendiente) {
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 150 }}>
          <p style={{ margin: 0, fontSize: 11.5, color: RUST, lineHeight: 1.3 }}>
            ¿Cambiar el responsable de TODAS las boletas de {b.cliente} a "{pendiente.nombre || "Sin asignar"}"?
          </p>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { actualizarResponsable(b, pendiente.nombre); setResponsablePendiente(null); }}
              style={{ border: "none", background: RUST, color: "#fff", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}>
              Confirmar
            </button>
            <button onClick={() => setResponsablePendiente(null)}
              style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "4px 10px", fontSize: 11.5, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      );
    }
    return (
      <select value={responsable || ""} onChange={(e) => e.target.value !== (responsable || "") && setResponsablePendiente({ claveFila, nombre: e.target.value })}
        style={{ ...input, marginBottom: 0, fontSize: 12.5, padding: "5px 8px", width: "100%" }}>
        <option value="">Sin asignar</option>
        {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
      </select>
    );
  }

  function abrirFormPago(boleta) {
    if (!boleta._dbId) return;
    setPagoPendienteDbId(boleta._dbId);
    setPagoPendienteTipo(boleta._tipo);
    setPagoPendienteNumero(boleta.numero);
    setFechaPagoForm(fechaKey(new Date()));
    setFormaPagoForm(FORMAS_PAGO[0]);
  }

  function confirmarPago() {
    editarBoleta(setterDe(pagoPendienteTipo), pagoPendienteDbId, conUltimaAccion({ estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm }, nombreUsuario));
    setPagoPendienteDbId(null);
    setPagoPendienteTipo(null);
    setPagoPendienteNumero(null);
  }

  // Cancelar/reactivar/revertir un pago son cambios de estado "hacia atrás"
  // — antes se podían hacer con un simple <select>, sin ninguna
  // confirmación (incluía poder revertir una boleta ya pagada con un solo
  // clic sin querer). Ahora cada uno pasa por BotonConfirmable.
  function cancelarBoleta(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, conUltimaAccion({ estado: "cancelada" }, nombreUsuario));
  }
  function revertirAPendiente(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, conUltimaAccion({ estado: "pendiente_pago", fechaPago: undefined, formaPago: undefined }, nombreUsuario));
  }
  function reactivarBoleta(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, conUltimaAccion({ estado: "pendiente_pago" }, nombreUsuario));
  }

  const conteos = useMemo(() => {
    const c = { todas: todasLasBoletas.length };
    ESTADOS_FACTURA.forEach((e) => { c[e.id] = todasLasBoletas.filter((b) => b.estado === e.id).length; });
    return c;
  }, [todasLasBoletas]);

  // Resumen general (independiente de los filtros de la tabla, para que
  // sirva como panorama estable) — le da un efecto real y visible al
  // botón "Aceptar": antes de aceptar una boleta no suma en "Ventas
  // confirmadas" ni en "Por cobrar".
  const ventasConfirmadas = useMemo(() => calcularTotales(todasLasBoletas.filter(esVenta)).ingresos, [todasLasBoletas]);
  const porCobrarMonto = useMemo(() => calcularTotales(todasLasBoletas.filter(esPorCobrar)).ingresos, [todasLasBoletas]);

  // Busca por cliente, perro o número de boleta (con o sin ceros a la
  // izquierda) — antes solo encontraba por cliente/perro.
  function coincideBusqueda(b, q) {
    if (!q) return true;
    return b.cliente.toLowerCase().includes(q) || (b.perro || "").toLowerCase().includes(q) || String(b.numero).padStart(3, "0").includes(q) || String(b.numero) === q;
  }

  // "Por revisar" = todavía sin aceptar, la cola de trabajo activa.
  // "Ya ingresadas" = todo lo que ya pasó por Aceptar (o se canceló) —
  // vive colapsado aparte para no ocupar la vista principal. La búsqueda
  // es una sola barra para las dos, antes solo filtraba "Ya ingresadas".
  const busquedaLimpia = busqueda.trim().toLowerCase();
  const porRevisar = useMemo(() =>
    todasLasBoletas.filter((b) => b.estado === "no_enviada" && coincideBusqueda(b, busquedaLimpia)).sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO)),
    [todasLasBoletas, busquedaLimpia]);
  const todasIngresadas = useMemo(() => todasLasBoletas.filter((b) => b.estado !== "no_enviada"), [todasLasBoletas]);

  const lista = useMemo(() => {
    return todasIngresadas
      .filter((b) => filtroEstado === "todas" || b.estado === filtroEstado)
      .filter((b) => filtroCliente === "todos" || b.cliente === filtroCliente)
      .filter((b) => !desde || fechaKey(new Date(b.fechaISO)) >= desde)
      .filter((b) => !hasta || fechaKey(new Date(b.fechaISO)) <= hasta)
      .filter((b) => coincideBusqueda(b, busquedaLimpia))
      .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  }, [todasIngresadas, filtroEstado, filtroCliente, desde, hasta, busquedaLimpia]);

  const totalListado = calcularTotales(lista).ingresos;
  const nombresClientes = [...new Set(todasIngresadas.map((b) => b.cliente))];

  // Exporta la tabla "Facturas ya ingresadas" tal como está filtrada en
  // pantalla — antes la única forma de sacar los datos era PDF boleta por
  // boleta, sin manera de llevarse el listado completo a una planilla.
  function exportarCsv() {
    const encabezado = ["Numero", "Tipo", "Cliente", "Responsable", "Perro", "Fecha", "Total", "Estado", "Forma de pago", "Fecha de pago"];
    const filas = lista.map((b) => [
      String(b.numero).padStart(3, "0"),
      b._tipo === "paseo" ? "Paseo" : "Adiestramiento",
      b.cliente,
      responsableDe(b) || "",
      b.perro || "",
      b.fecha,
      b.total,
      (ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0]).nombre,
      b.estado === "pagada" ? b.formaPago || "" : "",
      b.estado === "pagada" ? b.fechaPago || "" : "",
    ]);
    const csv = [encabezado, ...filas].map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `facturas-${fechaKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Formulario de "marcar pagada" y editor de boleta — el mismo contenido
  // se usa tanto en la fila expandida de la tabla (desktop) como dentro
  // de la ficha mobile, para no duplicar la lógica en dos lugares.
  function BloquePagoInline() {
    return (
      <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#2F6A46", fontWeight: 600 }}>Marcando pagada la N°{String(pagoPendienteNumero).padStart(3, "0")}:</span>
        <input type="date" value={fechaPagoForm} onChange={(e) => setFechaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} />
        <select value={formaPagoForm} onChange={(e) => setFormaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
          {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={confirmarPago} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Confirmar</button>
        <button onClick={() => { setPagoPendienteDbId(null); setPagoPendienteTipo(null); setPagoPendienteNumero(null); }} style={botonSecundario}>Cancelar</button>
      </div>
    );
  }

  function BloqueEditorInline(b) {
    return (
      <EditorBoletaBasico boleta={b} tipo={b._tipo}
        onGuardar={(cambios) => { editarBoleta(setterDe(b._tipo), b._dbId, { ...cambios, editadaPor: nombreUsuario, editadaEn: new Date().toISOString() }); setEditandoBoleta(null); }}
        onCancelar={() => setEditandoBoleta(null)} />
    );
  }

  // Una fila de la tabla (más sus filas de expansión: formulario de pago
  // y editor) — se comparte entre "Por revisar" y "Facturas ya
  // ingresadas", que son la misma tabla partida en dos por estado.
  function renderFilaFactura(b) {
    const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
    const claveFila = `${b._tipo}-${b._dbId}`;
    return (
      <Fragment key={claveFila}>
        <tr style={{ borderTop: "1px solid #EDE4CE" }}>
          <td style={{ padding: "10px" }}>
            {String(b.numero).padStart(3, "0")}
            {b.editadaPor && (
              <span title={`Corregida por ${b.editadaPor} el ${new Date(b.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 5, fontSize: 11, color: GOLD, cursor: "help" }}>✎</span>
            )}
          </td>
          <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b._tipo === "paseo" ? "Paseo" : "Adiestramiento"}</td>
          <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{b.cliente}</td>
          <td style={{ padding: "10px", fontSize: 12 }}>
            <SelectorResponsable b={b} claveFila={claveFila} />
            {b._tipo === "adiestramiento" && (
              <div style={{ fontSize: 10.5, color: "#8A7E5C", marginTop: 4 }}>
                {b.montoResponsable != null
                  ? `Se lleva ${fmtCLP(montoParaResponsable(b))} · Howria ${fmtCLP(b.total - montoParaResponsable(b))}`
                  : "100% para el responsable (sin repartir)"}
              </div>
            )}
          </td>
          <td style={{ padding: "10px" }}>{b.perro ? `🐾 ${b.perro}` : "—"}</td>
          <td style={{ padding: "10px" }}>{b._tipo === "paseo" ? `${b.mes} ${b.anio}` : (b.packNombre || `Adiestramiento · ${b.modalidad}`)}</td>
          <td style={{ padding: "10px", color: "#8A7E5C" }}>{b.fecha}</td>
          <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{fmtCLP(b.total)}</td>
          <td style={{ padding: "10px" }}>
            <span title={b.ultimaAccionPor ? `Último cambio: ${b.ultimaAccionPor} — ${new Date(b.ultimaAccionEn).toLocaleString("es-CL")}` : undefined}
              style={{ display: "inline-block", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, background: est.bg, color: est.color, cursor: b.ultimaAccionPor ? "help" : "default" }}>
              {est.nombre}
            </span>
          </td>
          <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b.estado === "pagada" && b.formaPago ? `${b.formaPago} · ${b.fechaPago}` : "—"}</td>
          <td style={{ padding: "10px" }}>
            {!b._dbId ? (
              // Todavía no vuelve el id real de Supabase — sin él,
              // aceptar/editar/eliminar no tienen forma confiable de
              // saber a cuál boleta se refieren.
              <span style={{ fontSize: 12, color: "#8A7E5C" }}>Guardando…</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {b.estado === "no_enviada" && (
                  <button onClick={() => aceptarBoleta(setterDe(b._tipo), b._dbId, nombreUsuario)} style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Aceptar</button>
                )}
                {b.estado === "pendiente_pago" && (
                  <button onClick={() => abrirFormPago(b)} style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Marcar pagada</button>
                )}
                <button onClick={() => descargarPdf(b, claveFila)} disabled={descargando === claveFila}
                  style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: descargando === claveFila ? 0.5 : 1 }}>
                  {descargando === claveFila ? "Generando..." : "Descargar PDF"}
                </button>
                {(b.estado === "no_enviada" || b.estado === "pendiente_pago") && (
                  <BotonConfirmable onConfirm={() => cancelarBoleta(b)} label="Cancelar" colorConfirmar={RUST}
                    style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
                )}
                {b.estado === "pagada" && (
                  <BotonConfirmable onConfirm={() => revertirAPendiente(b)} label="Revertir a pendiente" colorConfirmar={NAVY}
                    style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12 }} />
                )}
                {b.estado === "cancelada" && (
                  <BotonConfirmable onConfirm={() => reactivarBoleta(b)} label="Reactivar" colorConfirmar={"#2F6A46"}
                    style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }} />
                )}
                <button onClick={() => setEditandoBoleta(editandoBoleta === claveFila ? null : claveFila)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Editar</button>
                <button onClick={() => setEliminandoBoleta(b)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }}>Eliminar</button>
              </div>
            )}
          </td>
        </tr>
        {pagoPendienteDbId === b._dbId && pagoPendienteTipo === b._tipo && (
          <tr>
            <td colSpan={11} style={{ padding: "0 10px 12px" }}>
              <BloquePagoInline />
            </td>
          </tr>
        )}
        {editandoBoleta === claveFila && (
          <tr>
            <td colSpan={11} style={{ padding: "0 10px 12px" }}>
              <BloqueEditorInline b={b} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  // Versión ficha de la misma boleta, para mobile — mismo estado y
  // handlers que renderFilaFactura, solo cambia el layout.
  function renderTarjetaFactura(b) {
    const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
    const claveFila = `${b._tipo}-${b._dbId}`;
    const hayAccionPrincipal = b.estado === "no_enviada" || b.estado === "pendiente_pago";
    return (
      <div key={claveFila} className="howria-card" style={{ background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#8A7E5C", fontWeight: 600 }}>
            N°{String(b.numero).padStart(3, "0")} · {b._tipo === "paseo" ? "Paseo" : "Adiestramiento"}
            {b.editadaPor && (
              <span title={`Corregida por ${b.editadaPor} el ${new Date(b.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 5, color: GOLD, cursor: "help" }}>✎</span>
            )}
          </span>
          <span style={{ display: "inline-block", borderRadius: 20, padding: "5px 10px", fontSize: 12, fontWeight: 600, background: est.bg, color: est.color }}>
            {est.nombre}
          </span>
        </div>

        <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: NAVY }}>{b.cliente}</p>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6B6248" }}>{b.perro ? `🐾 ${b.perro}` : "Sin perro asociado"}</p>
        {b.ultimaAccionPor && (
          <p style={{ margin: "-4px 0 10px", fontSize: 11, color: "#8A7E5C" }}>
            Último cambio: {b.ultimaAccionPor} · {new Date(b.ultimaAccionEn).toLocaleDateString("es-CL")}
          </p>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#8A7E5C" }}>{b._tipo === "paseo" ? `${b.mes} ${b.anio}` : (b.packNombre || `Adiestramiento · ${b.modalidad}`)} · Emitida {b.fecha}</span>
          <span style={{ fontSize: 19, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>{fmtCLP(b.total)}</span>
        </div>
        {b.estado === "pagada" && b.formaPago && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8A7E5C" }}>Pagada: {b.formaPago} · {b.fechaPago}</p>
        )}

        <div style={{ margin: "10px 0 12px" }}>
          <label style={{ display: "block", fontSize: 11, color: "#8A7E5C", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
            Responsable del dinero
          </label>
          <SelectorResponsable b={b} claveFila={claveFila} />
          {b._tipo === "adiestramiento" && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8A7E5C" }}>
              {b.montoResponsable != null
                ? `Se lleva ${fmtCLP(montoParaResponsable(b))} · Howria ${fmtCLP(b.total - montoParaResponsable(b))}`
                : "100% para el responsable (sin repartir)"}
            </p>
          )}
        </div>

        {!b._dbId ? (
          <p style={{ fontSize: 12.5, color: "#8A7E5C" }}>Guardando…</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {b.estado === "no_enviada" && (
                <button onClick={() => aceptarBoleta(setterDe(b._tipo), b._dbId, nombreUsuario)}
                  style={{ ...botonPrincipal, marginTop: 0, background: "#2F6A46", flex: 1, minHeight: 44 }}>Aceptar</button>
              )}
              {b.estado === "pendiente_pago" && (
                <button onClick={() => abrirFormPago(b)}
                  style={{ ...botonPrincipal, marginTop: 0, background: "#2F6A46", flex: 1, minHeight: 44 }}>Marcar pagada</button>
              )}
              <button onClick={() => descargarPdf(b, claveFila)} disabled={descargando === claveFila}
                style={{ ...botonSecundario, flex: hayAccionPrincipal ? "0 0 auto" : 1, minHeight: 44, opacity: descargando === claveFila ? 0.5 : 1 }}>
                {descargando === claveFila ? "Generando..." : "PDF"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", fontSize: 12.5 }}>
              {hayAccionPrincipal && (
                <BotonConfirmable onConfirm={() => cancelarBoleta(b)} label="Cancelar" colorConfirmar={RUST}
                  style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5, padding: "10px 8px", minHeight: 44 }} />
              )}
              {b.estado === "pagada" && (
                <BotonConfirmable onConfirm={() => revertirAPendiente(b)} label="Revertir a pendiente" colorConfirmar={NAVY}
                  style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, padding: "10px 8px", minHeight: 44 }} />
              )}
              {b.estado === "cancelada" && (
                <BotonConfirmable onConfirm={() => reactivarBoleta(b)} label="Reactivar" colorConfirmar={"#2F6A46"}
                  style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "10px 8px", minHeight: 44 }} />
              )}
              <button onClick={() => setEditandoBoleta(editandoBoleta === claveFila ? null : claveFila)}
                style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: "10px 8px", minHeight: 44 }}>Editar</button>
              <button onClick={() => setEliminandoBoleta(b)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5, padding: "10px 8px", minHeight: 44 }}>Eliminar</button>
            </div>
          </>
        )}

        {pagoPendienteDbId === b._dbId && pagoPendienteTipo === b._tipo && (
          <div style={{ marginTop: 12 }}><BloquePagoInline /></div>
        )}
        {editandoBoleta === claveFila && (
          <div style={{ marginTop: 12 }}><BloqueEditorInline b={b} /></div>
        )}
      </div>
    );
  }

  function EncabezadoTabla() {
    return (
      <thead>
        <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
          <th style={{ padding: "8px 10px" }}>N°</th>
          <th style={{ padding: "8px 10px" }}>Tipo</th>
          <th style={{ padding: "8px 10px" }}>Cliente</th>
          <th style={{ padding: "8px 10px" }}>Responsable</th>
          <th style={{ padding: "8px 10px" }}>Perro</th>
          <th style={{ padding: "8px 10px" }}>Período</th>
          <th style={{ padding: "8px 10px" }}>Emitida</th>
          <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
          <th style={{ padding: "8px 10px" }}>Estado</th>
          <th style={{ padding: "8px 10px" }}>Pago</th>
          <th style={{ padding: "8px 10px" }}>Acciones</th>
        </tr>
      </thead>
    );
  }

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Facturas</h2>
      <p style={hint}>Todas las boletas generadas por el sistema, con quién es cada una y en qué estado de pago se encuentra.</p>

      {cargandoBoletas ? (
        <div style={{ marginTop: 18 }}><SkeletonLista filas={5} alto={38} /></div>
      ) : (
        <>
          <div style={{ position: "relative", marginTop: 18 }}>
            <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input placeholder="Buscar por cliente, perro o N° de boleta..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
              style={{ ...input, marginBottom: 0, width: "100%", paddingLeft: 34 }} />
          </div>

          <div style={{ marginTop: 22 }}>
            <h3 style={{ ...sectionTitle, fontSize: 15, marginBottom: 4 }}>Por revisar {porRevisar.length > 0 ? `(${porRevisar.length})` : ""}</h3>
            {porRevisar.length === 0 ? (
              <p style={{ ...hint, marginTop: 6 }}>{busquedaLimpia ? "Ninguna factura por revisar coincide con la búsqueda." : "No hay facturas por revisar — todo lo generado ya fue aceptado."}</p>
            ) : (
              <>
                <p style={{ ...hint, marginTop: 2, marginBottom: 10 }}>Boletas recién generadas, todavía sin revisar — al aceptarlas pasan a "Facturas ya ingresadas" y empiezan a contar como venta.</p>
                <div className="howria-facturas-tabla" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <EncabezadoTabla />
                    <tbody>{porRevisar.map(renderFilaFactura)}</tbody>
                  </table>
                </div>
                <div className="howria-facturas-tarjetas" style={{ flexDirection: "column", gap: 12 }}>
                  {porRevisar.map(renderTarjetaFactura)}
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 22 }}>
            <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
              <TarjetaResumenFactura titulo="Ventas confirmadas" valor={fmtCLP(ventasConfirmadas)} color={ESTADOS_FACTURA[2].color} bg={ESTADOS_FACTURA[2].bg} />
              <TarjetaResumenFactura titulo="Por cobrar" valor={fmtCLP(porCobrarMonto)} color={ESTADOS_FACTURA[1].color} bg={ESTADOS_FACTURA[1].bg} />
              <TarjetaResumenFactura titulo="Por revisar" valor={`${conteos.no_enviada || 0} factura(s)`} color={ESTADOS_FACTURA[0].color} bg={ESTADOS_FACTURA[0].bg} />
              <TarjetaResumenFactura titulo="Canceladas" valor={`${conteos.cancelada || 0} factura(s)`} color={ESTADOS_FACTURA[3].color} bg={ESTADOS_FACTURA[3].bg} />
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              <button onClick={() => setFiltroEstado("todas")}
                style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                  border: filtroEstado === "todas" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                  background: filtroEstado === "todas" ? NAVY : "#FFFFFF", color: filtroEstado === "todas" ? CREAM : INK,
                  fontWeight: filtroEstado === "todas" ? 600 : 400 }}>
                Todas ({todasIngresadas.length})
              </button>
              {ESTADOS_FACTURA.filter((e) => e.id !== "no_enviada").map((e) => (
                <button key={e.id} onClick={() => setFiltroEstado(e.id)}
                  style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                    border: filtroEstado === e.id ? `1.5px solid ${e.color}` : "1px solid #DCD2B4",
                    background: filtroEstado === e.id ? e.bg : "#FFFFFF", color: e.color,
                    fontWeight: filtroEstado === e.id ? 600 : 400 }}>
                  {e.nombre} ({conteos[e.id] || 0})
                </button>
              ))}
            </div>

            <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option value="todos">Todos los clientes</option>
                {nombresClientes.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <div style={{ display: "flex", gap: 6 }}>
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ ...input, marginBottom: 0 }} title="Desde" />
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ ...input, marginBottom: 0 }} title="Hasta" />
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
            <button onClick={() => setYaIngresadasAbiertas((v) => !v)} style={{ ...botonSecundario, width: "auto" }}>
              {yaIngresadasAbiertas ? "▾" : "▸"} Facturas ya ingresadas ({todasIngresadas.length})
            </button>
            {yaIngresadasAbiertas && lista.length > 0 && (
              <button onClick={exportarCsv} style={{ ...botonSecundario, width: "auto" }}>Exportar CSV</button>
            )}
          </div>

          {yaIngresadasAbiertas && (
            <div style={{ marginTop: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8A7E5C", margin: "0 0 10px" }}>
                <span>{lista.length} factura(s) en este listado</span>
                <span>Suma: <b style={{ color: NAVY }}>{fmtCLP(totalListado)}</b></span>
              </div>

              <div className="howria-facturas-tabla" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <EncabezadoTabla />
                  <tbody>
                    {lista.map(renderFilaFactura)}
                    {lista.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay facturas que coincidan.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="howria-facturas-tarjetas" style={{ flexDirection: "column", gap: 12 }}>
                {lista.map(renderTarjetaFactura)}
                {lista.length === 0 && (
                  <p style={{ ...hint, textAlign: "center" }}>No hay facturas que coincidan.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {eliminandoBoleta && (
        <ModalConfirmacion
          titulo={`¿Eliminar la boleta N°${String(eliminandoBoleta.numero).padStart(3, "0")}?`}
          mensaje={`Se borra para siempre la boleta de ${eliminandoBoleta.cliente} por ${fmtCLP(eliminandoBoleta.total)} — queda un registro de la eliminación, pero no se puede deshacer.`}
          textoConfirmar="Eliminar boleta"
          onConfirmar={() => { eliminarBoleta(setterDe(eliminandoBoleta._tipo), eliminandoBoleta, eliminandoBoleta._tipo, nombreUsuario); setEliminandoBoleta(null); }}
          onCancelar={() => setEliminandoBoleta(null)}
        />
      )}
    </div>
  );
}
