// Pestaña Pago trabajadores — cálculo de lo que se le debe a cada
// paseador/entrenador por período, con ajustes y pagos registrados. Ver
// src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { Banknote } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, MESES, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, SkeletonLista, FilaLista, BotonEliminar, BotonConfirmable,
  fmtCLP, fechaKey, esBoletaDeCliente, rangoPeriodo, showToast, comprimirImagen,
} from "../HowriaAdmin.jsx";
import { montoParaResponsable } from "../lib/calculosBoletas.js";
import { montoCompartido } from "../lib/reparto.js";
import { programadosEnRango, realizadosEnRango, montoRealizadoEnRango, pagosQueSeCruzan } from "../lib/pagos.js";
import { CeldaDiaMes, filasDetalleMes, detalleMesCliente, QueSeCuenta } from "./_compartido.jsx";
import { descargarLiquidacionPaseador } from "./_compartido_pdf.jsx";


// El ajuste vive en un modal, no inline en la tabla/tarjeta — no hay
// espacio real ahí para un monto Y un motivo (mismo motivo por el que
// "Compartir con..." en Coordinación se movió a un modal).
function ModalAjustePago({ paseador, monto, motivo, onMonto, onMotivo, onGuardar, onCerrar }) {
  const requiereMotivo = monto !== 0;
  const invalido = requiereMotivo && !motivo.trim();
  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 380, boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Ajuste de pago — {paseador}</h3>
        <p style={{ ...hint, marginTop: -2 }}>Monto positivo para un bono, negativo para un descuento.</p>
        <label style={label}>Monto</label>
        <input type="number" value={monto || ""} placeholder="0" onChange={(e) => onMonto(Number(e.target.value) || 0)} style={{ ...input, marginBottom: 14 }} autoFocus />
        <label style={label}>Motivo{requiereMotivo ? "" : " (opcional)"}</label>
        <input value={motivo} onChange={(e) => onMotivo(e.target.value)} placeholder="Ej: bono por buen desempeño, descuento por atraso reiterado..." style={{ ...input, marginBottom: 6 }} />
        {invalido && <p style={{ margin: "0 0 10px", fontSize: 12, color: RUST }}>Escribe un motivo para guardar el ajuste.</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onCerrar} style={botonSecundario}>Cancelar</button>
          <button onClick={onGuardar} disabled={invalido} style={{ ...botonPrincipal, width: "auto", flex: 1, opacity: invalido ? 0.6 : 1 }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// Verificación visual rápida antes de pagar: por cada cliente del
// paseador, una fila con un cuadradito por cada día del mes (realizado/
// falta marcar/cancelado/aún no llega), en vez de tener que revisar
// cliente por cliente en Mis Paseos. Incluye también clientes de OTRO
// paseador donde este ayudó puntualmente ("Compartir con...", Coordinación).
// El dibujo y el cálculo viven en _compartido.jsx porque la pestaña
// Paseadores usa lo mismo, ahí sí editable.
function ModalDetalleMes({ paseador, clientes, registroPaseos, mesInicial, anioInicial, onCerrar }) {
  const [mes, setMes] = useState(mesInicial);
  const [anio, setAnio] = useState(anioInicial);
  function cambiarMes(delta) {
    let m = mes + delta, a = anio;
    if (m < 0) { m = 11; a -= 1; } else if (m > 11) { m = 0; a += 1; }
    setMes(m); setAnio(a);
  }
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const hoyMedianoche = new Date(); hoyMedianoche.setHours(0, 0, 0, 0);

  const filas = useMemo(
    () => filasDetalleMes(clientes, paseador, registroPaseos, anio, mes, diasEnMes),
    [clientes, paseador, mes, anio, diasEnMes, registroPaseos],
  );

  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <h3 style={{ ...sectionTitle, fontSize: 16, margin: 0 }}>Detalle del mes — {paseador}</h3>
          <button onClick={onCerrar} style={{ border: "none", background: "none", fontSize: 20, color: "#8A7E5C", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "10px 0 14px" }}>
          <button onClick={() => cambiarMes(-1)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>← Mes anterior</button>
          <span style={{ fontWeight: 600, color: NAVY, fontSize: 13.5 }}>{MESES[mes]} {anio}</span>
          <button onClick={() => cambiarMes(1)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Mes siguiente →</button>
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "#8A7E5C", marginBottom: 16 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#2F6A46", display: "inline-block" }} /> Realizado</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: `1px dashed ${RUST}`, display: "inline-block" }} /> Falta marcar</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: "#EDE4CE", display: "inline-block" }} /> Cancelado</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 12, height: 12, borderRadius: 3, border: "1px solid #EDE4CE", display: "inline-block" }} /> Aún no llega</span>
        </div>

        {filas.length === 0 && <p style={{ ...hint, textAlign: "center" }}>Sin clientes ni paseos compartidos este mes.</p>}

        {filas.map(({ cliente, compartido }) => {
          const { realizados, monto, dias } = detalleMesCliente({ cliente, compartido, paseador, registroPaseos, anio, mes, diasEnMes, hoyMedianoche });
          return (
            <div key={cliente.id} style={{ padding: "10px 0", borderBottom: "1px solid #EDE4CE" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{cliente.nombre}{compartido ? " 🤝" : ""}</span>
                <span style={{ fontSize: 12, color: "#8A7E5C", whiteSpace: "nowrap" }}>{realizados} paseo(s) · {fmtCLP(monto)}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {dias.map((d) => <CeldaDiaMes key={d.dia} dia={d.dia} estado={d.estado} mes={mes} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PagoTrabajadores({ boletasEmitidas, boletasAdiestramiento = [], setBoletasAdiestramiento, clientes, usuarios, registroPaseos, pagosRegistrados, setPagosRegistrados, cargandoPagos, ajustesPago = [], setAjustesPago, nombreUsuario, reclamosPago = [], resolverReclamoPago }) {
  // Mes, igual que Finanzas. Antes esta pantalla abría en la semana y la
  // otra en el mes, así que al pasar de una a otra los totales no calzaban
  // y no había nada que dijera por qué.
  //
  // Alinearlos destapó una trampa que ya existía: "Pagado" se decide
  // comparando periodo+etiqueta EXACTOS, así que un pago hecho por semana
  // no calza al mirar el mes y la fila vuelve a salir impaga, con el monto
  // del mes entero. Por eso va junto con el aviso de pagos que se pisan
  // (pagosQueSeCruzan).
  const [periodo, setPeriodo] = useState("mes");
  const [generandoPdf, setGenerandoPdf] = useState(null);
  const [periodoOffset, setPeriodoOffset] = useState(0);
  const hoy = new Date();
  const fechaRef = useMemo(() => {
    const d = new Date(hoy);
    if (periodo === "semana") d.setDate(d.getDate() + periodoOffset * 7);
    else d.setMonth(d.getMonth() + periodoOffset);
    return d;
  }, [periodo, periodoOffset]);
  const { desde, hasta, etiqueta } = rangoPeriodo(periodo, fechaRef);
  // Mes/año de la boleta a revisar para "Asegurado"/"Proyectado" — del
  // PERÍODO que se está mirando (fechaRef), no siempre de hoy. Antes
  // quedaba fijo al mes calendario actual sin importar qué semana/mes
  // navegado se estuviera viendo, así que un período pasado de otro mes
  // igual comparaba contra la boleta de este mes.
  const mesFactura = fechaRef.getMonth(), anioFactura = fechaRef.getFullYear();
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
    ajustesPago.forEach((a) => { mapa[`${a.paseador}|${a.periodo}|${a.etiqueta}`] = { monto: a.monto, motivo: a.motivo || "" }; });
    return mapa;
  }, [ajustesPago]);

  // motivo es obligatorio cuando hay un monto (ver database/101) — un
  // ajuste quedaba con quién y cuándo, pero nunca por qué.
  function actualizarAjuste(paseador, valor, motivo) {
    const monto = Number(valor) || 0;
    setAjustesPago((prev) => {
      const idx = prev.findIndex((a) => a.paseador === paseador && a.periodo === periodo && a.etiqueta === etiqueta);
      const ahora = new Date().toISOString();
      if (monto === 0) {
        // sin monto no hay nada que ajustar — se quita el borrador si existía
        return idx === -1 ? prev : prev.filter((_, i) => i !== idx);
      }
      if (idx === -1) {
        return [...prev, { id: Date.now() + Math.random(), paseador, periodo, etiqueta, monto, motivo, actualizadoPor: nombreUsuario, actualizadoEn: ahora }];
      }
      const copia = [...prev];
      copia[idx] = { ...copia[idx], monto, motivo, actualizadoPor: nombreUsuario, actualizadoEn: ahora };
      return copia;
    });
  }

  const [ajusteModal, setAjusteModal] = useState(null);
  const [ajusteMontoForm, setAjusteMontoForm] = useState(0);
  const [ajusteMotivoForm, setAjusteMotivoForm] = useState("");
  const [detalleAbierto, setDetalleAbierto] = useState(null);

  function abrirAjuste(fila) {
    setAjusteMontoForm(fila.ajuste || 0);
    setAjusteMotivoForm(fila.ajusteMotivo || "");
    setAjusteModal(fila.paseador);
  }
  function guardarAjusteModal() {
    actualizarAjuste(ajusteModal, ajusteMontoForm, ajusteMotivoForm.trim());
    setAjusteModal(null);
  }

  function descargarResumen(fila) {
    const texto = `Resumen de pago — Howria\n` +
      `Paseador: ${fila.paseador}\n` +
      `Período: ${periodo === "semana" ? "Semana" : "Mes"} ${etiqueta}\n\n` +
      `Clientes atendidos: ${fila.clientes}\n` +
      `Paseos realizados: ${fila.realizados} / ${fila.programados} (${fila.cumplimiento}%)\n\n` +
      `Monto asegurado (cliente ya pagó): ${fmtCLP(fila.montoAsegurado)}\n` +
      `Monto proyectado (pendiente de cobro): ${fmtCLP(fila.montoProyectado)}\n` +
      `Ajuste manual (bono/descuento): ${fmtCLP(fila.ajuste)}${fila.ajuste && fila.ajusteMotivo ? ` — ${fila.ajusteMotivo}` : ""}\n` +
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

      // ¿la boleta de este cliente para el mes del período que se está viendo ya está pagada?
      const facturaMes = boletasEmitidas.find((b) => esBoletaDeCliente(b, c) && b.mes === MESES[mesFactura] && b.anio === anioFactura);
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
      const facturaMes = boletasEmitidas.find((b) => esBoletaDeCliente(b, c) && b.mes === MESES[mesFactura] && b.anio === anioFactura);
      const asegurado = facturaMes?.estado === "pagada";
      const cur = new Date(desde);
      while (cur < hastaEfectivo) {
        const r = registroPaseos[`${c.id}_${fechaKey(cur)}`];
        if (r?.realizado && r.compartidoCon) {
          if (!mapa[r.compartidoCon]) mapa[r.compartidoCon] = { paseador: r.compartidoCon, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 };
          if (asegurado) mapa[r.compartidoCon].montoAsegurado += montoCompartido(tarifa, r);
          else mapa[r.compartidoCon].montoProyectado += montoCompartido(tarifa, r);
        }
        cur.setDate(cur.getDate() + 1);
      }
    });

    return Object.values(mapa)
      .map((r) => {
        const ajusteInfo = ajustesPorClave[claveAjuste(r.paseador)] || { monto: 0, motivo: "" };
        return {
          ...r, ajuste: ajusteInfo.monto, ajusteMotivo: ajusteInfo.motivo,
          monto: r.montoAsegurado + r.montoProyectado + ajusteInfo.monto,
          cumplimiento: r.programados ? Math.round((r.realizados / r.programados) * 100) : 0,
        };
      })
      .sort((a, b) => b.monto - a.monto);
  }, [clientes, usuarios, registroPaseos, boletasEmitidas, desde, hastaEfectivo, mesFactura, anioFactura, ajustesPorClave, periodo, etiqueta]);

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

  // Pagos ya hechos que cubren trabajo DENTRO del rango que se está
  // mirando, sin ser el de este período exacto. Mirando el mes, las
  // semanas que ya se pagaron caen acá: la fila sale impaga por el mes
  // completo y pagarla otra vez pagaría esas semanas dos veces.
  function cruces(paseador) {
    return pagosQueSeCruzan(pagosRegistrados, paseador, desde, hasta, periodo, etiqueta);
  }

  function textoCruces(lista) {
    return `Ya le pagaste ${lista.map((p) => `${p.periodo === "semana" ? "la semana" : "el mes"} ${p.etiqueta} (${fmtCLP(p.monto)})`).join(", ")}. Este total cubre todo el período, así que pagarlo de nuevo se los paga dos veces.`;
  }

  // Comprobante en PDF de lo que se le paga a un paseador: qué perros
  // paseó, cuántas veces cada uno y a qué tarifa. Sale de los MISMOS
  // helpers que alimentan "Detalle del mes" en pantalla, así que el papel
  // y la pantalla no pueden discrepar.
  //
  // Va siempre por MES COMPLETO, aunque arriba se esté mirando una semana:
  // una liquidación de media semana no le sirve a nadie, y el PDF lleva el
  // mes escrito en el encabezado para que no quede duda de qué cubre.
  // Por lo mismo el total se calcula sumando las filas del PDF y no se
  // toma el de la tabla: así lo que se ve sumado es exactamente el total
  // que aparece abajo.
  // Detalle por perro del mes: qué perro, cuántos paseos, a qué tarifa.
  // Lo usan el PDF y el registro del pago, para que el papel diga
  // exactamente lo mismo que quedó guardado.
  function armarFilasLiquidacion(paseador) {
    const diasEnMes = new Date(anioFactura, mesFactura + 1, 0).getDate();
    const hoyMedianoche = new Date();
    hoyMedianoche.setHours(0, 0, 0, 0);
    return filasDetalleMes(clientes, paseador, registroPaseos, anioFactura, mesFactura, diasEnMes)
      .map(({ cliente, compartido }) => {
        const d = detalleMesCliente({ cliente, compartido, paseador, registroPaseos, anio: anioFactura, mes: mesFactura, diasEnMes, hoyMedianoche });
        return { perro: cliente.perro || cliente.nombre, cliente: cliente.nombre, compartido, realizados: d.realizados, tarifa: d.tarifa, monto: d.monto };
      })
      .filter((f) => f.realizados > 0)
      .sort((a, b) => b.monto - a.monto);
  }

  async function bajarLiquidacion(fila) {
    if (generandoPdf) return;
    setGenerandoPdf(fila.paseador);
    try {
      // Si el pago ya se registró, se usa el detalle GUARDADO en ese
      // momento y no uno recalculado: una liquidación es un comprobante y
      // tiene que decir lo mismo dentro de seis meses, aunque los datos
      // de origen hayan cambiado desde entonces.
      const yaPago = yaPagado(fila.paseador);
      const filas = yaPago?.detalle?.length ? yaPago.detalle : armarFilasLiquidacion(fila.paseador);

      if (filas.length === 0) {
        showToast(`${fila.paseador} no tiene paseos marcados en ${MESES[mesFactura]}.`);
        return;
      }
      const totalFilas = filas.reduce((acc, f) => acc + f.monto, 0);
      await descargarLiquidacionPaseador({
        paseador: fila.paseador,
        etiquetaPeriodo: `${MESES[mesFactura]} ${anioFactura}`,
        filas,
        ajuste: fila.ajuste || 0,
        ajusteMotivo: fila.ajusteMotivo || "",
        total: totalFilas + (fila.ajuste || 0),
      });
    } catch {
      showToast("No se pudo generar la liquidación.");
    } finally {
      setGenerandoPdf(null);
    }
  }

  // Marcar pagado ya no es directo: primero hay que adjuntar el
  // comprobante de la transferencia. Sin eso no se registra el pago —
  // decisión explícita de Javier, para que la contabilidad siempre tenga
  // respaldo de lo que salió.
  const [cobrando, setCobrando] = useState(null);   // fila que se está pagando
  const [comprobante, setComprobante] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  async function elegirComprobante(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSubiendo(true);
    try {
      // 1200px y no los 480 que se usan para fotos de perros: a ese
      // tamaño los montos de una transferencia salen borrosos y el
      // comprobante deja de servir como respaldo.
      setComprobante(await comprimirImagen(file, 1200, 0.75));
    } finally {
      setSubiendo(false);
    }
  }

  function cerrarCobro() {
    setCobrando(null);
    setComprobante(null);
  }

  function confirmarPago() {
    if (!cobrando || !comprobante) return;
    marcarPagado(cobrando, comprobante);
    cerrarCobro();
  }

  function marcarPagado(fila, imagenComprobante) {
    setPagosRegistrados((prev) => [...prev, {
      comprobante: imagenComprobante,
      // Foto del detalle con el que se calculó este pago (database/111).
      detalle: armarFilasLiquidacion(fila.paseador),
      id: Date.now() + Math.random(),
      paseador: fila.paseador, periodo, etiqueta, monto: fila.monto, paseos: fila.realizados, clientes: fila.clientes,
      ajuste: fila.ajuste || 0,
      ajusteMotivo: fila.ajuste ? (fila.ajusteMotivo || null) : null,
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
    <>
    {reclamosPago.filter((r) => !r.resuelto).length > 0 && (
      <div className="howria-card" style={{ ...tarjeta, border: `1px solid ${RUST}`, background: "#FBEEEA", marginBottom: 20 }}>
        <h2 style={{ ...sectionTitle, color: RUST }}>
          Mensajes sobre pagos ({reclamosPago.filter((r) => !r.resuelto).length})
        </h2>
        <p style={hint}>Un trabajador avisó que algo no le cuadra con su pago. Solo lo ves tú.</p>
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {reclamosPago.filter((r) => !r.resuelto).map((r) => (
            <div key={r.id} style={{ background: "#FFFFFF", borderRadius: 10, padding: 14 }}>
              <p style={{ margin: "0 0 4px", fontSize: 13.5, fontWeight: 700, color: NAVY }}>{r.trabajador}</p>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>
                {new Date(r.creado_en).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </p>
              <p style={{ margin: "0 0 12px", fontSize: 14, color: INK, whiteSpace: "pre-wrap" }}>{r.mensaje}</p>
              <button onClick={() => resolverReclamoPago(r.id, nombreUsuario)}
                style={{ ...botonSecundario, width: "auto", padding: "7px 14px", fontSize: 12.5, margin: 0 }}>
                Marcar como resuelto
              </button>
            </div>
          ))}
        </div>
      </div>
    )}

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
      {/* Acá se cuentan PASEOS REALIZADOS por la fecha en que se hicieron.
          Finanzas cuenta BOLETAS por el mes que cubren. Las dos llaman
          "mes" a lo suyo y no tienen por qué dar el mismo número — pero
          hasta acá ninguna lo decía, así que la única forma de notarlo era
          que los totales no calzaran. */}
      <QueSeCuenta
        que="paseos realizados, por el día en que se hicieron"
        desde={desde} hasta={new Date(hasta.getTime() - 1)} />
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
              const seCruzan = pagado ? [] : cruces(r.paseador);
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
                    <button onClick={() => abrirAjuste(r)} title={r.ajusteMotivo || ""}
                      style={{ border: `1px dashed ${GOLD}`, background: r.ajuste ? "#FBF3E0" : "none", color: NAVY, borderRadius: 7, padding: "6px 10px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {r.ajuste ? fmtCLP(r.ajuste) : "+ Ajuste"}
                    </button>
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: NAVY }}>{fmtCLP(r.monto)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => setDetalleAbierto(r.paseador)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12 }}>Detalle del mes</button>
                      <button onClick={() => bajarLiquidacion(r)} disabled={generandoPdf === r.paseador}
                        title="Comprobante en PDF para entregarle al paseador"
                        style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12, opacity: generandoPdf === r.paseador ? 0.5 : 1 }}>
                        {generandoPdf === r.paseador ? "Generando..." : "Liquidación PDF"}
                      </button>
                      <button onClick={() => descargarResumen(r)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12 }}>Descargar</button>
                      {pagado ? (
                        <>
                          <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                          <BotonEliminar onConfirm={() => desmarcarPagado(pagado.id)} label="Deshacer"
                            style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, borderColor: RUST, color: RUST }} />
                        </>
                      ) : (
                        <>
                          {seCruzan.length > 0 && (
                            <span title={textoCruces(seCruzan)}
                              style={{ fontSize: 11.5, color: RUST, background: "#F8ECE6", border: `1px solid ${RUST}`, padding: "6px 10px", borderRadius: 20, fontWeight: 600, cursor: "help" }}>
                              ⚠️ Ya pagado en parte
                            </span>
                          )}
                          <BotonConfirmable onConfirm={() => setCobrando(r)} disabled={r.monto === 0}
                            label={seCruzan.length > 0 ? "Pagar igual" : "Marcar como pagado"}
                            colorConfirmar={seCruzan.length > 0 ? RUST : "#2F6A46"}
                            style={{ border: "none", background: seCruzan.length > 0 ? RUST : "#2F6A46", color: "#fff", borderRadius: 6, padding: "7px 14px", fontSize: 12.5, cursor: "pointer" }} />
                        </>
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
          const seCruzan = pagado ? [] : cruces(r.paseador);
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
                <button onClick={() => abrirAjuste(r)}
                  style={{ width: "100%", textAlign: "left", border: `1px dashed ${GOLD}`, background: r.ajuste ? "#FBF3E0" : "none", color: NAVY, borderRadius: 7, padding: "9px 10px", fontSize: 13, cursor: "pointer" }}>
                  {r.ajuste ? `${fmtCLP(r.ajuste)}${r.ajusteMotivo ? ` — ${r.ajusteMotivo}` : ""}` : "+ Agregar ajuste"}
                </button>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#8A7E5C" }}>Total</span>
                <span style={{ fontSize: 19, fontWeight: 700, color: NAVY }}>{fmtCLP(r.monto)}</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setDetalleAbierto(r.paseador)} style={{ ...botonSecundario, padding: "8px 14px", fontSize: 12.5 }}>Detalle del mes</button>
                <button onClick={() => bajarLiquidacion(r)} disabled={generandoPdf === r.paseador}
                  style={{ ...botonSecundario, padding: "8px 14px", fontSize: 12.5, opacity: generandoPdf === r.paseador ? 0.5 : 1 }}>
                  {generandoPdf === r.paseador ? "Generando..." : "Liquidación PDF"}
                </button>
                <button onClick={() => descargarResumen(r)} style={{ ...botonSecundario, padding: "8px 14px", fontSize: 12.5 }}>Descargar</button>
                {pagado ? (
                  <>
                    <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "8px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                    <BotonEliminar onConfirm={() => desmarcarPagado(pagado.id)} label="Deshacer"
                      style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12, borderColor: RUST, color: RUST }} />
                  </>
                ) : (
                  <>
                    {seCruzan.length > 0 && (
                      <p style={{ margin: 0, flex: "1 1 100%", fontSize: 12, color: RUST, background: "#F8ECE6", border: `1px solid ${RUST}`, padding: "8px 10px", borderRadius: 8 }}>
                        ⚠️ {textoCruces(seCruzan)}
                      </p>
                    )}
                    <BotonConfirmable onConfirm={() => setCobrando(r)} disabled={r.monto === 0}
                      label={seCruzan.length > 0 ? "Pagar igual" : "Marcar como pagado"}
                      colorConfirmar={seCruzan.length > 0 ? RUST : "#2F6A46"}
                      style={{ ...botonPrincipal, background: seCruzan.length > 0 ? RUST : "#2F6A46", boxShadow: "none", width: "auto", marginTop: 0, padding: "8px 16px", fontSize: 12.5 }} />
                  </>
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
        <div style={{ marginTop: 10 }}><SkeletonLista filas={3} alto={34} /></div>
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
    {ajusteModal && (
      <ModalAjustePago paseador={ajusteModal} monto={ajusteMontoForm} motivo={ajusteMotivoForm}
        onMonto={setAjusteMontoForm} onMotivo={setAjusteMotivoForm} onGuardar={guardarAjusteModal} onCerrar={() => setAjusteModal(null)} />
    )}
    {cobrando && (
      <div onClick={cerrarCobro} className="howria-modal-fondo"
        style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
        <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" className="howria-modal-caja"
          style={{ background: "#FFFFFF", borderRadius: 14, padding: 24, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto" }}>
          <h3 style={{ ...sectionTitle, fontSize: 17, margin: "0 0 4px" }}>Pagar a {cobrando.paseador}</h3>
          <p style={{ ...hint, marginTop: 0 }}>{etiqueta} · {cobrando.realizados} paseo(s)</p>
          <p style={{ margin: "10px 0 16px", fontSize: 26, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(cobrando.monto)}</p>

          <label style={{ ...botonSecundario, display: "inline-block", padding: "10px 16px", cursor: subiendo ? "wait" : "pointer", marginBottom: 12 }}>
            {subiendo ? "Procesando..." : comprobante ? "Cambiar comprobante" : "Adjuntar comprobante"}
            <input type="file" accept="image/*" onChange={elegirComprobante} style={{ display: "none" }} />
          </label>

          {comprobante ? (
            <img src={comprobante} alt="Comprobante de la transferencia"
              style={{ display: "block", width: "100%", borderRadius: 8, border: "1px solid #E4DBC3", marginBottom: 14 }} />
          ) : (
            <p style={{ ...hint, margin: "0 0 14px", color: RUST }}>
              Adjunta la captura de la transferencia para poder registrar el pago.
            </p>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={confirmarPago} disabled={!comprobante || subiendo}
              style={{ ...botonPrincipal, marginTop: 0, width: "auto", padding: "10px 20px", background: "#2F6A46", opacity: !comprobante || subiendo ? 0.45 : 1 }}>
              Confirmar pago
            </button>
            <button onClick={cerrarCobro} style={{ ...botonSecundario, width: "auto", padding: "10px 20px", margin: 0 }}>Cancelar</button>
          </div>
        </div>
      </div>
    )}
    {detalleAbierto && (
      <ModalDetalleMes paseador={detalleAbierto} clientes={clientes} registroPaseos={registroPaseos}
        mesInicial={mesFactura} anioInicial={anioFactura} onCerrar={() => setDetalleAbierto(null)} />
    )}
    </>
  );
}
