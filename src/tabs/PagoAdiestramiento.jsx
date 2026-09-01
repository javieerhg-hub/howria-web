// Pestaña Pago adiestramiento — cuánto se le debe a cada adiestrador y
// por qué. Separada de Pago trabajadores a propósito, porque el negocio
// funciona distinto:
//
//   Un paseador cobra por paseo a una tarifa fija guardada en el cliente,
//   así que el monto se calcula solo y solo hay que confirmarlo.
//
//   Un adiestrador no. Cada evaluación y cada pack se acuerdan aparte, y
//   el monto lo define quien paga, ítem por ítem (decisión de Javier).
//   Por eso acá no hay un total calculado esperando aprobación: hay una
//   lista de cosas hechas y una casilla por cada una.
//
// Ojo con no confundir dos montos parecidos:
//   cita.precio            = lo que pagó EL CLIENTE por esa evaluación
//   cita.pagoAdiestrador   = lo que se le paga A ÉL por haberla hecho
import { useState, useMemo } from "react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, SkeletonLista, fmtCLP, showToast, comprimirImagen,
  esBoletaDeCliente,
} from "../HowriaAdmin.jsx";
import { montoParaResponsable } from "../lib/calculosBoletas.js";

const MESES_NOMBRE = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function fmtFecha(iso) {
  return new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
}

// Fila de un ítem por pagar. Muestra los tres números juntos a
// propósito: lo que entró, lo que se lleva el adiestrador y lo que queda
// para Howria. Ese tercero NO se escribe, se calcula — si se pudieran
// escribir los dos, nada impediría que sumaran más de lo que entró, y
// entonces el número dejaría de significar algo.
//
// El monto se guarda al confirmar y no a cada tecla: escribiendo, un
// "2" camino a "25000" quedaría grabado como el pago acordado.
function FilaPago({
  titulo, subtitulo, perro, boletasDelCliente, boletaVinculadaId, onVincular,
  entroPorFactura, valor, onCambiar, onConfirmar, confirmado, puedeVincular,
}) {
  const leToca = Number(valor) || 0;
  const entro = Number(entroPorFactura) || 0;
  const paraHowria = entro - leToca;
  const hayReferencia = entro > 0;

  return (
    <div style={{ background: "#FFFFFF", border: `1px solid ${confirmado ? "#2F6A46" : "#E4DBC3"}`, borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {perro && (
              <span style={{ fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: CREAM_SOFT, color: NAVY, whiteSpace: "nowrap" }}>
                🐾 {perro}
              </span>
            )}
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>{titulo}</p>
          </div>
          <p style={{ margin: "3px 0 0", fontSize: 12, color: "#8A7E5C" }}>{subtitulo}</p>
        </div>
        {confirmado && (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: "#D8ECDE", color: "#2F6A46", alignSelf: "flex-start" }}>
            Guardado
          </span>
        )}
      </div>

      {puedeVincular && (
        <div style={{ marginTop: 10 }}>
          <label style={{ ...label, marginBottom: 3, fontSize: 10.5 }}>Factura donde se cobró</label>
          <select value={boletaVinculadaId || ""} onChange={(e) => onVincular(e.target.value || null)}
            style={{ ...input, marginBottom: 0, fontSize: 12.5, padding: "7px 9px" }}>
            <option value="">Sin factura vinculada</option>
            {boletasDelCliente.map((b) => (
              <option key={b._dbId} value={b._dbId}>
                N°{String(b.numero).padStart(3, "0")} — {fmtCLP(b.total)}{b.estado === "pagada" ? "" : " (sin pagar)"}
              </option>
            ))}
          </select>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 10 }}>
        <div>
          <label style={{ ...label, marginBottom: 3, fontSize: 10.5 }}>Entró</label>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: hayReferencia ? INK : "#B0A587", minWidth: 90 }}>
            {hayReferencia ? fmtCLP(entro) : "sin registrar"}
          </p>
        </div>
        <div>
          <label style={{ ...label, marginBottom: 3, fontSize: 10.5 }}>Le toca a él</label>
          <input type="number" min="0" value={valor} onChange={(e) => onCambiar(e.target.value)}
            placeholder="0" style={{ ...input, marginBottom: 0, width: 120 }} />
        </div>
        <div>
          <label style={{ ...label, marginBottom: 3, fontSize: 10.5 }}>Queda para Howria</label>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, minWidth: 90,
            color: !hayReferencia ? "#B0A587" : paraHowria < 0 ? RUST : "#2F6A46" }}>
            {hayReferencia ? fmtCLP(paraHowria) : "—"}
          </p>
        </div>
        <button onClick={onConfirmar} disabled={leToca <= 0}
          style={{ ...botonSecundario, width: "auto", padding: "8px 16px", fontSize: 12.5, margin: 0, opacity: leToca > 0 ? 1 : 0.45 }}>
          {confirmado ? "Guardar cambio" : "Confirmar"}
        </button>
      </div>

      {hayReferencia && paraHowria < 0 && (
        <p style={{ ...hint, margin: "8px 0 0", color: RUST }}>
          Le estás pagando más de lo que entró por esto. Se puede guardar igual, pero revisa que sea a propósito.
        </p>
      )}
      {!hayReferencia && puedeVincular && (
        <p style={{ ...hint, margin: "8px 0 0" }}>
          Vincula la factura para saber cuánto entró y cuánto queda para Howria.
        </p>
      )}
    </div>
  );
}

