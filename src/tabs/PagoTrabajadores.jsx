// Pestaña Pago trabajadores — cálculo de lo que se le debe a cada
// paseador/entrenador por período, con ajustes y pagos registrados. Ver
// src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { Banknote } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, MESES, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, Spinner, FilaLista, BotonEliminar, BotonConfirmable,
  fmtCLP, fechaKey, esBoletaDeCliente, rangoPeriodo,
} from "../HowriaAdmin.jsx";
import { montoParaResponsable } from "../lib/calculosBoletas.js";

function programadosEnRango(cliente, desde, hasta, registroPaseos = {}) {
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const dow = (cur.getDay() + 6) % 7;
    const cancelado = registroPaseos[`${cliente.id}_${fechaKey(cur)}`]?.cancelado;
    if (cliente.diasHabituales?.includes(dow) && !cancelado) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

function realizadosEnRango(registroPaseos, clienteId, desde, hasta, paseadorEsperado = null) {
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const r = registroPaseos[`${clienteId}_${fechaKey(cur)}`];
    if (r?.realizado) {
      // si el registro tiene guardado quién era el paseador ese día, solo cuenta
      // para ese paseador (así, si el cliente cambió de paseador, el pago queda bien atribuido)
      if (!paseadorEsperado || !r.paseadorNombre || r.paseadorNombre === paseadorEsperado) n++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// Monto real del cliente en el rango — a diferencia de "realizados *
// tarifa", día por día, porque un paseo puntual puede estar repartido con
// otro paseador (Coordinación, "Compartir con...") y entonces el
// paseador principal se queda solo con el resto del porcentaje.
function montoRealizadoEnRango(registroPaseos, clienteId, desde, hasta, paseadorEsperado, tarifa) {
  let monto = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const r = registroPaseos[`${clienteId}_${fechaKey(cur)}`];
    if (r?.realizado && (!paseadorEsperado || !r.paseadorNombre || r.paseadorNombre === paseadorEsperado)) {
      monto += r.compartidoCon ? (tarifa * (100 - (r.porcentajeCompartido ?? 50))) / 100 : tarifa;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return monto;
}

export function PagoTrabajadores({ boletasEmitidas, boletasAdiestramiento = [], setBoletasAdiestramiento, clientes, usuarios, registroPaseos, pagosRegistrados, setPagosRegistrados, cargandoPagos, ajustesPago = [], setAjustesPago, nombreUsuario }) {
  const [periodo, setPeriodo] = useState("semana");
  const [periodoOffset, setPeriodoOffset] = useState(0);
  const hoy = new Date();
  const fechaRef = useMemo(() => {
    const d = new Date(hoy);
    if (periodo === "semana") d.setDate(d.getDate() + periodoOffset * 7);
    else d.setMonth(d.getMonth() + periodoOffset);
    return d;
  }, [periodo, periodoOffset]);
  const { desde, hasta, etiqueta } = rangoPeriodo(periodo, fechaRef);
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
  // "Cumplimiento" solo tiene sentido contra los días que YA pasaron —
  // contar toda la semana/mes completo (incluidos días futuros, todavía
  // sin marcar) hacía que a mitad de período se viera un % bajo sin
  // ninguna razón real, aunque el paseador llevara un cumplimiento
  // perfecto hasta ese momento.
  const hoyMedianoche = new Date(); hoyMedianoche.setHours(0, 0, 0, 0);
  const mananaMedianoche = new Date(hoyMedianoche); mananaMedianoche.setDate(mananaMedianoche.getDate() + 1);
  const hastaEfectivo = hasta < mananaMedianoche ? hasta : mananaMedianoche;

  function claveAjuste(paseador) {
    return `${paseador}|${periodo}|${etiqueta}`;
  }

  // El bono/descuento vive en la tabla ajustes_pago_pendientes (ver
  // database/085) — antes se guardaba solo en localStorage de quien lo
  // escribía, invisible para otra persona/dispositivo hasta confirmar el
  // pago, con riesgo real de pagar el monto equivocado.
  const ajustesPorClave = useMemo(() => {
    const mapa = {};
    ajustesPago.forEach((a) => { mapa[`${a.paseador}|${a.periodo}|${a.etiqueta}`] = a.monto; });
    return mapa;
  }, [ajustesPago]);

  function actualizarAjuste(paseador, valor) {
    const monto = Number(valor) || 0;
    setAjustesPago((prev) => {
      const idx = prev.findIndex((a) => a.paseador === paseador && a.periodo === periodo && a.etiqueta === etiqueta);
      const ahora = new Date().toISOString();
      if (idx === -1) {
        if (monto === 0) return prev;
        return [...prev, { id: Date.now() + Math.random(), paseador, periodo, etiqueta, monto, actualizadoPor: nombreUsuario, actualizadoEn: ahora }];
      }
      const copia = [...prev];
      copia[idx] = { ...copia[idx], monto, actualizadoPor: nombreUsuario, actualizadoEn: ahora };
      return copia;
    });
  }

  function descargarResumen(fila) {
    const texto = `Resumen de pago — Howria\n` +
      `Paseador: ${fila.paseador}\n` +
      `Período: ${periodo === "semana" ? "Semana" : "Mes"} ${etiqueta}\n\n` +
      `Clientes atendidos: ${fila.clientes}\n` +
      `Paseos realizados: ${fila.realizados} / ${fila.programados} (${fila.cumplimiento}%)\n\n` +
      `Monto asegurado (cliente ya pagó): ${fmtCLP(fila.montoAsegurado)}\n` +
      `Monto proyectado (pendiente de cobro): ${fmtCLP(fila.montoProyectado)}\n` +
      `Ajuste manual (bono/descuento): ${fmtCLP(fila.ajuste)}\n` +
      `TOTAL A PAGAR: ${fmtCLP(fila.monto)}\n`;
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Pago-${fila.paseador.replace(/\s+/g, "-")}-${etiqueta.replace(/\s+/g, "-")}.txt`;
    link.click();
  }

  const resumenPorPaseador = useMemo(() => {
    const mapa = {};
    // Solo cuentas con rol paseador (más cualquier paseadorNombre suelto
    // en un cliente, por si no calza exacto con un usuario actual) — antes
    // entraba CUALQUIER usuario del sistema, mostrando filas en $0 para
    // cuentas de coordinador/entrenador/admin que nunca cobran acá.
    const nombresConocidos = new Set([
      ...usuarios.filter((u) => u.rol === "paseador").map((u) => u.nombre),
      ...clientes.filter((c) => c.paseadorNombre).map((c) => c.paseadorNombre),
    ]);
    nombresConocidos.forEach((nombre) => { mapa[nombre] = { paseador: nombre, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 }; });

    clientes.filter((c) => c.paseadorNombre).forEach((c) => {
      const nombre = c.paseadorNombre;
      const programados = programadosEnRango(c, desde, hastaEfectivo, registroPaseos);
      const realizadosRaw = realizadosEnRango(registroPaseos, c.id, desde, hastaEfectivo, nombre);
      const realizados = Math.min(realizadosRaw, programados || realizadosRaw);
      const tarifa = Number(c.tarifaPaseador || 0);
      const montoCliente = montoRealizadoEnRango(registroPaseos, c.id, desde, hastaEfectivo, nombre, tarifa);

      // ¿la boleta de este cliente para el mes actual ya está pagada?
      const facturaMes = boletasEmitidas.find((b) => esBoletaDeCliente(b, c) && b.mes === MESES[mesActual] && b.anio === anioActual);
      const asegurado = facturaMes?.estado === "pagada";

      if (!mapa[nombre]) mapa[nombre] = { paseador: nombre, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 };
      mapa[nombre].clientes += 1;
      mapa[nombre].programados += programados;
      mapa[nombre].realizados += realizados;
      if (asegurado) mapa[nombre].montoAsegurado += montoCliente;
      else mapa[nombre].montoProyectado += montoCliente;
    });

    // Créditos de paseos compartidos: quien ayudó a otro paseador en un
    // paseo puntual (ver Coordinación, "Compartir con...") también debe
    // cobrarlo acá — antes solo se veía reflejado en su "Tu pago"
    // personal, nunca en el pago real. Recorre TODOS los clientes con
    // paseador asignado, no solo los del beneficiario, porque justamente
    // no es dueño de ese cliente.
    clientes.filter((c) => c.paseadorNombre).forEach((c) => {
      const tarifa = Number(c.tarifaPaseador || 0);
      const facturaMes = boletasEmitidas.find((b) => esBoletaDeCliente(b, c) && b.mes === MESES[mesActual] && b.anio === anioActual);
      const asegurado = facturaMes?.estado === "pagada";
      const cur = new Date(desde);
      while (cur < hastaEfectivo) {
        const r = registroPaseos[`${c.id}_${fechaKey(cur)}`];
        if (r?.realizado && r.compartidoCon) {
          const montoCompartido = (tarifa * (r.porcentajeCompartido ?? 50)) / 100;
          if (!mapa[r.compartidoCon]) mapa[r.compartidoCon] = { paseador: r.compartidoCon, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 };
          if (asegurado) mapa[r.compartidoCon].montoAsegurado += montoCompartido;
          else mapa[r.compartidoCon].montoProyectado += montoCompartido;
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    return Object.values(mapa)
      .map((r) => {
        const ajuste = ajustesPorClave[claveAjuste(r.paseador)] || 0;
        return { ...r, ajuste, monto: r.montoAsegurado + r.montoProyectado + ajuste, cumplimiento: r.programados ? Math.round((r.realizados / r.programados) * 100) : 0 };
      })
      .sort((a, b) => b.monto - a.monto);
  }, [clientes, usuarios, registroPaseos, boletasEmitidas, desde, hastaEfectivo, mesActual, anioActual, ajustesPorClave, periodo, etiqueta]);

  const totalAsegurado = resumenPorPaseador.reduce((acc, r) => acc + r.montoAsegurado, 0);
  const totalProyectado = resumenPorPaseador.reduce((acc, r) => acc + r.montoProyectado, 0);
  const totalAPagar = resumenPorPaseador.reduce((acc, r) => acc + r.monto, 0);

  // Mismo hueco que "Pago trabajadores" venía a cerrar para paseadores,
  // pero para adiestramiento: Finanzas ya calculaba "Pago a responsables
  // (adiestramiento)" como costo, pero no había ningún lugar para ver el
  // desglose por persona ni marcarlo pagado. El reparto vive en la
  // boleta misma (montoResponsable, ver 069), así que el flag de "ya se
  // le pagó" también — no hace falta un mecanismo de período aparte
  // como con pagosRegistrados, cada boleta ya tiene su propia fecha.
  const resumenPorResponsable = useMemo(() => {
    const mapa = {};
    boletasAdiestramiento
      .filter((b) => b.estado === "pagada" && b._dbId) // recién cuando el cliente pagó hay plata real que repartir
      .filter((b) => { const f = new Date(b.fechaISO); return f >= desde && f < hasta; })
      .forEach((b) => {
        const cliente = clientes.find((c) => esBoletaDeCliente(b, c));
        const responsable = cliente?.responsableNombre;
        if (!responsable) return;
        const monto = montoParaResponsable(b);
        if (!mapa[responsable]) mapa[responsable] = { responsable, boletasPendientes: [], montoPendiente: 0, montoPagado: 0 };
        if (b.pagadoAResponsable) mapa[responsable].montoPagado += monto;
        else { mapa[responsable].montoPendiente += monto; mapa[responsable].boletasPendientes.push(b); }
      });
    return Object.values(mapa).sort((a, b) => b.montoPendiente - a.montoPendiente);
  }, [boletasAdiestramiento, clientes, desde, hasta]);

  function marcarPagadosResponsable(fila) {
    const ids = new Set(fila.boletasPendientes.map((b) => b._dbId));
    setBoletasAdiestramiento((prev) => prev.map((b) => (ids.has(b._dbId) ? { ...b, pagadoAResponsable: true, pagadoAResponsablePor: nombreUsuario, pagadoAResponsableEn: new Date().toISOString() } : b)));
  }

  function desmarcarPagadoResponsable(dbId) {
    setBoletasAdiestramiento((prev) => prev.map((b) => (b._dbId === dbId ? { ...b, pagadoAResponsable: false, pagadoAResponsablePor: null, pagadoAResponsableEn: null } : b)));
  }

  const historialResponsables = boletasAdiestramiento
    .filter((b) => b.pagadoAResponsable)
    .sort((a, b) => new Date(b.pagadoAResponsableEn || 0) - new Date(a.pagadoAResponsableEn || 0));

  function yaPagado(paseador) {
    return pagosRegistrados.find((p) => p.paseador === paseador && p.periodo === periodo && p.etiqueta === etiqueta && !p.deshechoEn);
  }

  function marcarPagado(fila) {
    setPagosRegistrados((prev) => [...prev, {
      id: Date.now() + Math.random(),
      paseador: fila.paseador, periodo, etiqueta, monto: fila.monto, paseos: fila.realizados, clientes: fila.clientes,
      ajuste: fila.ajuste || 0,
      fechaPagoISO: fechaKey(new Date()),
      fechaPago: new Date().toLocaleDateString("es-CL"),
      // Inicio del período de TRABAJO que cubre este pago (no el día en
      // que se registra) — así Finanzas puede comparar costos e ingresos
      // usando la misma fecha (la del trabajo), no la de registro.
      periodoDesdeISO: fechaKey(desde),
      marcadoPor: nombreUsuario,
    }]);
    // El ajuste ya quedó guardado dentro del pago recién registrado — el
    // borrador en ajustes_pago_pendientes deja de tener sentido.
    setAjustesPago((prev) => prev.filter((a) => !(a.paseador === fila.paseador && a.periodo === periodo && a.etiqueta === etiqueta)));
  }

  // Antes esto borraba la fila entera — no quedaba ningún rastro de que
  // el pago había existido ni de quién lo deshizo. Ahora se marca como
  // revertida (sigue en el historial, con quién y cuándo) en vez de
  // desaparecer; yaPagado() y Finanzas (costosPeriodo) ya no la cuentan
  // como pago vigente porque filtran por deshechoEn.
  function desmarcarPagado(id) {
    setPagosRegistrados((prev) => prev.map((p) => (p.id === id ? { ...p, deshechoPor: nombreUsuario, deshechoEn: new Date().toISOString() } : p)));
  }

  const historial = [...pagosRegistrados].sort((a, b) => b.id - a.id);

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Pago a trabajadores</h2>
      <p style={hint}>Calculado desde los paseos que cada paseador marcó como realizados en "Mis paseos" (no desde lo facturado), con su tarifa por paseo.</p>

      <div style={{ display: "flex", gap: 8, margin: "16px 0 6px", flexWrap: "wrap" }}>
        {[["semana", "Semana"], ["mes", "Mes"]].map(([id, nombre]) => (
          <button key={id} onClick={() => { setPeriodo(id); setPeriodoOffset(0); }}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
              fontWeight: periodo === id ? 600 : 400 }}>
            {nombre}
          </button>
        ))}
        <span style={{ flex: "0 0 8px" }} />
        <button onClick={() => setPeriodoOffset((o) => o - 1)} style={botonSecundario}>← Anterior</button>
        <button onClick={() => setPeriodoOffset(0)} disabled={periodoOffset === 0} style={{ ...botonSecundario, opacity: periodoOffset === 0 ? 0.5 : 1 }}>Actual</button>
        <button onClick={() => setPeriodoOffset((o) => Math.min(o + 1, 0))} disabled={periodoOffset >= 0} style={{ ...botonSecundario, opacity: periodoOffset >= 0 ? 0.5 : 1 }}>Siguiente →</button>
      </div>
      <p style={{ ...hint, marginBottom: 6 }}>Período: <b style={{ color: NAVY }}>{etiqueta}</b></p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 8 }}>
        <p style={{ ...hint, margin: 0 }}>💚 Asegurado (cliente ya pagó): <b style={{ color: "#2F6A46" }}>{fmtCLP(totalAsegurado)}</b></p>
        <p style={{ ...hint, margin: 0 }}>🕓 Proyectado (falta cobrar/confirmar): <b style={{ color: "#8A6A1E" }}>{fmtCLP(totalProyectado)}</b></p>
      </div>
      <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: "14px 18px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: 0.5, color: "#9BAAB8" }}>Total a pagar este período (incluye ajustes)</span>
        <span style={{ fontSize: 21, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(totalAPagar)}</span>
      </div>

      <div className="howria-pagos-tabla" style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <th style={{ padding: "8px 10px" }}>Paseador</th>
              <th style={{ padding: "8px 10px" }}>Clientes</th>
              <th style={{ padding: "8px 10px" }} title="Solo cuenta los días del período que ya pasaron — un día programado de mañana no cuenta todavía como pendiente.">Cumplimiento</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Asegurado</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Proyectado</th>
              <th style={{ padding: "8px 10px" }}>Bono/descuento</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "8px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {resumenPorPaseador.map((r) => {
              const pagado = yaPagado(r.paseador);
              return (
                <tr key={r.paseador} style={{ borderTop: "1px solid #EDE4CE" }}>
                  <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{r.paseador}</td>
                  <td style={{ padding: "10px" }}>{r.clientes}</td>
                  <td style={{ padding: "10px" }}>
                    <span style={{ fontWeight: 600, color: r.cumplimiento >= 90 ? "#2F6A46" : r.cumplimiento >= 60 ? "#8A6A1E" : RUST }}>{r.realizados}/{r.programados}</span>
                    <span style={{ color: "#8A7E5C", marginLeft: 6, fontSize: 12 }}>({r.cumplimiento}%)</span>
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#2F6A46" }}>{fmtCLP(r.montoAsegurado)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#8A6A1E" }}>{fmtCLP(r.montoProyectado)}</td>
                  <td style={{ padding: "10px" }}>
                    <input type="number" value={r.ajuste || ""} placeholder="0" onChange={(e) => actualizarAjuste(r.paseador, e.target.value)}
                      style={{ ...input, marginBottom: 0, width: 100, padding: "6px 8px", fontSize: 12.5 }} />
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: NAVY }}>{fmtCLP(r.monto)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => descargarResumen(r)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12 }}>Descargar</button>
                      {pagado ? (
                        <>
                          <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                          <BotonEliminar onConfirm={() => desmarcarPagado(pagado.id)} label="Deshacer"
                            style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, borderColor: RUST, color: RUST }} />
                        </>
                      ) : (
                        <BotonConfirmable onConfirm={() => marcarPagado(r)} disabled={r.monto === 0} label="Marcar como pagado" colorConfirmar="#2F6A46"
                          style={{ border: "none", background: "#2F6A46", color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {resumenPorPaseador.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay paseadores asignados todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="howria-pagos-tarjetas" style={{ marginBottom: 30 }}>
        {resumenPorPaseador.map((r) => {
          const pagado = yaPagado(r.paseador);
          return (
            <div key={r.paseador} className="howria-card" style={{ background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 12, padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <p style={{ margin: 0, fontSize: 16, fontWeight: 700, color: NAVY }}>{r.paseador}</p>
                <span style={{ fontSize: 12, color: "#8A7E5C" }}>{r.clientes} cliente(s)</span>
              </div>
              <p style={{ margin: "0 0 10px", fontSize: 13 }}>
                Cumplimiento: <span style={{ fontWeight: 600, color: r.cumplimiento >= 90 ? "#2F6A46" : r.cumplimiento >= 60 ? "#8A6A1E" : RUST }}>{r.realizados}/{r.programados}</span>
                <span style={{ color: "#8A7E5C", marginLeft: 6, fontSize: 12 }}>({r.cumplimiento}%)</span>
              </p>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: "#8A7E5C" }}>Asegurado</span>
                <b style={{ color: "#2F6A46" }}>{fmtCLP(r.montoAsegurado)}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 10 }}>
                <span style={{ color: "#8A7E5C" }}>Proyectado</span>
                <b style={{ color: "#8A6A1E" }}>{fmtCLP(r.montoProyectado)}</b>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={{ display: "block", fontSize: 11, color: "#8A7E5C", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>Bono/descuento</label>
                <input type="number" value={r.ajuste || ""} placeholder="0" onChange={(e) => actualizarAjuste(r.paseador, e.target.value)}
                  style={{ ...input, marginBottom: 0, width: "100%" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#8A7E5C" }}>Total</span>
                <span style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>{fmtCLP(r.monto)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => descargarResumen(r)} style={{ ...botonSecundario, padding: "8px 14px", fontSize: 12.5 }}>Descargar</button>
                {pagado ? (
                  <>
                    <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "8px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                    <BotonEliminar onConfirm={() => desmarcarPagado(pagado.id)} label="Deshacer"
                      style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12, borderColor: RUST, color: RUST }} />
                  </>
                ) : (
                  <BotonConfirmable onConfirm={() => marcarPagado(r)} disabled={r.monto === 0} label="Marcar como pagado" colorConfirmar="#2F6A46"
                    style={{ ...botonPrincipal, background: "#2F6A46", boxShadow: "none", width: "auto", marginTop: 0, padding: "8px 16px", fontSize: 12.5 }} />
                )}
              </div>
            </div>
          );
        })}
        {resumenPorPaseador.length === 0 && (
          <p style={{ ...hint, textAlign: "center" }}>No hay paseadores asignados todavía.</p>
        )}
      </div>

      <p style={label}>Historial de pagos realizados</p>
      {cargandoPagos ? (
        <p style={{ ...hint, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando historial de pagos…</p>
      ) : historial.length === 0 ? (
        <p style={{ ...hint, marginTop: 8 }}>Todavía no se ha marcado ningún pago.</p>
      ) : (
        <div>
          {historial.map((p) => (
            <FilaLista key={p.id} Icono={Banknote} titulo={p.paseador}
              subtitulo={
                `${p.periodo === "semana" ? "Semana" : "Mes"} ${p.etiqueta} · pagado el ${p.fechaPago}${p.marcadoPor ? ` por ${p.marcadoPor}` : ""}` +
                (p.deshechoEn ? ` · revertido por ${p.deshechoPor || "alguien"} el ${new Date(p.deshechoEn).toLocaleDateString("es-CL")}` : "")
              }
              valor={fmtCLP(p.monto)} valorColor={p.deshechoEn ? "#B0A587" : NAVY} />
          ))}
        </div>
      )}

      <p style={{ ...label, marginTop: 30 }}>Pago a responsables (adiestramiento)</p>
      <p style={{ ...hint, marginBottom: 12 }}>
        Lo que le corresponde a cada responsable en las boletas de adiestramiento que el cliente ya pagó, en este mismo período — aparte del pago a paseadores de arriba.
      </p>
      {resumenPorResponsable.length === 0 ? (
        <p style={{ ...hint, marginBottom: 24 }}>Nadie tiene boletas de adiestramiento pagadas por el cliente, todavía sin pagarte, en este período.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {resumenPorResponsable.map((r) => (
            <div key={r.responsable} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, background: CREAM_SOFT, borderRadius: 8, padding: "10px 14px" }}>
              <div>
                <b style={{ color: NAVY }}>{r.responsable}</b>
                <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>{r.boletasPendientes.length} boleta(s) pendiente(s) de pagarle</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <b style={{ color: "#8A6A1E" }}>{fmtCLP(r.montoPendiente)}</b>
                <BotonEliminar onConfirm={() => marcarPagadosResponsable(r)} label="Marcar pagado" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5 }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <p style={label}>Historial de pagos a responsables</p>
      {historialResponsables.length === 0 ? (
        <p style={{ ...hint, marginTop: 8 }}>Todavía no se ha marcado ningún pago a un responsable.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {historialResponsables.map((b) => {
            const responsable = clientes.find((c) => esBoletaDeCliente(b, c))?.responsableNombre || "—";
            return (
              <div key={b._dbId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, padding: "8px 0", borderBottom: "1px solid #F1EAD9" }}>
                <div>
                  <b style={{ color: NAVY, fontSize: 13.5 }}>{responsable}</b>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>
                    Boleta N°{String(b.numero).padStart(3, "0")} de {b.cliente} · pagado el {b.pagadoAResponsableEn ? new Date(b.pagadoAResponsableEn).toLocaleDateString("es-CL") : "—"}{b.pagadoAResponsablePor ? ` por ${b.pagadoAResponsablePor}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <b style={{ color: NAVY, fontSize: 13 }}>{fmtCLP(montoParaResponsable(b))}</b>
                  <BotonEliminar onConfirm={() => desmarcarPagadoResponsable(b._dbId)} label="Deshacer"
                    style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, borderColor: RUST, color: RUST }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
