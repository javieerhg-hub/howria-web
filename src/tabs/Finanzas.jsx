// Pestaña Finanzas — ingresos, gráfico y desgloses por período. Ver
// src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Dog } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, MESES, TIPOS_SERVICIO,
  tarjeta, sectionTitle, hint, label, input, botonSecundario, FilaLista,
  fmtCLP, fechaKey, esBoletaDeCliente, inicioSemana,
} from "../HowriaAdmin.jsx";
import { diasSegunPlan, calcularTotales, esVenta, montoParaResponsable } from "../lib/calculosBoletas.js";
import { TarjetaResumenFactura } from "./_compartido.jsx";

function variacion(actual, anterior) {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

export function Finanzas({ boletasEmitidas: boletasEmitidasProp, boletasAdiestramiento: boletasAdiestramientoProp = [], clientes: clientesProp, pagosRegistrados: pagosRegistradosProp = [], registroPaseos = {}, reprogramaciones = [], user, onVerPagos }) {
  const [periodo, setPeriodo] = useState("semana");
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const hoy = new Date();

  // Un paseador o entrenador no debe ver las finanzas generales de
  // Howria — solo lo que tiene que ver con los clientes que se le
  // asignaron. Se filtran los datos de entrada acá para que el resto
  // del cálculo (que ya trabaja sobre clientes/boletasEmitidas/etc.)
  // quede automáticamente acotado, sin duplicar lógica.
  const esPaseador = user?.rol === "paseador";
  const esEntrenador = user?.rol === "entrenador";
  // La cuenta administrador (Howria) es la cuenta general de la empresa
  // — nunca debe quedar acotada, ni siquiera si figura como responsable
  // de algún cliente (ver más abajo). Debe ver siempre el negocio
  // completo, sin excepción.
  const esAdmin = user?.rol === "administrador";
  // "Responsable de la cuenta" es un rol de negocio (dueño del caso,
  // ej. Javier Arniaz) que no está atado a un rol fijo de la app —
  // Arniaz, por ejemplo, es "entrenador" en el sistema pero también es
  // responsable de varios clientes. Si esta persona figura
  // como responsable de al menos un cliente, su Finanzas personal se
  // acota a esos clientes (viendo paseo Y adiestramiento juntos, es
  // dueño del caso completo) — esto manda por encima de cualquier
  // acotamiento más angosto que ya tuviera por su rol de app.
  const misClientesComoResponsable = esAdmin ? [] : clientesProp.filter((c) => c.responsableNombre === user?.nombre);
  const esResponsable = misClientesComoResponsable.length > 0;
  // Paseador/entrenador SIEMPRE ven su vista personal — es un
  // acotamiento de datos por privacidad, no una preferencia, y "ser
  // responsable" manda por encima igual (ver comentario arriba). Pero un
  // coordinador (u otro rol que por defecto ve el negocio completo) que
  // además figura como responsable de algún cliente quedaba acotado a su
  // vista personal PARA SIEMPRE, sin ninguna forma de volver a ver los
  // totales de la empresa — se agrega este toggle solo para ese caso.
  const puedeAlternarVista = esResponsable && !esPaseador && !esEntrenador;
  const [verEmpresaCompleta, setVerEmpresaCompleta] = useState(false);
  const aplicaResponsable = esResponsable && !(puedeAlternarVista && verEmpresaCompleta);
  const vistaPersonal = esPaseador || esEntrenador || aplicaResponsable;
  const clientes = aplicaResponsable
    ? misClientesComoResponsable
    : esPaseador
    ? clientesProp.filter((c) => c.paseadorNombre === user.nombre)
    : esEntrenador
    ? clientesProp.filter((c) => c.adiestradorNombre === user.nombre)
    : clientesProp;
  const boletasEmitidas = aplicaResponsable
    ? boletasEmitidasProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : esEntrenador
    ? []
    : esPaseador
    ? boletasEmitidasProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : boletasEmitidasProp;
  const boletasAdiestramiento = aplicaResponsable
    ? boletasAdiestramientoProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : esPaseador
    ? []
    : esEntrenador
    ? boletasAdiestramientoProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : boletasAdiestramientoProp;
  const pagosRegistrados = vistaPersonal ? [] : pagosRegistradosProp;

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento", cantidad: 0, descuento: (b.descuentoPackMonto || 0) })),
  ], [boletasEmitidas, boletasAdiestramiento]);
  // Solo lo aceptado/pagado cuenta como venta real — un borrador sin
  // revisar o una boleta cancelada no deben sumar en ningún ingreso.
  const todasLasBoletasVenta = useMemo(() => todasLasBoletas.filter(esVenta), [todasLasBoletas]);

  // "Personalizado" cubre lo que antes faltaba del todo: elegir un rango
  // de fechas propio en vez de estar limitado a semana/mes/año fijos. Sin
  // período anterior con el que comparar (no hay un "rango equivalente
  // anterior" bien definido), así que anteriorDesde/anteriorHasta quedan
  // en null y la tarjeta de variación se oculta para ese caso.
  const { actualDesde, actualHasta, anteriorDesde, anteriorHasta } = useMemo(() => {
    if (periodo === "personalizado") {
      const desde = rangoDesde ? new Date(`${rangoDesde}T00:00:00`) : new Date(0);
      const hasta = rangoHasta ? new Date(`${rangoHasta}T23:59:59`) : hoy;
      return { actualDesde: desde, actualHasta: hasta, anteriorDesde: null, anteriorHasta: null };
    }
    if (periodo === "semana") {
      const inicioActual = inicioSemana(hoy);
      const inicioAnterior = new Date(inicioActual); inicioAnterior.setDate(inicioAnterior.getDate() - 7);
      return { actualDesde: inicioActual, actualHasta: null, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
    }
    if (periodo === "mes") {
      const inicioActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      return { actualDesde: inicioActual, actualHasta: null, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
    }
    const inicioActual = new Date(hoy.getFullYear(), 0, 1);
    const inicioAnterior = new Date(hoy.getFullYear() - 1, 0, 1);
    return { actualDesde: inicioActual, actualHasta: null, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
  }, [periodo, rangoDesde, rangoHasta]);

  const filtradas = useMemo(() =>
    todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f >= actualDesde && (!actualHasta || f <= actualHasta); }),
    [todasLasBoletasVenta, actualDesde, actualHasta]);
  const anteriores = useMemo(() =>
    anteriorDesde ? todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f >= anteriorDesde && f < anteriorHasta; }) : [],
    [todasLasBoletasVenta, anteriorDesde, anteriorHasta]);

  const actual = calcularTotales(filtradas);
  const anterior = calcularTotales(anteriores);
  // Se filtra por la fecha del PERÍODO DE TRABAJO que cubre el pago
  // (periodoDesdeISO), la misma dimensión que usan los ingresos
  // (fechaISO de la boleta) — no por fecha_pago (el día en que se tildó
  // el pago), que puede caer en un período totalmente distinto al
  // trabajo que paga. Pagos viejos, de antes de que existiera
  // periodoDesdeISO, usan fechaPagoISO como respaldo.
  const costosPeriodo = useMemo(() =>
    pagosRegistrados
      .filter((p) => {
        if (p.deshechoEn) return false; // revertido: no es un costo real
        const fISO = p.periodoDesdeISO || p.fechaPagoISO;
        if (!fISO) return false;
        const f = new Date(fISO);
        return f >= actualDesde && (!actualHasta || f <= actualHasta);
      })
      .reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosRegistrados, actualDesde, actualHasta]);
  // Plata pagada a responsables de cuenta en boletas de adiestramiento —
  // costo real para Howria, igual que el pago a paseadores, así que
  // también se resta de la utilidad general.
  const costoResponsablesAdiestramiento = useMemo(() =>
    filtradas.filter((b) => b._tipo === "adiestramiento").reduce((acc, b) => acc + montoParaResponsable(b), 0),
    [filtradas]);
  // "Tu parte" — lo que efectivamente le corresponde al responsable
  // después del reparto con Howria en adiestramiento (los paseos no
  // tienen reparto, van completos). Solo tiene sentido en la vista
  // personal de un responsable de cuenta.
  const tuParte = useMemo(() => filtradas.reduce((acc, b) => acc + montoParaResponsable(b), 0), [filtradas]);
  const utilidad = actual.ingresos - costosPeriodo - costoResponsablesAdiestramiento;
  const promedioBoleta = actual.cantidad ? actual.ingresos / actual.cantidad : 0;
  const varIngresos = variacion(actual.ingresos, anterior.ingresos);

  const porCliente = useMemo(() => {
    const mapa = {};
    filtradas.forEach((b) => { mapa[b.cliente] = (mapa[b.cliente] || 0) + b.total; });
    return Object.entries(mapa).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const dataGrafico = useMemo(() => {
    if (periodo === "año") {
      return MESES.map((m, i) => ({
        etiqueta: m.slice(0, 3),
        total: todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === i && f.getFullYear() === hoy.getFullYear(); }).reduce((acc, b) => acc + b.total, 0),
      }));
    }
    const mapa = {};
    filtradas.forEach((b) => {
      const f = new Date(b.fechaISO);
      const clave = f.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
      mapa[clave] = (mapa[clave] || 0) + b.total;
    });
    return Object.entries(mapa).map(([etiqueta, total]) => ({ etiqueta, total }));
  }, [filtradas, periodo, todasLasBoletasVenta]);

  const clientesSinBoletaEsteMes = useMemo(() => {
    return clientes.filter((c) => !todasLasBoletas.some((b) => {
      const f = new Date(b.fechaISO);
      return esBoletaDeCliente(b, c) && f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    }));
  }, [clientes, todasLasBoletas]);

  const porTipoServicio = useMemo(() => {
    return TIPOS_SERVICIO.map((t) => {
      const monto = filtradas.filter((b) => clientes.find((c) => c.nombre === b.cliente)?.tipoServicio?.includes(t.id)).reduce((acc, b) => acc + b.total, 0);
      return { tipo: t.nombre, monto };
    });
  }, [filtradas, clientes]);

  const mesActualIdx = hoy.getMonth(), anioActualN = hoy.getFullYear();
  const proyeccionMes = useMemo(() => {
    return clientes.filter((c) => (c.estadoCliente || "activo") === "activo")
      .reduce((acc, c) => acc + diasSegunPlan(mesActualIdx, anioActualN, c.diasHabituales || []).length * Number(c.valorPaseoRef || 0), 0);
  }, [clientes, mesActualIdx, anioActualN]);
  const facturadoEsteMes = todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === mesActualIdx && f.getFullYear() === anioActualN; }).reduce((acc, b) => acc + b.total, 0);
  const porcentajeFacturado = proyeccionMes ? Math.round((facturadoEsteMes / proyeccionMes) * 100) : 0;

  const etiquetaPeriodo = { semana: "esta semana", mes: "este mes", año: "este año", personalizado: "en el rango elegido" }[periodo];
  const etiquetaAnterior = { semana: "semana anterior", mes: "mes anterior", año: "año anterior" }[periodo];

  function imprimirInforme() {
    window.print();
  }

  // Antes "Imprimir informe" (impresión del navegador) era la única
  // salida de estos datos — se agrega un CSV con el detalle del período
  // elegido, más fácil de llevar a una planilla que un PDF impreso.
  function exportarCsvFinanzas() {
    const encabezado = ["Numero", "Tipo", "Cliente", "Fecha", "Total"];
    const filas = filtradas.map((b) => [String(b.numero).padStart(3, "0"), b._tipo === "paseo" ? "Paseo" : "Adiestramiento", b.cliente, b.fecha, b.total]);
    const csv = [encabezado, ...filas].map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `finanzas-${fechaKey(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Rama exclusiva para paseador: nada de facturación/ingresos de sus
  // clientes (eso es plata del cliente, no suya) — solo lo que se le va
  // a pagar A ÉL. Manda siempre para este rol, aunque también figure
  // como responsable de algún cliente (ese concepto queda para
  // entrenador/coordinador/administrador). Mismo criterio que "Tu pago"
  // en Mis Paseos (resumenMensual, HowriaAdmin.jsx) — realizados menos
  // cancelados × tarifaPaseador — pero generalizado al selector de
  // período semana/mes/año en vez de quedar fijo al mes en curso.
  if (esPaseador) {
    const misClientesPaseador = clientesProp.filter((c) => c.paseadorNombre === user.nombre);
    const hoyLocal = new Date();
    hoyLocal.setHours(0, 0, 0, 0);

    function diasEnRango(desde, hasta, diasSemana) {
      const claves = [];
      const cursor = new Date(desde);
      cursor.setHours(0, 0, 0, 0);
      const fin = new Date(hasta);
      fin.setHours(0, 0, 0, 0);
      while (cursor <= fin) {
        const dow = (cursor.getDay() + 6) % 7;
        if (diasSemana.includes(dow)) claves.push(fechaKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return claves;
    }

    // Para semana/mes/año el rango siempre corre hasta hoy — para un
    // rango personalizado en el pasado, hay que parar en actualHasta y no
    // seguir contando días después de esa fecha.
    const finPaseador = actualHasta && actualHasta < hoyLocal ? actualHasta : hoyLocal;
    const resumenPaseador = misClientesPaseador.map((c) => {
      const clavesHabituales = diasEnRango(actualDesde, finPaseador, c.diasHabituales || []);
      // Un paseo movido HACIA una fecha dentro del rango (venga de donde
      // venga) también cuenta — si no, el paseador pierde la plata de un
      // paseo que sí hizo, solo porque cayó en un día no habitual.
      const desdeKey = fechaKey(actualDesde), hastaKey = fechaKey(finPaseador);
      const clavesReprogramadas = reprogramaciones
        .filter((r) => r.clienteId === c._dbId && r.fechaNueva >= desdeKey && r.fechaNueva <= hastaKey)
        .map((r) => r.fechaNueva);
      const claves = [...new Set([...clavesHabituales, ...clavesReprogramadas])];
      const cancelados = claves.filter((k) => registroPaseos[`${c.id}_${k}`]?.cancelado).length;
      const validas = claves.filter((k) => !registroPaseos[`${c.id}_${k}`]?.cancelado);
      const realizados = validas.filter((k) => registroPaseos[`${c.id}_${k}`]?.realizado).length;
      // "faltantes": de los días netos de cancelación, los que ya deberían
      // haberse hecho (el rango nunca pasa de hoy, ver finPaseador arriba)
      // pero todavía no se marcaron — un paseo que se quedó sin registrar.
      const faltantes = validas.length - realizados;
      return { cliente: c, programados: validas.length, realizados, cancelados, faltantes, monto: realizados * Number(c.tarifaPaseador || 0) };
    });
    const totalRealizadosPaseador = resumenPaseador.reduce((acc, r) => acc + r.realizados, 0);
    const totalProgramadosPaseador = resumenPaseador.reduce((acc, r) => acc + r.programados, 0);
    const totalMontoPaseador = resumenPaseador.reduce((acc, r) => acc + r.monto, 0);

    function exportarCsvPaseador() {
      const encabezado = ["Cliente", "Perro", "Programados", "Realizados", "Cancelados", "Faltantes", "Monto"];
      const filas = resumenPaseador.map((r) => [r.cliente.nombre, r.cliente.perro, r.programados, r.realizados, r.cancelados, r.faltantes, r.monto]);
      const csv = [encabezado, ...filas].map((fila) => fila.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tu-pago-${fechaKey(new Date())}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }

    return (
      <div className="howria-card" style={tarjeta} id="reporte-finanzas">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #reporte-finanzas, #reporte-finanzas * { visibility: visible; }
            #reporte-finanzas { position: absolute; top: 0; left: 0; width: 100%; border: none; }
            #reporte-finanzas .no-imprimir { display: none; }
          }
        `}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Tu pago</h2>
            <p style={hint}>Solo tus paseos y lo que se te paga por ellos — no lo que se les factura a los clientes.</p>
          </div>
          <div className="no-imprimir" style={{ display: "flex", gap: 8, flex: "none" }}>
            <button onClick={exportarCsvPaseador} style={{ ...botonSecundario, flex: "none" }}>Exportar CSV</button>
            <button onClick={imprimirInforme} className="howria-finanzas-imprimir" style={{ ...botonSecundario, flex: "none" }}>Imprimir informe</button>
          </div>
        </div>

        <div className="no-imprimir" style={{ display: "flex", gap: 8, margin: "16px 0 12px", flexWrap: "wrap" }}>
          {[["semana", "Esta semana"], ["mes", "Este mes"], ["año", "Este año"], ["personalizado", "Personalizado"]].map(([id, nombre]) => (
            <button key={id} onClick={() => setPeriodo(id)}
              style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
                fontWeight: periodo === id ? 600 : 400 }}>
              {nombre}
            </button>
          ))}
        </div>
        {periodo === "personalizado" && (
          <div className="no-imprimir" style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 24px", flexWrap: "wrap" }}>
            <input type="date" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} title="Desde" />
            <span style={{ fontSize: 13, color: "#8A7E5C" }}>hasta</span>
            <input type="date" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} title="Hasta" />
          </div>
        )}

        <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#9BAAB8", textTransform: "uppercase" }}>Paseos realizados</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "Georgia, serif" }}>{totalRealizadosPaseador} / {totalProgramadosPaseador}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Avance</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{totalProgramadosPaseador ? Math.round((totalRealizadosPaseador / totalProgramadosPaseador) * 100) : 0}%</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Monto a recibir {etiquetaPeriodo}</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(totalMontoPaseador)}</p>
          </div>
        </div>

        <p style={label}>Detalle por cliente</p>
        {resumenPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no tienes clientes asignados.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {resumenPaseador.map((r) => (
              <div key={r.cliente.id} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #EDE4CE", background: "#FFFFFF", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: r.cliente.fotoUrl ? `url(${r.cliente.fotoUrl}) center/cover` : CREAM_SOFT }} />
                  <p style={{ margin: 0, fontWeight: 600, color: NAVY, fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente.nombre}</p>
                </div>
                <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>{r.realizados}/{r.programados} paseos</p>
                <div style={{ display: "inline-block", background: GOLD, borderRadius: 6, padding: "5px 9px" }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(r.monto)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="howria-card" style={tarjeta} id="reporte-finanzas">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #reporte-finanzas, #reporte-finanzas * { visibility: visible; }
          #reporte-finanzas { position: absolute; top: 0; left: 0; width: 100%; border: none; }
          #reporte-finanzas .no-imprimir { display: none; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={sectionTitle}>{vistaPersonal ? "Finanzas de tus clientes" : "Finanzas de Howria"}</h2>
          <p style={hint}>
            {vistaPersonal
              ? "Informes generados a partir de las boletas de los clientes que tienes asignados — se actualizan solos con cada boleta nueva."
              : "Informes generados a partir de las boletas emitidas — se actualizan solos con cada boleta nueva."}
          </p>
        </div>
        <div className="no-imprimir" style={{ display: "flex", gap: 8, flex: "none" }}>
          {puedeAlternarVista && (
            <button onClick={() => setVerEmpresaCompleta((v) => !v)} style={{ ...botonSecundario, flex: "none" }}>
              {verEmpresaCompleta ? "Ver mis clientes" : "Ver toda la empresa"}
            </button>
          )}
          <button onClick={exportarCsvFinanzas} style={{ ...botonSecundario, flex: "none" }}>Exportar CSV</button>
          <button onClick={imprimirInforme} className="howria-finanzas-imprimir" style={{ ...botonSecundario, flex: "none" }}>Imprimir informe</button>
        </div>
      </div>

      <div className="no-imprimir" style={{ display: "flex", gap: 8, margin: "16px 0 12px", flexWrap: "wrap" }}>
        {[["semana", "Informe semanal"], ["mes", "Informe mensual"], ["año", "Informe anual"], ["personalizado", "Personalizado"]].map(([id, nombre]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
              fontWeight: periodo === id ? 600 : 400 }}>
            {nombre}
          </button>
        ))}
      </div>
      {periodo === "personalizado" && (
        <div className="no-imprimir" style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 24px", flexWrap: "wrap" }}>
          <input type="date" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} title="Desde" />
          <span style={{ fontSize: 13, color: "#8A7E5C" }}>hasta</span>
          <input type="date" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} title="Hasta" />
        </div>
      )}

      <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: `repeat(${vistaPersonal ? (esResponsable ? 4 : 3) : 6}, 1fr)`, gap: 14, marginBottom: 26 }}>
        <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Ingresos {etiquetaPeriodo}</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(actual.ingresos)}</p>
          {periodo !== "personalizado" && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: varIngresos >= 0 ? "#9FD8A8" : "#E3A08C" }}>
              {varIngresos >= 0 ? "▲" : "▼"} {Math.abs(varIngresos).toFixed(0)}% vs {etiquetaAnterior}
            </p>
          )}
        </div>
        {vistaPersonal && esResponsable && (
          <div style={{ background: "#D8ECDE", borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#2F6A46", textTransform: "uppercase", letterSpacing: 0.5 }}>Tu parte</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2F6A46", fontFamily: "Georgia, serif" }}>{fmtCLP(tuParte)}</p>
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Pago a paseadores</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costosPeriodo)}</p>
            {onVerPagos && (
              <button onClick={onVerPagos} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0, marginTop: 8 }}>
                Ver en Pago trabajadores →
              </button>
            )}
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Pago a responsables</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costoResponsablesAdiestramiento)}</p>
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: utilidad >= 0 ? "#D8ECDE" : "#F1DCD2", borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: utilidad >= 0 ? "#2F6A46" : RUST, textTransform: "uppercase", letterSpacing: 0.5 }}>Ganancia de Howria</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: utilidad >= 0 ? "#2F6A46" : RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(utilidad)}</p>
          </div>
        )}
        <TarjetaResumenFactura titulo="Boletas emitidas" valor={actual.cantidad} color="#8A7E5C" bg={CREAM_SOFT} />
        <TarjetaResumenFactura titulo="Ticket promedio" valor={fmtCLP(promedioBoleta)} color="#8A7E5C" bg={CREAM_SOFT} />
      </div>
      {!vistaPersonal && (
        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: -18, marginBottom: 26 }}>
          Es lo que le queda a Howria después de los pagos a paseadores ya registrados como pagados en esta app, y de lo que le corresponde a cada responsable en las facturas de adiestramiento donde se definió el reparto — no incluye otros gastos del negocio.
        </p>
      )}
      {vistaPersonal && (
        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: -18, marginBottom: 26 }}>
          {esResponsable
            ? '"Ingresos" es lo facturado en este período a los clientes de los que eres responsable. "Tu parte" descuenta lo que le queda a Howria en las facturas de adiestramiento donde se definió un reparto — si no se definió, se cuenta completa como tuya.'
            : esPaseador
            ? 'Esto es lo facturado a tus clientes en este período, no lo que se te paga a ti — para eso revisa "Tu pago" en Mis paseos.'
            : 'Esto es lo facturado a los clientes que atiendes en este período, no lo que se te paga a ti por las clases — consulta con administración cómo se calcula tu pago.'}
        </p>
      )}

      <div className="howria-card" style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, marginBottom: 26 }}>
        <p style={{ ...label, marginBottom: 2 }}>Proyección del mes en curso (si se factura todo el plan habitual de cada cliente activo)</p>
        <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>Siempre es el mes calendario actual — no cambia con el período elegido arriba.</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(proyeccionMes)}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Ya facturado este mes: {fmtCLP(facturadoEsteMes)} ({porcentajeFacturado}%)</p>
        </div>
      </div>

      <p style={label}>Ingresos por tipo de servicio {etiquetaPeriodo} (un cliente puede contar en más de un tipo)</p>
      <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 26 }}>
        {porTipoServicio.map((t) => (
          <div key={t.tipo} style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>{t.tipo}</p>
            <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 17 }}>{fmtCLP(t.monto)}</p>
          </div>
        ))}
      </div>

      <p style={label}>Ingresos {periodo === "año" ? "por mes" : "por día"}</p>
      <div style={{ width: "100%", height: 220, marginBottom: 30 }}>
        <ResponsiveContainer>
          <BarChart data={dataGrafico}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDE4CE" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7E5C" }} />
            <YAxis tick={{ fontSize: 11, fill: "#8A7E5C" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtCLP(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EDE4CE" }} />
            <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <p style={label}>Ingresos por cliente {etiquetaPeriodo}</p>
          {porCliente.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todavía no hay boletas generadas en este período.</p>
          ) : (
            <div>
              {porCliente.map((c, i) => (
                <FilaLista key={c.nombre} Icono={Dog} titulo={`${i === 0 ? "🏅 " : ""}${c.nombre}`} valor={fmtCLP(c.total)} valorColor={NAVY} />
              ))}
            </div>
          )}
        </div>

        <div>
          <p style={{ ...label, marginBottom: 2 }}>Clientes sin boleta este mes</p>
          <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>Siempre es el mes calendario actual — no cambia con el período elegido arriba.</p>
          {clientesSinBoletaEsteMes.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todos los clientes tienen boleta generada este mes.</p>
          ) : (
            <div>
              {clientesSinBoletaEsteMes.map((c) => (
                <FilaLista key={c.id} Icono={Dog} titulo={c.nombre} subtitulo={c.perro} valor="Pendiente" valorColor={RUST} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