export function PagoAdiestramiento({
  usuarios, clientes, citasAgenda, setCitas, boletasAdiestramiento, setBoletasAdiestramiento,
  pagosRegistrados, setPagosRegistrados, cargandoPagos, nombreUsuario,
}) {
  const entrenadores = useMemo(
    () => usuarios.filter((u) => u.rol === "entrenador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
    [usuarios]);

  const [adiestrador, setAdiestrador] = useState(entrenadores[0]?.nombre || "");
  // Montos que se están escribiendo ahora, antes de confirmar el pago.
  // Se guardan recién al pagar: escribir en la base a cada tecla haría
  // que un número a medio escribir quedara como acordado.
  const [montos, setMontos] = useState({});
  const [cobrando, setCobrando] = useState(false);
  const [comprobante, setComprobante] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  // Evaluaciones y clases que ya hizo y todavía no se le pagan.
  const citasPendientes = useMemo(() => citasAgenda
    .filter((c) => c.adiestrador === adiestrador && c.estado === "realizada" && !c.pagadoAdiestrador && c._dbId)
    .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO)),
    [citasAgenda, adiestrador]);

  // Packs vendidos y ya cobrados al cliente, de clientes a su cargo. Solo
  // cuando el cliente pagó hay plata real que repartir.
  const boletasPendientes = useMemo(() => boletasAdiestramiento
    .filter((b) => b.estado === "pagada" && b._dbId && !b.pagadoAResponsable)
    .filter((b) => {
      const cliente = clientes.find((c) => esBoletaDeCliente(b, c));
      return cliente?.responsableNombre === adiestrador || cliente?.adiestradorNombre === adiestrador;
    })
    .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO)),
    [boletasAdiestramiento, clientes, adiestrador]);

  function claveCita(c) { return `cita-${c._dbId}`; }
  function claveBoleta(b) { return `boleta-${b._dbId}`; }

  function montoDe(clave, sugerido) {
    const v = montos[clave];
    return v === undefined ? (sugerido != null ? String(sugerido) : "") : v;
  }
  function cambiarMonto(clave, valor) {
    setMontos((prev) => ({ ...prev, [clave]: valor }));
  }

  // Boletas de adiestramiento de ese cliente, para poder vincular la
  // evaluación con la factura donde se cobró.
  function boletasDe(clienteNombre) {
    const cliente = clientes.find((c) => c.nombre === clienteNombre);
    if (!cliente) return [];
    return boletasAdiestramiento
      .filter((b) => b._dbId && esBoletaDeCliente(b, cliente))
      .sort((a, b) => (b.numero || 0) - (a.numero || 0));
  }

  // Cuánto entró por una cita. La factura vinculada manda sobre
  // cita.precio: precio es el de lista que se mostró al reservar, y no
  // siempre es lo que se terminó cobrando (descuentos, packs que
  // absorben la evaluación, citas agendadas a mano sin precio).
  function entroPorCita(c) {
    if (c.boletaAdiestramientoId) {
      const b = boletasAdiestramiento.find((x) => x._dbId === c.boletaAdiestramientoId);
      if (b) return b.total;
    }
    return c.precio || 0;
  }

  function vincularBoleta(cita, boletaDbId) {
    setCitas((prev) => prev.map((x) => (x.id === cita.id ? { ...x, boletaAdiestramientoId: boletaDbId } : x)));
  }

  // Guardar el monto acordado de UN ítem, sin registrar todavía el pago.
  // Sirve para ir dejando cerrado lo que ya se conversó y volver después
  // a completar el resto, en vez de tener que definirlo todo de una vez.
  function confirmarMontoCita(c) {
    const monto = Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0;
    if (monto <= 0) return;
    setCitas((prev) => prev.map((x) => (x.id === c.id ? { ...x, pagoAdiestrador: monto } : x)));
    showToast("Monto guardado.", "exito");
  }

  function confirmarMontoBoleta(b) {
    const monto = Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0;
    if (monto <= 0) return;
    setBoletasAdiestramiento((prev) => prev.map((x) => (x._dbId === b._dbId ? { ...x, montoResponsable: monto } : x)));
    showToast("Monto guardado.", "exito");
  }

  const totalCitas = citasPendientes.reduce((acc, c) => acc + (Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0), 0);
  const totalBoletas = boletasPendientes.reduce((acc, b) => acc + (Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0), 0);
  const total = totalCitas + totalBoletas;
  // Solo cuenta lo que entró de los ítems que efectivamente se van a
  // pagar: sumar todo daría un "queda para Howria" inflado con plata de
  // cosas que todavía no se están repartiendo.
  const totalEntro =
    citasPendientes.reduce((acc, c) => acc + ((Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0) > 0 ? entroPorCita(c) : 0), 0)
    + boletasPendientes.reduce((acc, b) => acc + ((Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0) > 0 ? (b.total || 0) : 0), 0);
  const evaluacionesHechas = citasPendientes.filter((c) => c.tipo === "evaluacion").length;

  async function elegirComprobante(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      setComprobante(await comprimirImagen(file, 1200, 0.75));
    } finally {
      setSubiendo(false);
    }
  }

  function confirmarPago() {
    if (!comprobante || total <= 0) return;

    // El detalle se guarda con el pago, igual que en Pago trabajadores:
    // una liquidación es un comprobante y tiene que decir lo mismo dentro
    // de seis meses, aunque las citas o las boletas cambien después.
    const detalle = [
      ...citasPendientes
        .map((c) => ({
          perro: c.perro || c.clienteNombre,
          cliente: c.clienteNombre,
          compartido: false,
          realizados: 1,
          tarifa: Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0,
          monto: Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0,
          concepto: `${c.tipo === "evaluacion" ? "Evaluación" : "Clase"} · ${fmtFecha(c.fechaISO)}`,
        }))
        .filter((f) => f.monto > 0),
      ...boletasPendientes
        .map((b) => ({
          perro: b.perro || b.cliente,
          cliente: b.cliente,
          compartido: false,
          realizados: b.numClases || 1,
          tarifa: 0,
          monto: Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0,
          concepto: `${b.packNombre || "Pack"} · boleta N°${String(b.numero).padStart(3, "0")}`,
        }))
        .filter((f) => f.monto > 0),
    ];

    // Se marca lo pagado y se guarda el monto acordado en cada ítem, para
    // que quede el rastro de por qué se pagó eso.
    const citasConMonto = citasPendientes.filter((c) => (Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0) > 0);
    const idsCitas = new Set(citasConMonto.map((c) => c._dbId));
    setCitas((prev) => prev.map((c) => (idsCitas.has(c._dbId)
      ? { ...c, pagadoAdiestrador: true, pagoAdiestrador: Number(montoDe(claveCita(c), c.pagoAdiestrador)) || 0 }
      : c)));

    const boletasConMonto = boletasPendientes.filter((b) => (Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0) > 0);
    const idsBoletas = new Set(boletasConMonto.map((b) => b._dbId));
    setBoletasAdiestramiento((prev) => prev.map((b) => (idsBoletas.has(b._dbId)
      ? { ...b, montoResponsable: Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) || 0,
          pagadoAResponsable: true, pagadoAResponsablePor: nombreUsuario, pagadoAResponsableEn: new Date().toISOString() }
      : b)));

    const hoy = new Date();
    setPagosRegistrados((prev) => [...prev, {
      id: Date.now() + Math.random(),
      tipo: "adiestramiento",
      paseador: adiestrador,
      periodo: "mes",
      etiqueta: `${MESES_NOMBRE[hoy.getMonth()]} ${hoy.getFullYear()}`,
      monto: total,
      paseos: evaluacionesHechas,
      clientes: new Set([...citasConMonto.map((c) => c.clienteNombre), ...boletasConMonto.map((b) => b.cliente)]).size,
      ajuste: 0,
      ajusteMotivo: null,
      comprobante,
      detalle,
      fechaPagoISO: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`,
      fechaPago: hoy.toLocaleDateString("es-CL"),
      periodoDesdeISO: null,
      marcadoPor: nombreUsuario,
    }]);

    setMontos({});
    setComprobante(null);
    setCobrando(false);
    showToast(`Pago registrado a ${adiestrador}.`, "exito");
  }

  const historial = useMemo(() => pagosRegistrados
    .filter((p) => p.tipo === "adiestramiento" && p.paseador === adiestrador && !p.deshechoEn)
    .sort((a, b) => new Date(b.fechaPagoISO || 0) - new Date(a.fechaPagoISO || 0)),
    [pagosRegistrados, adiestrador]);

  if (cargandoPagos) {
    return <div className="howria-card" style={tarjeta}><SkeletonLista filas={4} alto={54} /></div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Pago adiestramiento</h2>
        <p style={hint}>
          Lo que se le debe a cada adiestrador por evaluaciones y clases que hizo, y por los packs que vendió.
          A diferencia de los paseos, acá el monto de cada cosa lo defines tú.
        </p>

        <div style={{ marginTop: 16 }}>
          <label style={label} htmlFor="pago-adiestrador-sel">Adiestrador</label>
          <select id="pago-adiestrador-sel" value={adiestrador} onChange={(e) => { setAdiestrador(e.target.value); setMontos({}); }}
            style={{ ...input, marginBottom: 0, maxWidth: 280 }}>
            {entrenadores.length === 0 && <option value="">No hay adiestradores cargados</option>}
            {entrenadores.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={{ ...sectionTitle, fontSize: 16 }}>Evaluaciones y clases hechas ({citasPendientes.length})</h2>
        <p style={hint}>Citas que marcó como realizadas y todavía no se le pagan. La fecha es la del calendario.</p>
        {citasPendientes.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>No hay nada pendiente de pagar por este lado.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {citasPendientes.map((c) => (
              <FilaPago key={c._dbId}
                titulo={c.tipo === "evaluacion" ? "Evaluación" : "Clase"}
                subtitulo={`${fmtFecha(c.fechaISO)} · ${c.clienteNombre}`}
                perro={c.perro}
                puedeVincular
                boletasDelCliente={boletasDe(c.clienteNombre)}
                boletaVinculadaId={c.boletaAdiestramientoId}
                onVincular={(id) => vincularBoleta(c, id)}
                entroPorFactura={entroPorCita(c)}
                valor={montoDe(claveCita(c), c.pagoAdiestrador)}
                onCambiar={(v) => cambiarMonto(claveCita(c), v)}
                onConfirmar={() => confirmarMontoCita(c)}
                confirmado={c.pagoAdiestrador > 0} />
            ))}
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={{ ...sectionTitle, fontSize: 16 }}>Packs vendidos y cobrados ({boletasPendientes.length})</h2>
        <p style={hint}>Boletas de adiestramiento que el cliente ya pagó. Solo cuando entró la plata hay algo que repartir.</p>
        {boletasPendientes.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>No hay packs pendientes de repartir.</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {boletasPendientes.map((b) => (
              <FilaPago key={b._dbId}
                titulo={b.packNombre || `Boleta N°${String(b.numero).padStart(3, "0")}`}
                subtitulo={`${b.cliente} · ${fmtFecha(b.fechaISO)} · boleta N°${String(b.numero).padStart(3, "0")}`}
                perro={b.perro}
                entroPorFactura={b.total}
                valor={montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))}
                onCambiar={(v) => cambiarMonto(claveBoleta(b), v)}
                onConfirmar={() => confirmarMontoBoleta(b)}
                confirmado={b.montoResponsable != null} />
            ))}
          </div>
        )}
      </div>

      <div className="howria-card" style={{ ...tarjeta, background: NAVY }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <p style={{ margin: 0, fontSize: 12.5, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Total a pagar a {adiestrador || "—"}</p>
            <p style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 700, color: CREAM, fontFamily: "Georgia, serif" }}>{fmtCLP(total)}</p>
            {totalEntro > 0 && (
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9BAAB8" }}>
                Entró {fmtCLP(totalEntro)} · queda para Howria <b style={{ color: totalEntro - total < 0 ? "#F0A090" : "#A8D8BC" }}>{fmtCLP(totalEntro - total)}</b>
              </p>
            )}
          </div>
          <button onClick={() => setCobrando(true)} disabled={total <= 0}
            style={{ ...botonPrincipal, marginTop: 0, width: "auto", padding: "12px 24px", background: total > 0 ? GOLD : "#4A5A6A", color: total > 0 ? NAVY : "#8A99A8", opacity: total > 0 ? 1 : 0.7 }}>
            Registrar pago
          </button>
        </div>
      </div>

      {historial.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <h2 style={{ ...sectionTitle, fontSize: 16 }}>Pagos anteriores a {adiestrador}</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {historial.map((p) => (
              <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: CREAM_SOFT, borderRadius: 8, padding: "10px 14px" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, color: NAVY, fontWeight: 600 }}>{fmtCLP(p.monto)}</p>
                  <p style={{ margin: 0, fontSize: 12, color: "#8A7E5C" }}>
                    {p.fechaPago} · {(p.detalle || []).length} ítem(s) · lo marcó {p.marcadoPor || "—"}
                  </p>
                </div>
                {p.comprobante && (
                  <a href={p.comprobante} target="_blank" rel="noopener noreferrer"
                    style={{ ...botonSecundario, width: "auto", padding: "6px 12px", fontSize: 12, margin: 0, textDecoration: "none", display: "inline-block" }}>
                    Ver comprobante
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {cobrando && (
        <div onClick={() => setCobrando(false)} className="howria-modal-fondo"
          style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
          <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="howria-modal-caja"
            style={{ background: "#FFFFFF", borderRadius: 14, padding: 24, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
            <h3 style={{ ...sectionTitle, fontSize: 17, margin: "0 0 4px" }}>Pagar a {adiestrador}</h3>
            <p style={{ ...hint, marginTop: 0 }}>
              {citasPendientes.filter((c) => Number(montoDe(claveCita(c), c.pagoAdiestrador)) > 0).length} cita(s) y {boletasPendientes.filter((b) => Number(montoDe(claveBoleta(b), b.montoResponsable ?? montoParaResponsable(b))) > 0).length} pack(s)
            </p>
            <p style={{ margin: "10px 0 16px", fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(total)}</p>

            <label style={{ ...botonSecundario, display: "inline-block", padding: "10px 16px", cursor: subiendo ? "wait" : "pointer", marginBottom: 12 }}>
              {subiendo ? "Procesando..." : comprobante ? "Cambiar comprobante" : "Adjuntar comprobante"}
              <input type="file" accept="image/*" onChange={elegirComprobante} style={{ display: "none" }} />
            </label>

            {comprobante ? (
              <img src={comprobante} alt="Comprobante de la transferencia"
                style={{ display: "block", width: "100%", borderRadius: 8, border: "1px solid #E4DBC3", marginBottom: 14 }} />
            ) : (
              <p style={{ ...hint, margin: "0 0 14px", color: RUST }}>Adjunta la captura de la transferencia para poder registrar el pago.</p>
            )}

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={confirmarPago} disabled={!comprobante || subiendo}
                style={{ ...botonPrincipal, marginTop: 0, width: "auto", padding: "10px 20px", background: "#2F6A46", opacity: !comprobante || subiendo ? 0.45 : 1 }}>
                Confirmar pago
              </button>
              <button onClick={() => setCobrando(false)} style={{ ...botonSecundario, width: "auto", padding: "10px 20px", margin: 0 }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
