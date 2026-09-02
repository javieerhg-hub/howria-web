// Pestaña Finanzas — ingresos, gráfico y desgloses por período. Ver
// src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Dog } from "lucide-react";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, MESES, DIAS_SEMANA_LARGO, TIPOS_SERVICIO, CATEGORIAS_COSTO, grupoDeCategoria,
  MAX_PERROS_POR_TURNO, contarPerros,
  tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario, FilaLista, BotonEliminar,
  fmtCLP, fechaKey, esBoletaDeCliente, inicioSemana,
} from "../HowriaAdmin.jsx";
import { diasSegunPlan, calcularTotales, esVenta, montoParaResponsable, periodoDeBoleta } from "../lib/calculosBoletas.js";
import { diasDelMesProgramados } from "../lib/programacion.js";
import { resumenPaseadorEnRango } from "../lib/pagos.js";
import { TarjetaResumenFactura } from "./_compartido.jsx";

// Ventana con el respaldo de una cifra. Cada tarjeta de Finanzas puede
// abrir una: el número solo dice cuánto, y para confiar en él hay que
// poder ver de dónde sale sin salir de la pantalla.
//
// Acepta dos formas. `filas` es una lista (las boletas que suman, las
// personas a las que se debe). `formula` es una resta paso a paso, para
// las cifras que no son una suma de cosas sino una cuenta — "queda para
// Howria" o el margen.
function ModalDetalleFinanzas({ detalle, onCerrar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);
  if (!detalle) return null;
  const { titulo, subtitulo, total, filas = [], formula = [], vacio } = detalle;

  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 320, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={titulo} className="howria-modal-caja"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 24, maxWidth: 520, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: "0 0 2px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{titulo}</h3>
            {subtitulo && <p style={{ margin: 0, fontSize: 12.5, color: "#8A7E5C" }}>{subtitulo}</p>}
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>

        {formula.length > 0 && (
          <div style={{ margin: "18px 0 0", display: "grid", gap: 8 }}>
            {formula.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 8, borderBottom: f.esTotal ? "none" : "1px solid #EDE4CE" }}>
                <span style={{ fontSize: f.esTotal ? 14 : 13, color: f.esTotal ? NAVY : "#5C5442", fontWeight: f.esTotal ? 700 : 400 }}>
                  {f.signo ? `${f.signo} ` : ""}{f.etiqueta}
                </span>
                <span style={{ fontSize: f.esTotal ? 15 : 13.5, fontWeight: f.esTotal ? 700 : 600, color: f.color || NAVY, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{f.valor}</span>
              </div>
            ))}
          </div>
        )}

        {filas.length > 0 && (
          <div style={{ margin: "18px 0 0", display: "grid", gap: 6 }}>
            {filas.map((f, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid #EDE4CE" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, color: NAVY, fontWeight: 600 }}>{f.etiqueta}</p>
                  {f.sub && <p style={{ margin: 0, fontSize: 11.5, color: "#8A7E5C" }}>{f.sub}</p>}
                </div>
                {f.valor != null && <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: f.color || NAVY, whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{f.valor}</p>}
              </div>
            ))}
          </div>
        )}

        {filas.length === 0 && formula.length === 0 && (
          <p style={{ margin: "18px 0 0", fontSize: 13.5, color: "#8A7E5C" }}>{vacio || "No hay nada que mostrar en este período."}</p>
        )}

        {total != null && filas.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1.5px solid ${NAVY}`, display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>Total</span>
            <span style={{ fontSize: 15, fontWeight: 700, color: NAVY, fontVariantNumeric: "tabular-nums" }}>{total}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function variacion(actual, anterior) {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

export function Finanzas({ boletasEmitidas: boletasEmitidasProp, boletasAdiestramiento: boletasAdiestramientoProp = [], clientes: clientesProp, pagosRegistrados: pagosRegistradosProp = [], registroPaseos = {}, reprogramaciones = [], costosNegocio = [], setCostosNegocio, citasAgenda = [], nombreUsuario, user, onVerPagos, onVerBoletas }) {
  // Arranca en el mes: con facturación mensual por adelantado, el mes es
  // la unidad real del negocio.
  const [periodo, setPeriodo] = useState("mes");
  // A cuántos meses (o años) de distancia del actual se está mirando.
  // 0 = el de ahora, -1 = el anterior. Reemplaza al rango personalizado
  // como forma de mirar un período pasado.
  const [offsetPeriodo, setOffsetPeriodo] = useState(0);
  function cambiarPeriodo(id) {
    setPeriodo(id);
    // Un -1 en meses no significa lo mismo en años: se vuelve al actual.
    setOffsetPeriodo(0);
  }
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const hoy = new Date();

  const [mostrarFormCosto, setMostrarFormCosto] = useState(false);
  const [descCosto, setDescCosto] = useState("");
  const [montoCosto, setMontoCosto] = useState("");
  const [fechaCosto, setFechaCosto] = useState(() => fechaKey(new Date()));
  const [categoriaCosto, setCategoriaCosto] = useState("insumos");
  const [detalle, setDetalle] = useState(null);

  function agregarCosto() {
    if (!descCosto.trim() || !Number(montoCosto)) return;
    setCostosNegocio((prev) => [...prev, { id: Date.now() + Math.random(), descripcion: descCosto.trim(), monto: Number(montoCosto), fecha: fechaCosto, creadoPor: nombreUsuario, categoria: categoriaCosto }]);
    setDescCosto(""); setMontoCosto(""); setFechaCosto(fechaKey(new Date())); setMostrarFormCosto(false);
  }
  function eliminarCosto(costo) {
    setCostosNegocio((prev) => prev.filter((c) => c.id !== costo.id));
  }

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

  // _periodo es el mes que la boleta CUBRE, no el día en que se emitió —
  // ver periodoDeBoleta. Todo lo que filtra por fechas en esta pestaña usa
  // _periodo, para que el informe de septiembre muestre el servicio de
  // septiembre aunque se haya cobrado el 31 de agosto.
  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo", _periodo: periodoDeBoleta(b) })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento", cantidad: 0, descuento: (b.descuentoPackMonto || 0), _periodo: periodoDeBoleta(b) })),
  ], [boletasEmitidas, boletasAdiestramiento]);
  // Solo lo aceptado/pagado cuenta como venta real — un borrador sin
  // revisar o una boleta cancelada no deben sumar en ningún ingreso.
  const todasLasBoletasVenta = useMemo(() => todasLasBoletas.filter(esVenta), [todasLasBoletas]);

  // "Personalizado" cubre lo que antes faltaba del todo: elegir un rango
  // de fechas propio en vez de estar limitado a semana/mes/año fijos. Sin
  // período anterior con el que comparar (no hay un "rango equivalente
  // anterior" bien definido), así que anteriorDesde/anteriorHasta quedan
  // en null y la tarjeta de variación se oculta para ese caso.
  // Se sacan como números sueltos porque `hoy` es un Date nuevo en cada
  // render y como dependencia rehace el useMemo siempre.
  const anioHoy = hoy.getFullYear();
  const mesHoy = hoy.getMonth();

  const { actualDesde, actualHasta, anteriorDesde, anteriorHasta, tituloPeriodo } = useMemo(() => {
    if (periodo === "personalizado") {
      const desde = rangoDesde ? new Date(`${rangoDesde}T00:00:00`) : new Date(0);
      const hasta = rangoHasta ? new Date(`${rangoHasta}T23:59:59`) : new Date();
      return { actualDesde: desde, actualHasta: hasta, anteriorDesde: null, anteriorHasta: null, tituloPeriodo: "el rango elegido" };
    }
    if (periodo === "semana") {
      const inicioActual = inicioSemana(new Date(anioHoy, mesHoy, new Date().getDate()));
      const inicioAnterior = new Date(inicioActual); inicioAnterior.setDate(inicioAnterior.getDate() - 7);
      return { actualDesde: inicioActual, actualHasta: null, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual, tituloPeriodo: "esta semana" };
    }
    if (periodo === "mes") {
      const inicioActual = new Date(anioHoy, mesHoy + offsetPeriodo, 1);
      // Ahora el mes se cierra: antes actualHasta era null ("hasta hoy"),
      // que servía mirando el mes en curso pero dejaba entrar los meses
      // siguientes al mirar uno pasado.
      const finActual = new Date(inicioActual.getFullYear(), inicioActual.getMonth() + 1, 0, 23, 59, 59, 999);
      const inicioAnterior = new Date(inicioActual.getFullYear(), inicioActual.getMonth() - 1, 1);
      return {
        actualDesde: inicioActual, actualHasta: finActual,
        anteriorDesde: inicioAnterior, anteriorHasta: inicioActual,
        tituloPeriodo: `ciclo de ${MESES[inicioActual.getMonth()]} ${inicioActual.getFullYear()}`,
      };
    }
    const anio = anioHoy + offsetPeriodo;
    const inicioActual = new Date(anio, 0, 1);
    return {
      actualDesde: inicioActual, actualHasta: new Date(anio, 11, 31, 23, 59, 59, 999),
      anteriorDesde: new Date(anio - 1, 0, 1), anteriorHasta: inicioActual,
      tituloPeriodo: String(anio),
    };
  }, [periodo, rangoDesde, rangoHasta, offsetPeriodo, anioHoy, mesHoy]);

  const enPeriodo = (b, desde, hasta) => {
    const f = b._periodo;
    return !!f && f >= desde && (!hasta || f <= hasta);
  };
  const filtradas = useMemo(() =>
    todasLasBoletasVenta.filter((b) => enPeriodo(b, actualDesde, actualHasta)),
    [todasLasBoletasVenta, actualDesde, actualHasta]);
  const anteriores = useMemo(() =>
    anteriorDesde ? todasLasBoletasVenta.filter((b) => !!b._periodo && b._periodo >= anteriorDesde && b._periodo < anteriorHasta) : [],
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
        // "2026-08-01" sin hora lo lee JavaScript como MEDIANOCHE UTC, que
        // en Chile es el 31 de julio a las 20:00 — el pago del trabajo de
        // agosto caia en julio y el informe de agosto mostraba $0 de pago
        // a paseadores. Con la hora pegada se lee en hora local, igual que
        // ya hacia costosNegocio mas abajo.
        const f = new Date(fISO.length <= 10 ? `${fISO}T00:00:00` : fISO);
        return f >= actualDesde && (!actualHasta || f <= actualHasta);
      })
      .reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosRegistrados, actualDesde, actualHasta]);
  // Plata pagada a responsables de cuenta en boletas de adiestramiento —
  // costo real para Howria, igual que el pago a paseadores, así que
  // también se resta de la utilidad general. Solo boletas YA marcadas
  // pagadoAResponsable (ver Pago Trabajadores) — antes se restaba el
  // costo de cualquier boleta vendida del período, incluso pendiente de
  // cobro y sin pagarle nada todavía al responsable, mismo criterio de
  // "costo real" que ya usa costosPeriodo (pago a paseadores) más arriba.
  const costoResponsablesAdiestramiento = useMemo(() =>
    filtradas.filter((b) => b._tipo === "adiestramiento" && b.pagadoAResponsable).reduce((acc, b) => acc + montoParaResponsable(b), 0),
    [filtradas]);
  // "Tu parte" — lo que efectivamente le corresponde al responsable
  // después del reparto con Howria en adiestramiento (los paseos no
  // tienen reparto, van completos). Solo tiene sentido en la vista
  // personal de un responsable de cuenta.
  const tuParte = useMemo(() => filtradas.reduce((acc, b) => acc + montoParaResponsable(b), 0), [filtradas]);
  // Costos generales del negocio (arriendo, insumos, marketing, etc.) —
  // database/102_costos_negocio.sql. Antes "Ganancia" solo restaba pago a
  // trabajadores, así que no era la utilidad real.
  const costosGeneralesFiltrados = useMemo(() =>
    costosNegocio.filter((c) => { const f = new Date(c.fecha + "T00:00:00"); return f >= actualDesde && (!actualHasta || f <= actualHasta); }),
    [costosNegocio, actualDesde, actualHasta]);
  const costosGeneralesPeriodo = costosGeneralesFiltrados.reduce((acc, c) => acc + Number(c.monto || 0), 0);
  const promedioBoleta = actual.cantidad ? actual.ingresos / actual.cantidad : 0;
  const varIngresos = variacion(actual.ingresos, anterior.ingresos);

  // ---- La caja del período ----
  //
  // El número grande de la pestaña pasa a ser CAJA: plata que se movió de
  // verdad. Antes "Ingresos" contaba también las boletas aceptadas sin
  // pagar y "Ganancia" restaba solo los pagos ya hechos, así que a
  // principio de mes la ganancia salía inflada y caía de golpe al
  // registrar los pagos. Lo emitido sin cobrar y el trabajo sin pagar
  // ahora van aparte, en "En camino", en vez de mezclarse.
  //
  // Ojo con la diferencia con `filtradas`: eso son solo las boletas que
  // cuentan como venta (esVenta). Acá hacen falta TODAS las del período,
  // porque los borradores son justamente lo que no se veía en ningún lado.
  const delPeriodo = useMemo(() =>
    todasLasBoletas.filter((b) => enPeriodo(b, actualDesde, actualHasta)),
    [todasLasBoletas, actualDesde, actualHasta]);
  const sumaTotales = (lista) => lista.reduce((acc, b) => acc + Number(b.total || 0), 0);

  const cobradasPeriodo = useMemo(() => delPeriodo.filter((b) => b.estado === "pagada"), [delPeriodo]);
  const porCobrarPeriodo = useMemo(() => delPeriodo.filter((b) => b.estado === "pendiente_pago"), [delPeriodo]);
  const borradoresPeriodo = useMemo(() => delPeriodo.filter((b) => b.estado === "no_enviada"), [delPeriodo]);
  // El aviso de arriba mira TODOS los borradores, no solo los del período
  // elegido. Una boleta sin emitir del mes pasado es más urgente, no
  // menos, y con el aviso limitado al período desaparecía justo al mirar
  // el mes recién empezado: el 1 de septiembre el informe mensual no
  // mostraba los 26 borradores de agosto por $2.760.578.
  const borradoresTodos = useMemo(() => todasLasBoletas.filter((b) => b.estado === "no_enviada"), [todasLasBoletas]);

  const entro = sumaTotales(cobradasPeriodo);
  const salio = costosPeriodo + costoResponsablesAdiestramiento + costosGeneralesPeriodo;
  const queda = entro - salio;
  const porEmitir = sumaTotales(borradoresPeriodo);
  const porCobrar = sumaTotales(porCobrarPeriodo);
  // La variación se compara contra lo cobrado del período anterior, no
  // contra lo facturado: si no, el porcentaje compararía dos cosas
  // distintas entre sí.
  const varEntro = variacion(entro, sumaTotales(anteriores.filter((b) => b.estado === "pagada")));

  // ---- Rentabilidad ----
  //
  // El margen bruto necesita separar el costo DIRECTO (el que sube cuando
  // atiendes más perros) del FIJO (el que se paga igual aunque no salga
  // ningún paseo). El sueldo de terreno es el directo más grande y no
  // vive en costos_negocio sino en pagos_trabajadores, por eso se suma
  // aparte. Ver CATEGORIAS_COSTO.
  const costosDirectosSueltos = useMemo(() =>
    costosGeneralesFiltrados.filter((c) => grupoDeCategoria(c.categoria) === "directo").reduce((acc, c) => acc + Number(c.monto || 0), 0),
    [costosGeneralesFiltrados]);
  const costosFijos = useMemo(() =>
    costosGeneralesFiltrados.filter((c) => grupoDeCategoria(c.categoria) !== "directo").reduce((acc, c) => acc + Number(c.monto || 0), 0),
    [costosGeneralesFiltrados]);
  const costoDirecto = costosPeriodo + costoResponsablesAdiestramiento + costosDirectosSueltos;
  // Sobre lo COBRADO, igual que todo el resto de la caja: un margen
  // calculado sobre boletas que nadie pagó todavía no es un margen.
  const margenBruto = entro > 0 ? (entro - costoDirecto) / entro : null;

  // ---- Recurrente vs puntual ----
  //
  // Los paseos son suscripción (se repiten solos mes a mes); una
  // evaluación o un pack se venden una vez. Saber cuánto de tu mes es
  // recurrente dice cuánto puedes contar el mes que viene sin vender nada
  // nuevo.
  const ingresoRecurrente = useMemo(() => cobradasPeriodo.filter((b) => b._tipo === "paseo").reduce((acc, b) => acc + Number(b.total || 0), 0), [cobradasPeriodo]);
  const ingresoPuntual = entro - ingresoRecurrente;

  // ---- Clientes: entran, se van, cuánto cuesta traerlos ----
  const enRango = (iso) => {
    if (!iso) return false;
    const f = new Date(iso);
    return f >= actualDesde && (!actualHasta || f <= actualHasta);
  };
  const clientesNuevos = useMemo(() => clientes.filter((c) => enRango(c.creadoEn)), [clientes, actualDesde, actualHasta]);
  const clientesDeBaja = useMemo(() => clientes.filter((c) => enRango(c.bajaEn)), [clientes, actualDesde, actualHasta]);
  const activosHoy = useMemo(() => clientes.filter((c) => (c.estadoCliente || "activo") === "activo").length, [clientes]);
  // Sobre la base con la que se empezó el período (los que siguen activos
  // más los que se fueron), no sobre la de hoy: si no, un mes con muchas
  // bajas dividiría por una base ya achicada y el porcentaje saldría bajo.
  const churn = activosHoy + clientesDeBaja.length > 0
    ? (clientesDeBaja.length / (activosHoy + clientesDeBaja.length)) * 100
    : 0;
  const gastoMarketing = useMemo(() =>
    costosGeneralesFiltrados.filter((c) => c.categoria === "marketing").reduce((acc, c) => acc + Number(c.monto || 0), 0),
    [costosGeneralesFiltrados]);
  const cac = clientesNuevos.length > 0 ? gastoMarketing / clientesNuevos.length : null;

  // ---- Ocupación de los turnos ----
  //
  // Un turno es una persona, un día de la semana y una hora: el grupo que
  // sale a pasear junto. El límite son MAX_PERROS_POR_TURNO perros.
  //
  // No depende del período elegido arriba: es la foto de cómo está armada
  // la operación hoy, no de lo que se facturó en un mes.
  //
  // El número que importa no es "cuántos perros más caben en total" —eso
  // supondría que se pueden abrir turnos infinitos y no es cierto, cada
  // turno es tiempo de una persona— sino cuánto espacio queda en los
  // grupos QUE YA SALEN. Meter un perro ahí no cuesta un paseo más.
  const ocupacion = useMemo(() => {
    if (vistaPersonal) return null;
    const activos = clientes.filter((c) =>
      (c.tipoServicio || []).includes("paseos") &&
      (c.estadoCliente || "activo") === "activo" &&
      c.paseadorNombre && c.horaHabitual && (c.diasHabituales || []).length);
    const mapa = {};
    activos.forEach((c) => (c.diasHabituales || []).forEach((d) => {
      const clave = `${c.paseadorNombre}|${d}|${c.horaHabitual}`;
      mapa[clave] = mapa[clave] || { paseador: c.paseadorNombre, dia: d, hora: c.horaHabitual, perros: 0, clientes: [] };
      mapa[clave].perros += contarPerros(c.perro);
      mapa[clave].clientes.push(`${c.nombre} (${c.perro})`);
    }));
    const turnos = Object.values(mapa).sort((a, b) => b.perros - a.perros || a.dia - b.dia);
    const perros = turnos.reduce((acc, t) => acc + t.perros, 0);
    // Los que no tienen horario no se pueden ubicar en ningún turno, y
    // callarlo haría parecer que la foto está completa cuando no lo está.
    const sinHorario = clientes.filter((c) =>
      (c.tipoServicio || []).includes("paseos") &&
      (c.estadoCliente || "activo") === "activo" &&
      (!c.horaHabitual || !(c.diasHabituales || []).length));
    return {
      turnos,
      // Cupos ocupados en la semana, no perros distintos: un perro que
      // sale 3 días ocupa 3. Decir "156 perros" hacía parecer que Howria
      // tiene el triple de los que tiene.
      cuposOcupados: perros,
      cuposTotales: turnos.length * MAX_PERROS_POR_TURNO,
      sinHorario,
      sobreLimite: turnos.filter((t) => t.perros > MAX_PERROS_POR_TURNO),
      espacioLibre: turnos.reduce((acc, t) => acc + Math.max(0, MAX_PERROS_POR_TURNO - t.perros), 0),
      ocupacionMedia: turnos.length ? perros / (turnos.length * MAX_PERROS_POR_TURNO) : 0,
    };
  }, [vistaPersonal, clientes]);

  // ---- Cuánto deja cada persona de terreno ----
  //
  // Lo que cobraron sus clientes en el período contra lo que se le pagó.
  //
  // Mira las dos puntas del negocio, no solo paseos: una boleta de paseo
  // se le atribuye al paseador del cliente y una de adiestramiento a su
  // adiestrador. Con solo paseos la tabla mentía feo — en agosto 2026
  // $1.155.000 de $1.231.200 fueron adiestramiento y no aparecían.
  //
  // Es aproximado y hay que decirlo: se atribuye por quien atiende al
  // cliente HOY, así que una reasignación reciente mueve el histórico.
  const margenPorTrabajador = useMemo(() => {
    if (vistaPersonal) return [];
    const nombres = [...new Set([
      ...clientes.map((c) => c.paseadorNombre),
      ...clientes.map((c) => c.adiestradorNombre),
    ].filter(Boolean))];
    const filas = nombres.map((nombre) => {
      const suyos = clientes.filter((c) => c.paseadorNombre === nombre || c.adiestradorNombre === nombre);
      const genero = cobradasPeriodo
        .filter((b) => {
          // Cada boleta cuenta para quien hace ESE servicio: si un cliente
          // tiene paseador y adiestrador distintos, su boleta de paseo no
          // es del adiestrador ni al revés.
          const campo = b._tipo === "adiestramiento" ? "adiestradorNombre" : "paseadorNombre";
          return clientes.some((c) => c[campo] === nombre && esBoletaDeCliente(b, c));
        })
        .reduce((acc, b) => acc + Number(b.total || 0), 0);
      const pagado = pagosRegistrados
        .filter((p) => !p.deshechoEn && p.paseador === nombre)
        .filter((p) => {
          const fISO = p.periodoDesdeISO || p.fechaPagoISO;
          if (!fISO) return false;
          const f = new Date(fISO.length <= 10 ? `${fISO}T00:00:00` : fISO);
          return f >= actualDesde && (!actualHasta || f <= actualHasta);
        })
        .reduce((acc, p) => acc + Number(p.monto || 0), 0);
      return { nombre, genero, pagado, margen: genero - pagado, clientes: suyos.length };
    }).filter((f) => f.genero > 0 || f.pagado > 0).sort((a, b) => b.margen - a.margen);
    const atribuido = filas.reduce((acc, f) => acc + f.genero, 0);
    // Boletas de clientes sin paseador ni adiestrador asignado. Sin esta
    // fila la tabla no cuadraba con lo cobrado y esa plata desaparecía
    // sin que nada lo dijera.
    const sinAsignar = entro - atribuido;
    return sinAsignar > 0
      ? [...filas, { nombre: "Sin asignar", genero: sinAsignar, pagado: 0, margen: sinAsignar, clientes: 0, esSinAsignar: true }]
      : filas;
  }, [vistaPersonal, clientes, cobradasPeriodo, pagosRegistrados, actualDesde, actualHasta, entro]);

  // Trabajo del período que todavía no se le pagó a nadie: lo que suman
  // los paseos hechos menos lo ya registrado como pagado. Es una
  // aproximación de paseos (el adiestramiento se acuerda caso a caso y
  // vive en Pago adiestramiento), y por eso nunca baja de cero.
  // Devuelve el total Y el desglose por persona: el total solo dice
  // cuánto, y para actuar hace falta saber a quién.
  const deudaTrabajadores = useMemo(() => {
    if (vistaPersonal) return { total: 0, filas: [] };
    const hoyLocal = new Date();
    const fin = actualHasta && actualHasta < hoyLocal ? actualHasta : hoyLocal;
    const paseadores = [...new Set(clientesProp.map((c) => c.paseadorNombre).filter(Boolean))];
    const filas = paseadores.map((p) => {
      const trabajado = resumenPaseadorEnRango({
        clientes: clientesProp, registroPaseos, reprogramaciones, paseador: p, desde: actualDesde, hasta: fin,
      }).totales;
      const pagado = pagosRegistrados
        .filter((x) => !x.deshechoEn && x.paseador === p)
        .filter((x) => {
          const fISO = x.periodoDesdeISO || x.fechaPagoISO;
          if (!fISO) return false;
          const f = new Date(fISO.length <= 10 ? `${fISO}T00:00:00` : fISO);
          return f >= actualDesde && (!actualHasta || f <= actualHasta);
        })
        .reduce((acc, x) => acc + Number(x.monto || 0), 0);
      return { nombre: p, trabajado: trabajado.monto, paseos: trabajado.realizados, pagado, debe: Math.max(trabajado.monto - pagado, 0) };
    }).filter((f) => f.debe > 0).sort((a, b) => b.debe - a.debe);
    return { total: filas.reduce((acc, f) => acc + f.debe, 0), filas };
  }, [vistaPersonal, clientesProp, registroPaseos, reprogramaciones, actualDesde, actualHasta, pagosRegistrados]);
  const porPagarTrabajadores = deudaTrabajadores.total;

  // ---- El respaldo de cada cifra ----
  //
  // Se arman al hacer click y no de entrada: son listas que casi siempre
  // nadie mira, y calcularlas todas en cada render sería pagar por algo
  // que no se usa.
  const fechaCorta = (iso) => new Date(iso).toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  const filaDeBoleta = (b) => {
    const emitida = b.fechaISO ? fechaCorta(b.fechaISO) : "sin fecha";
    // El mes que alguien eligió al crearla ya no decide el ciclo, pero si
    // no calza conviene verlo: suele ser una boleta mal etiquetada.
    const mesEscrito = b.mes && b._periodo && MESES[b._periodo.getMonth()] !== String(b.mes).toLowerCase()
      ? ` · dice cubrir ${b.mes}`
      : "";
    return {
      etiqueta: b.cliente || b.clienteNombre || "(sin cliente)",
      sub: `${b._tipo === "adiestramiento" ? "Adiestramiento" : "Paseos"} · emitida ${emitida}${mesEscrito}`,
      valor: fmtCLP(b.total),
    };
  };

  // Hacer una tarjeta clicable sin convertirla en <button>: conserva el
  // estilo que ya tenía y sigue funcionando con teclado.
  const abre = (armar) => ({
    role: "button",
    tabIndex: 0,
    title: "Ver de dónde sale este número",
    onClick: () => setDetalle(armar()),
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetalle(armar()); } },
  });

  const detalleEntro = () => ({
    titulo: `Entró ${etiquetaPeriodo}`,
    subtitulo: "Boletas que el cliente ya pagó, agrupadas por el mes que cubren — el que se elige al emitirlas, no el día en que se emitieron.",
    filas: cobradasPeriodo.map(filaDeBoleta),
    total: fmtCLP(entro),
    vacio: "Ninguna boleta de este período está marcada como pagada todavía.",
  });

  const detalleSalio = () => {
    const pagos = pagosRegistrados
      .filter((p) => !p.deshechoEn)
      .filter((p) => {
        const fISO = p.periodoDesdeISO || p.fechaPagoISO;
        if (!fISO) return false;
        const f = new Date(fISO.length <= 10 ? `${fISO}T00:00:00` : fISO);
        return f >= actualDesde && (!actualHasta || f <= actualHasta);
      })
      .map((p) => ({ etiqueta: p.paseador, sub: `Pago de trabajador · ${p.etiqueta || p.periodo || ""}`, valor: fmtCLP(p.monto) }));
    const responsables = filtradas
      .filter((b) => b._tipo === "adiestramiento" && b.pagadoAResponsable)
      .map((b) => ({ etiqueta: b.cliente || b.clienteNombre, sub: "Parte del responsable en adiestramiento", valor: fmtCLP(montoParaResponsable(b)) }));
    const otros = costosGeneralesFiltrados.map((c) => ({
      etiqueta: c.descripcion,
      sub: `${CATEGORIAS_COSTO.find((x) => x.id === c.categoria)?.nombre || "Otros"} · ${grupoDeCategoria(c.categoria) === "directo" ? "costo directo" : "gasto fijo"}`,
      valor: fmtCLP(c.monto),
    }));
    return {
      titulo: `Salió ${etiquetaPeriodo}`,
      subtitulo: "Solo pagos ya registrados en la app. Lo que todavía se debe está en «Debes a trabajadores».",
      filas: [...pagos, ...responsables, ...otros],
      total: fmtCLP(salio),
      vacio: "Todavía no hay ningún pago ni costo registrado en este período.",
    };
  };

  const detalleQueda = () => ({
    titulo: "Queda para Howria",
    subtitulo: `La cuenta completa de ${tituloPeriodo}.`,
    formula: [
      { etiqueta: `Entró (${cobradasPeriodo.length} boleta(s) pagada(s))`, valor: fmtCLP(entro) },
      { signo: "−", etiqueta: "Sueldos de terreno ya pagados", valor: fmtCLP(costosPeriodo), color: RUST },
      { signo: "−", etiqueta: "Parte de responsables en adiestramiento", valor: fmtCLP(costoResponsablesAdiestramiento), color: RUST },
      { signo: "−", etiqueta: "Otros costos del negocio", valor: fmtCLP(costosGeneralesPeriodo), color: RUST },
      { etiqueta: "Queda para Howria", valor: fmtCLP(queda), esTotal: true, color: queda >= 0 ? "#2F6A46" : RUST },
    ],
  });

  const detalleLista = (titulo, subtitulo, lista, totalNum, vacio) => () => ({
    titulo, subtitulo, filas: lista.map(filaDeBoleta), total: fmtCLP(totalNum), vacio,
  });

  const detalleDeuda = () => ({
    titulo: "Debes a trabajadores",
    subtitulo: "Paseos hechos en el período que todavía no registras como pagados. Es una estimación de paseos: el adiestramiento se acuerda caso a caso.",
    filas: deudaTrabajadores.filas.map((f) => ({
      etiqueta: f.nombre,
      sub: `${f.paseos} paseo(s) hechos por ${fmtCLP(f.trabajado)} · ya pagado ${fmtCLP(f.pagado)}`,
      valor: fmtCLP(f.debe),
      color: RUST,
    })),
    total: fmtCLP(porPagarTrabajadores),
    vacio: "No hay paseos pendientes de pago en este período.",
  });

  const detalleMargen = () => ({
    titulo: "Margen bruto",
    subtitulo: "Qué parte de lo cobrado sobrevive al costo de operar. No incluye los gastos fijos: esos van después, en «Queda para Howria».",
    formula: [
      { etiqueta: "Cobrado", valor: fmtCLP(entro) },
      { signo: "−", etiqueta: "Sueldos de terreno", valor: fmtCLP(costosPeriodo + costoResponsablesAdiestramiento), color: RUST },
      { signo: "−", etiqueta: "Insumos y transporte", valor: fmtCLP(costosDirectosSueltos), color: RUST },
      { etiqueta: "Margen bruto", valor: margenBruto == null ? "—" : `${fmtCLP(entro - costoDirecto)} (${Math.round(margenBruto * 100)}%)`, esTotal: true, color: "#2F6A46" },
    ],
  });

  const detalleCostos = (grupo) => () => {
    const items = costosGeneralesFiltrados.filter((c) => (grupoDeCategoria(c.categoria) === "directo") === (grupo === "directo"));
    const sueldos = grupo === "directo"
      ? [{ etiqueta: "Sueldos de terreno", sub: "Pagos ya registrados a paseadores y responsables", valor: fmtCLP(costosPeriodo + costoResponsablesAdiestramiento) }]
      : [];
    return {
      titulo: grupo === "directo" ? "Costo directo" : "Gastos fijos",
      subtitulo: grupo === "directo"
        ? "Lo que sube cuando atiendes más perros."
        : "Lo que se paga igual aunque no salga ningún paseo.",
      filas: [...sueldos, ...items.map((c) => ({
        etiqueta: c.descripcion,
        sub: `${CATEGORIAS_COSTO.find((x) => x.id === c.categoria)?.nombre || "Otros"} · ${new Date(c.fecha + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}`,
        valor: fmtCLP(c.monto),
      }))],
      total: fmtCLP(grupo === "directo" ? costoDirecto : costosFijos),
      vacio: grupo === "directo"
        ? "Sin sueldos ni insumos cargados en este período."
        : "No has cargado ningún gasto fijo. Míralo al revés: hasta que cargues arriendo, seguro o software, «Queda para Howria» son ingresos menos sueldos, no tu utilidad real.",
    };
  };

  const detalleOcupacion = () => ({
    titulo: "Ocupación de los turnos",
    subtitulo: `Un turno es una persona, un día y una hora: el grupo que sale junto. El máximo son ${MAX_PERROS_POR_TURNO} perros. Ordenados del más lleno al más vacío.`,
    filas: (ocupacion?.turnos || []).map((t) => ({
      etiqueta: `${t.paseador} · ${DIAS_SEMANA_LARGO[t.dia]} ${t.hora}`,
      sub: t.clientes.join(" · "),
      valor: `${t.perros}/${MAX_PERROS_POR_TURNO}`,
      color: t.perros > MAX_PERROS_POR_TURNO ? RUST : t.perros === MAX_PERROS_POR_TURNO ? "#2F6A46" : "#8A7E5C",
    })),
    vacio: "Ningún cliente de paseos tiene días y hora habitual definidos.",
  });

  const detalleClientes = () => ({
    titulo: `Clientes ${etiquetaPeriodo}`,
    subtitulo: "Quiénes entraron y quiénes se fueron en el período.",
    filas: [
      ...clientesNuevos.map((c) => ({ etiqueta: c.nombre, sub: `Entró el ${fechaCorta(c.creadoEn)}${c.perro ? ` · 🐾 ${c.perro}` : ""}`, valor: "nuevo", color: "#2F6A46" })),
      ...clientesDeBaja.map((c) => ({ etiqueta: c.nombre, sub: `Se fue el ${fechaCorta(c.bajaEn)}${c.perro ? ` · 🐾 ${c.perro}` : ""}`, valor: "baja", color: RUST })),
    ],
    vacio: "Nadie entró ni se fue en este período.",
  });

  const detalleCac = () => ({
    titulo: "Costo por cliente nuevo",
    subtitulo: "Cuánto costó en marketing traer a cada cliente que entró.",
    formula: [
      { etiqueta: "Gasto en marketing del período", valor: fmtCLP(gastoMarketing) },
      { signo: "÷", etiqueta: `Clientes que entraron`, valor: String(clientesNuevos.length) },
      { etiqueta: "Costo por cliente nuevo", valor: cac == null ? "—" : fmtCLP(cac), esTotal: true },
    ],
  });

  // Qué es cada cliente, para distinguirlo en las listas. Una boleta de
  // adiestramiento se etiqueta por la boleta misma y no por la ficha: un
  // cliente puede tener clases Y paseos, y lo que importa es de qué es la
  // plata que se está mostrando.
  const etiquetaDeCliente = (nombre, tipoBoleta) => {
    if (tipoBoleta === "adiestramiento") return "Adiestramiento";
    const c = clientes.find((x) => String(x.nombre).trim() === String(nombre).trim());
    const tipos = c?.tipoServicio || [];
    if (tipos.includes("paseos")) return "Paseos";
    if (tipos.includes("clases")) return "Clases";
    if (tipos.includes("evaluacion")) return "Evaluación";
    return null;
  };

  const porCliente = useMemo(() => {
    const mapa = {};
    filtradas.forEach((b) => {
      mapa[b.cliente] = mapa[b.cliente] || { total: 0, tipos: new Set() };
      mapa[b.cliente].total += b.total;
      mapa[b.cliente].tipos.add(b._tipo);
    });
    return Object.entries(mapa)
      .map(([nombre, v]) => ({ nombre, total: v.total, etiqueta: [...v.tipos].map((t) => etiquetaDeCliente(nombre, t)).filter(Boolean).join(" + ") }))
      .sort((a, b) => b.total - a.total);
  }, [filtradas, clientes]);

  // Siempre por MES, nunca por día. Una boleta de paseos cubre el mes
  // entero, así que su período es el día 1: agrupar por día dejaba todo
  // el mes apilado en una sola barra. Por mes sí dice algo — se ve la
  // tendencia, que es para lo que sirve un gráfico acá.
  //
  // En la vista de año son los 12 meses; en la de mes, los últimos 6
  // terminando en el que se está mirando, para tener con qué comparar.
  const dataGrafico = useMemo(() => {
    const totalDelMes = (anio, mes) => todasLasBoletasVenta
      .filter((b) => b._periodo && b._periodo.getMonth() === mes && b._periodo.getFullYear() === anio)
      .reduce((acc, b) => acc + b.total, 0);

    if (periodo === "año") {
      return MESES.map((m, i) => ({ etiqueta: m.slice(0, 3), total: totalDelMes(actualDesde.getFullYear(), i) }));
    }
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(actualDesde.getFullYear(), actualDesde.getMonth() - 5 + i, 1);
      return { etiqueta: MESES[d.getMonth()].slice(0, 3), total: totalDelMes(d.getFullYear(), d.getMonth()) };
    });
  }, [periodo, todasLasBoletasVenta, actualDesde]);

  // Quién falta por cobrar en este ciclo.
  //
  // Antes listaba a TODO cliente sin boleta del mes, y eso acusaba a quien
  // no correspondía: los alumnos de adiestramiento no se cobran todos los
  // meses (se cobra el pack o la evaluación cuando ocurre), así que
  // aparecían como pendientes para siempre. Con 52 clientes la lista era
  // casi entera y no servía para decidir nada.
  //
  // Ahora se pregunta lo que de verdad importa en cada negocio:
  //   Paseos       — ¿tiene paseos programados este ciclo y no le emitiste?
  //   Adiestramiento — ¿hizo una evaluación o clase este ciclo y no la cobraste?
  const faltanPorCobrar = useMemo(() => {
    const mes = actualDesde.getMonth(), anio = actualDesde.getFullYear();
    const tieneBoletaDelCiclo = (c) => todasLasBoletas.some((b) =>
      esBoletaDeCliente(b, c) && b._periodo && b._periodo.getMonth() === mes && b._periodo.getFullYear() === anio);

    const activos = clientes.filter((c) => (c.estadoCliente || "activo") === "activo");

    const paseos = activos
      .filter((c) => (c.tipoServicio || []).includes("paseos"))
      // Sin paseos programados en el ciclo no hay nada que cobrarle: es el
      // caso del cliente que entró a mitad de mes o que no tiene días.
      .filter((c) => diasDelMesProgramados(c, mes, anio, reprogramaciones).length > 0)
      .filter((c) => !tieneBoletaDelCiclo(c));

    // Una cita realizada en el ciclo es lo que genera el cobro de
    // adiestramiento. Sin cita, no hay nada pendiente.
    const hizoAlgoEsteCiclo = (c) => citasAgenda.some((cita) =>
      cita.estado === "realizada" && cita.clienteId === c._dbId &&
      cita.fechaISO && new Date(cita.fechaISO).getMonth() === mes && new Date(cita.fechaISO).getFullYear() === anio);

    const adiestramiento = activos
      .filter((c) => (c.tipoServicio || []).some((t) => t === "clases" || t === "evaluacion"))
      .filter(hizoAlgoEsteCiclo)
      .filter((c) => !tieneBoletaDelCiclo(c));

    return { paseos, adiestramiento };
  }, [clientes, todasLasBoletas, actualDesde, reprogramaciones, citasAgenda]);

  const porTipoServicio = useMemo(() => {
    return TIPOS_SERVICIO.map((t) => {
      const monto = filtradas.filter((b) => clientes.find((c) => c.nombre === b.cliente)?.tipoServicio?.includes(t.id)).reduce((acc, b) => acc + b.total, 0);
      return { tipo: t.nombre, monto };
    });
  }, [filtradas, clientes]);

  // Sigue el mes que se está mirando, no el del calendario: parado en
  // agosto, proyectar septiembre no dice nada de agosto.
  const mesActualIdx = actualDesde.getMonth(), anioActualN = actualDesde.getFullYear();
  const proyeccionMes = useMemo(() => {
    return clientes.filter((c) => (c.estadoCliente || "activo") === "activo")
      .reduce((acc, c) => acc + diasSegunPlan(mesActualIdx, anioActualN, c.diasHabituales || []).length * Number(c.valorPaseoRef || 0), 0);
  }, [clientes, mesActualIdx, anioActualN]);
  const facturadoEsteMes = todasLasBoletasVenta.filter((b) => b._periodo && b._periodo.getMonth() === mesActualIdx && b._periodo.getFullYear() === anioActualN).reduce((acc, b) => acc + b.total, 0);
  const porcentajeFacturado = proyeccionMes ? Math.round((facturadoEsteMes / proyeccionMes) * 100) : 0;

  const etiquetaPeriodo = periodo === "semana" || periodo === "personalizado"
    ? { semana: "esta semana", personalizado: "en el rango elegido" }[periodo]
    : `en ${periodo === "mes" ? "el " : ""}${tituloPeriodo}`;
  const etiquetaAnterior = { semana: "semana anterior", mes: "ciclo anterior", año: "año anterior" }[periodo];

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
    const hoyLocal = new Date();
    hoyLocal.setHours(0, 0, 0, 0);

    // Para semana/mes/año el rango siempre corre hasta hoy — para un
    // rango personalizado en el pasado, hay que parar en actualHasta y no
    // seguir contando días después de esa fecha.
    const finPaseador = actualHasta && actualHasta < hoyLocal ? actualHasta : hoyLocal;

    // El cálculo vive en lib/pagos.js, no acá: es plata, ya tuvo un bug
    // real (mostraba de más cuando un paseo del cliente propio lo hacía
    // otra persona y se repartía con este paseador), y esta pantalla solo
    // la ve un paseador — o sea que desde una sesión de administrador no
    // hay forma de mirarla. Estando en un archivo aparte se puede probar
    // sin sesión: ver "resumenPaseadorEnRango" en lib/pagos.test.js.
    const { filas: resumenPaseador, compartidos: misPaseosCompartidos, totales: totalesPaseador } = resumenPaseadorEnRango({
      clientes: clientesProp,
      registroPaseos,
      reprogramaciones,
      paseador: user.nombre,
      desde: actualDesde,
      hasta: finPaseador,
    });
    const totalRealizadosPaseador = totalesPaseador.realizados;
    const totalProgramadosPaseador = totalesPaseador.programados;
    const totalMontoPaseador = totalesPaseador.monto;

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

        {misPaseosCompartidos.length > 0 && (
          <>
            <p style={{ ...label, marginTop: 18 }}>Paseos que compartiste</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {misPaseosCompartidos.map((x, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #EDE4CE", background: "#FFFFFF", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: x.cliente.fotoUrl ? `url(${x.cliente.fotoUrl}) center/cover` : CREAM_SOFT }} />
                    <p style={{ margin: 0, fontWeight: 600, color: NAVY, fontSize: 12.5, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.cliente.nombre}</p>
                  </div>
                  <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>{new Date(x.fecha + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</p>
                  <div style={{ display: "inline-block", background: GOLD, borderRadius: 6, padding: "5px 9px" }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(x.monto)}</p>
                  </div>
                </div>
              ))}
            </div>
            <p style={hint}>Ayudaste en estos — no son tus clientes, pero un coordinador repartió el pago contigo ese día.</p>
          </>
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
        {[["mes", "Por mes"], ["año", "Por año"]].map(([id, nombre]) => (
          <button key={id} onClick={() => cambiarPeriodo(id)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
              fontWeight: periodo === id ? 600 : 400 }}>
            {nombre}
          </button>
        ))}
      </div>
      {/* Reemplaza al rango personalizado: con facturación mensual el mes
          es la unidad, y moverse entre meses es todo lo que hace falta
          para mirar atrás. Hacia adelante también se puede — los cobros
          del mes que viene se emiten desde el 28. */}
      <div className="no-imprimir" style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 22px" }}>
        <button onClick={() => setOffsetPeriodo((n) => n - 1)} aria-label={periodo === "mes" ? "Mes anterior" : "Año anterior"}
          style={{ ...botonSecundario, width: "auto", margin: 0, padding: "6px 14px", flex: "none" }}>←</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: NAVY, minWidth: 190, textAlign: "center" }}>{tituloPeriodo.charAt(0).toUpperCase() + tituloPeriodo.slice(1)}</span>
        <button onClick={() => setOffsetPeriodo((n) => n + 1)} aria-label={periodo === "mes" ? "Mes siguiente" : "Año siguiente"}
          style={{ ...botonSecundario, width: "auto", margin: 0, padding: "6px 14px", flex: "none" }}>→</button>
        {offsetPeriodo !== 0 && (
          <button onClick={() => setOffsetPeriodo(0)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0 }}>
            Volver a {periodo === "mes" ? "este mes" : "este año"}
          </button>
        )}
      </div>
      {/* La caja del período: entró, salió, queda. Es lo que Javier pidió
          poder mirar de un vistazo, y el número que manda es el de CAJA —
          plata cobrada de verdad, no boletas emitidas. Lo que está en
          camino va abajo, separado, para que no se mezcle con lo que ya
          existe. */}
      {!vistaPersonal && (
        <>
          {/* Lo más accionable de la pestaña: plata ya trabajada que todavía
          no se le cobró a nadie. No suma en ningún total de abajo a
          propósito — un borrador se puede seguir editando, así que darlo
          por ingreso sería contar algo que aún puede cambiar. */}
      {!vistaPersonal && borradoresTodos.length > 0 && (
        <div className="no-imprimir" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", background: "#F3E3B4", border: "1px solid #E0CB84", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "#6B5312" }}>
              Tienes {borradoresTodos.length} boleta(s) sin enviar por {fmtCLP(sumaTotales(borradoresTodos))} en total
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A6A1E" }}>
              Es trabajo hecho que todavía no le cobraste a nadie. No suma en los totales de abajo hasta que las emitas.
            </p>
          </div>
          {onVerBoletas && (
            <button onClick={onVerBoletas} style={{ ...botonSecundario, width: "auto", flex: "none", margin: 0, padding: "8px 16px", borderColor: "#8A6A1E", color: "#6B5312" }}>
              Ir a Boletas →
            </button>
          )}
        </div>
      )}

      <div className="howria-finanzas-caja" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 12 }}>
            <div {...abre(detalleEntro)} style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18, cursor: "pointer" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Entró {etiquetaPeriodo}</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(entro)}</p>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#9BAAB8" }}>{cobradasPeriodo.length} boleta(s) pagada(s)</p>
              {periodo !== "personalizado" && (
                <p style={{ margin: "2px 0 0", fontSize: 11.5, color: varEntro >= 0 ? "#9FD8A8" : "#E3A08C" }}>
                  {varEntro >= 0 ? "▲" : "▼"} {Math.abs(varEntro).toFixed(0)}% vs {etiquetaAnterior}
                </p>
              )}
            </div>
            <div {...abre(detalleSalio)} style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, cursor: "pointer" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Salió {etiquetaPeriodo}</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(salio)}</p>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                Paseadores {fmtCLP(costosPeriodo)} · Responsables {fmtCLP(costoResponsablesAdiestramiento)} · Otros {fmtCLP(costosGeneralesPeriodo)}
              </p>
              {onVerPagos && (
                <button onClick={onVerPagos} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0, marginTop: 6 }}>
                  Ver en Pago trabajadores →
                </button>
              )}
            </div>
            <div {...abre(detalleQueda)} style={{ background: queda >= 0 ? "#D8ECDE" : "#F1DCD2", borderRadius: 10, padding: 18, cursor: "pointer" }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: queda >= 0 ? "#2F6A46" : RUST, textTransform: "uppercase", letterSpacing: 0.5 }}>Queda para Howria</p>
              <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: queda >= 0 ? "#2F6A46" : RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(queda)}</p>
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: queda >= 0 ? "#2F6A46" : RUST }}>Lo que entró menos lo que salió</p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 20px" }}>
            Solo cuenta plata que se movió de verdad: boletas ya pagadas por el cliente, y pagos ya registrados en la app. Lo emitido sin cobrar y el trabajo sin pagar van abajo. Toca cualquier recuadro para ver de dónde sale el número.
          </p>

          <p style={{ ...label, marginBottom: 8 }}>En camino {etiquetaPeriodo}</p>
          <div className="howria-finanzas-camino" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 26 }}>
            {/* Solo si el período tiene borradores. Con 0 quedaba un
                "Por emitir $0" justo debajo del aviso que dice que hay 28
                sin enviar, y leído rápido parecen contradecirse: el aviso
                es de todos los borradores y esta tarjeta solo del período. */}
            {borradoresPeriodo.length > 0 && (
            <div {...abre(detalleLista("Por emitir", "Boletas en borrador del período: trabajo hecho que todavía no le cobraste a nadie.", borradoresPeriodo, porEmitir, "No hay borradores de este período."))} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Por emitir {etiquetaPeriodo}</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(porEmitir)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{borradoresPeriodo.length} boleta(s) en borrador</p>
            </div>
            )}
            <div {...abre(detalleLista("Te deben", "Boletas ya emitidas que el cliente no ha pagado.", porCobrarPeriodo, porCobrar, "Nadie te debe boletas de este período."))} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Te deben</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(porCobrar)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{porCobrarPeriodo.length} boleta(s) emitida(s) sin pagar</p>
            </div>
            <div {...abre(detalleDeuda)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Debes a trabajadores</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(porPagarTrabajadores)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>Paseos hechos que aún no registras como pagados</p>
            </div>
          </div>

          <p style={{ ...label, marginBottom: 8 }}>Rentabilidad {etiquetaPeriodo}</p>
          <div className="howria-finanzas-camino" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 10 }}>
            <div {...abre(detalleMargen)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Margen bruto</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: margenBruto == null ? "#8A7E5C" : margenBruto >= 0.3 ? "#2F6A46" : RUST, fontFamily: "Georgia, serif" }}>
                {margenBruto == null ? "—" : `${Math.round(margenBruto * 100)}%`}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                {margenBruto == null ? "Sin nada cobrado todavía" : `Queda ${fmtCLP(entro - costoDirecto)} después del costo de operar`}
              </p>
            </div>
            <div {...abre(detalleCostos("directo"))} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Costo directo</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costoDirecto)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>Sueldos de terreno {fmtCLP(costosPeriodo + costoResponsablesAdiestramiento)} + insumos y transporte {fmtCLP(costosDirectosSueltos)}</p>
            </div>
            <div {...abre(detalleCostos("fijo"))} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Gastos fijos</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costosFijos)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>Se pagan igual aunque no salga ningún paseo</p>
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 22px" }}>
            Del dinero cobrado, {fmtCLP(ingresoRecurrente)} viene de paseos (se repite solo el mes que viene) y {fmtCLP(ingresoPuntual)} de evaluaciones y clases, que hay que volver a vender.
          </p>

          <p style={{ ...label, marginBottom: 8 }}>Clientes {etiquetaPeriodo}</p>
          <div className="howria-finanzas-camino" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 26 }}>
            <div {...abre(detalleClientes)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Entraron / se fueron</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>+{clientesNuevos.length} / −{clientesDeBaja.length}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{activosHoy} activos hoy</p>
            </div>
            <div style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16 }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>% que se fue</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: churn > 5 ? RUST : "#2F6A46", fontFamily: "Georgia, serif" }}>{churn.toFixed(1)}%</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>Solo cuenta las bajas marcadas de ahora en adelante</p>
            </div>
            <div {...abre(detalleCac)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
              <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Costo por cliente nuevo</p>
              <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{cac == null ? "—" : fmtCLP(cac)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                {cac == null ? "Sin clientes nuevos en el período" : `${fmtCLP(gastoMarketing)} de marketing entre ${clientesNuevos.length}`}
              </p>
            </div>
          </div>

          {ocupacion && ocupacion.turnos.length > 0 && (
            <>
              <p style={{ ...label, marginBottom: 8 }}>Capacidad de las rutas (hoy, no del período)</p>
              <div className="howria-finanzas-camino" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 10 }}>
                <div {...abre(detalleOcupacion)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Qué tan llenos van</p>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{Math.round(ocupacion.ocupacionMedia * 100)}%</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{ocupacion.cuposOcupados} de {ocupacion.cuposTotales} cupos de la semana, en {ocupacion.turnos.length} turno(s)</p>
                </div>
                <div {...abre(detalleOcupacion)} style={{ background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10, padding: 16, cursor: "pointer" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Espacio sin salir a pasear más</p>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: "#2F6A46", fontFamily: "Georgia, serif" }}>{ocupacion.espacioLibre} cupos</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>Libres en la semana, en grupos que ya salen</p>
                </div>
                <div {...abre(detalleOcupacion)} style={{ background: ocupacion.sobreLimite.length > 0 ? "#F1DCD2" : "#FFFDF7", border: `1px solid ${ocupacion.sobreLimite.length > 0 ? "#E0B9A5" : "#E4DBC3"}`, borderRadius: 10, padding: 16, cursor: "pointer" }}>
                  <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Turnos pasados del límite</p>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 700, color: ocupacion.sobreLimite.length > 0 ? RUST : "#2F6A46", fontFamily: "Georgia, serif" }}>{ocupacion.sobreLimite.length}</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{ocupacion.sobreLimite.length > 0 ? "Más de " + MAX_PERROS_POR_TURNO + " perros juntos" : "Ninguno sobre " + MAX_PERROS_POR_TURNO + " perros"}</p>
                </div>
              </div>
              <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 22px" }}>
                Un cupo es un perro en un paseo: el que sale tres días ocupa tres. Los perros se cuentan desde el nombre escrito en la ficha, así que "Billy, Taffy y Nala" son 3.
                {ocupacion.sinHorario.length > 0 && ` ${ocupacion.sinHorario.length} cliente(s) de paseos no tienen días u hora habitual y quedan fuera de esta cuenta: ${ocupacion.sinHorario.map((c) => c.nombre.trim()).join(", ")}.`}
              </p>
            </>
          )}

          {margenPorTrabajador.length > 0 && (
            <>
              <p style={{ ...label, marginBottom: 2 }}>Cuánto deja cada persona de terreno {etiquetaPeriodo}</p>
              <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>
                Paseos y adiestramiento juntos: cada boleta cuenta para quien hace ese servicio. Un margen negativo casi siempre significa que las boletas de sus clientes todavía no se cobran, no que la persona cueste más de lo que genera. Aproximado — se atribuye por quien atiende al cliente hoy, así que una reasignación reciente mueve el histórico.
              </p>
              <div style={{ display: "grid", gap: 6, marginBottom: 26 }}>
                {margenPorTrabajador.map((f) => (
                  <div key={f.nombre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>{f.nombre}</p>
                      <p style={{ margin: 0, fontSize: 11.5, color: "#8A7E5C" }}>
                      {f.esSinAsignar ? "Clientes sin paseador ni adiestrador asignado" : `${f.clientes} cliente(s) · cobrado ${fmtCLP(f.genero)} · pagado ${fmtCLP(f.pagado)}`}
                    </p>
                    </div>
                    <p style={{ margin: 0, fontSize: 16, fontWeight: 700, fontFamily: "Georgia, serif", color: f.margen >= 0 ? "#2F6A46" : RUST }}>{fmtCLP(f.margen)}</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <ModalDetalleFinanzas detalle={detalle} onCerrar={() => setDetalle(null)} />

      <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: `repeat(${vistaPersonal ? (esResponsable ? 4 : 3) : 2}, 1fr)`, gap: 14, marginBottom: 26 }}>
        {vistaPersonal && (
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Ingresos {etiquetaPeriodo}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(actual.ingresos)}</p>
            {periodo !== "personalizado" && (
              <p style={{ margin: "6px 0 0", fontSize: 11.5, color: varIngresos >= 0 ? "#9FD8A8" : "#E3A08C" }}>
                {varIngresos >= 0 ? "▲" : "▼"} {Math.abs(varIngresos).toFixed(0)}% vs {etiquetaAnterior}
              </p>
            )}
          </div>
        )}
        {vistaPersonal && esResponsable && (
          <div style={{ background: "#D8ECDE", borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#2F6A46", textTransform: "uppercase", letterSpacing: 0.5 }}>Tu parte</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2F6A46", fontFamily: "Georgia, serif" }}>{fmtCLP(tuParte)}</p>
          </div>
        )}
        <TarjetaResumenFactura titulo="Boletas emitidas" valor={actual.cantidad} color="#8A7E5C" bg={CREAM_SOFT} />
        <TarjetaResumenFactura titulo="Ticket promedio" valor={fmtCLP(promedioBoleta)} color="#8A7E5C" bg={CREAM_SOFT} />
      </div>

      {!vistaPersonal && (
        <div className="howria-card" style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, marginBottom: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
            <div>
              <p style={{ ...label, marginBottom: 2 }}>Otros costos del negocio {etiquetaPeriodo}</p>
              <p style={{ margin: 0, fontSize: 11.5, color: "#8A7E5C" }}>Arriendo, insumos, marketing — lo que no es pago a trabajadores.</p>
            </div>
            <button onClick={() => setMostrarFormCosto((v) => !v)} style={{ ...botonSecundario, width: "auto", padding: "8px 16px" }}>
              {mostrarFormCosto ? "Cancelar" : "+ Agregar costo"}
            </button>
          </div>
          {mostrarFormCosto && (
            <>
              <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 10, marginTop: 14 }}>
                <input placeholder="Descripción (ej: bolsas biodegradables)" value={descCosto} onChange={(e) => setDescCosto(e.target.value)} style={{ ...input, marginBottom: 0 }} />
                {/* La categoría no es decoración: es lo que decide si el
                    gasto entra en el margen bruto (directo) o queda como
                    gasto fijo. Ver CATEGORIAS_COSTO. */}
                <select value={categoriaCosto} onChange={(e) => setCategoriaCosto(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {CATEGORIAS_COSTO.map((c) => (
                    <option key={c.id} value={c.id}>{c.nombre} · {c.grupo === "directo" ? "directo" : "fijo"}</option>
                  ))}
                </select>
                <input type="number" placeholder="Monto" min="0" value={montoCosto} onChange={(e) => setMontoCosto(e.target.value)} style={{ ...input, marginBottom: 0 }} />
                <input type="date" value={fechaCosto} onChange={(e) => setFechaCosto(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              </div>
              <p style={{ ...hint, marginTop: 8, marginBottom: 0 }}>
                {CATEGORIAS_COSTO.find((c) => c.id === categoriaCosto)?.ayuda}
                {grupoDeCategoria(categoriaCosto) === "directo"
                  ? " — sube cuando atiendes más perros, así que baja el margen bruto."
                  : " — se paga igual aunque no salga ningún paseo."}
              </p>
              <button onClick={agregarCosto} disabled={!descCosto.trim() || !Number(montoCosto)}
                style={{ ...botonPrincipal, width: "auto", marginTop: 12, padding: "10px 20px", opacity: !descCosto.trim() || !Number(montoCosto) ? 0.6 : 1 }}>
                Guardar costo
              </button>
            </>
          )}
          {costosGeneralesFiltrados.length > 0 && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
              {costosGeneralesFiltrados.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #E4DBC3" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, color: NAVY, fontWeight: 600 }}>{c.descripcion}</p>
                    <p style={{ margin: 0, fontSize: 11.5, color: "#8A7E5C" }}>
                      {new Date(c.fecha + "T00:00:00").toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                      {" · "}{CATEGORIAS_COSTO.find((x) => x.id === c.categoria)?.nombre || "Otros"}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                    <b style={{ color: RUST, fontSize: 13.5 }}>{fmtCLP(c.monto)}</b>
                    <BotonEliminar onConfirm={() => eliminarCosto(c)} label="×" title="Eliminar costo"
                      style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 15, padding: 0 }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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

      {periodo !== "año" && (
      <div className="howria-card" style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, marginBottom: 26 }}>
        <p style={{ ...label, marginBottom: 2 }}>Proyección de {tituloPeriodo} (si se factura todo el plan habitual de cada cliente activo)</p>
        <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A7E5C" }}>Sirve para pillar lo que falta emitir: el plan habitual de los clientes activos contra lo que ya facturaste.</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(proyeccionMes)}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Ya facturado: {fmtCLP(facturadoEsteMes)} ({porcentajeFacturado}%)</p>
        </div>
      </div>
      )}

      <p style={label}>Ingresos por tipo de servicio {etiquetaPeriodo} (un cliente puede contar en más de un tipo)</p>
      <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 26 }}>
        {porTipoServicio.map((t) => (
          <div key={t.tipo} style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>{t.tipo}</p>
            <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 17 }}>{fmtCLP(t.monto)}</p>
          </div>
        ))}
      </div>

      <p style={label}>Ingresos por mes {periodo === "año" ? `de ${tituloPeriodo}` : "(los últimos 6)"}</p>
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
                <FilaLista key={c.nombre} Icono={Dog} titulo={`${i === 0 ? "🏅 " : ""}${String(c.nombre).trim()}`} subtitulo={c.etiqueta} valor={fmtCLP(c.total)} valorColor={NAVY} />
              ))}
            </div>
          )}
        </div>

        <div>
          <p style={{ ...label, marginBottom: 2 }}>Falta por cobrar {etiquetaPeriodo}</p>
          <p style={{ margin: "0 0 10px", fontSize: 11.5, color: "#8A7E5C" }}>
            Paseos con días este ciclo y adiestramiento con clases hechas, en ambos casos sin boleta emitida. Los alumnos que este ciclo no tuvieron nada no aparecen: no hay qué cobrarles.
          </p>
          {faltanPorCobrar.paseos.length === 0 && faltanPorCobrar.adiestramiento.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>No queda nadie por cobrar en este ciclo.</p>
          ) : (
            <div style={{ display: "grid", gap: 14 }}>
              {faltanPorCobrar.paseos.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 700, color: "#8A6A1E", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Paseos ({faltanPorCobrar.paseos.length})
                  </p>
                  {faltanPorCobrar.paseos.map((c) => (
                    <FilaLista key={c.id} Icono={Dog} titulo={c.nombre.trim()} subtitulo={c.perro}
                      valor={`${diasDelMesProgramados(c, actualDesde.getMonth(), actualDesde.getFullYear(), reprogramaciones).length} paseo(s)`}
                      valorColor={RUST} />
                  ))}
                </div>
              )}
              {faltanPorCobrar.adiestramiento.length > 0 && (
                <div>
                  <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 700, color: "#2F6A46", textTransform: "uppercase", letterSpacing: 0.5 }}>
                    Adiestramiento ({faltanPorCobrar.adiestramiento.length})
                  </p>
                  {faltanPorCobrar.adiestramiento.map((c) => (
                    <FilaLista key={c.id} Icono={Dog} titulo={c.nombre.trim()}
                      subtitulo={`${c.perro || ""}${(c.tipoServicio || []).includes("clases") ? " · clases" : " · evaluación"}`}
                      valor="Sin cobrar" valorColor={RUST} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
