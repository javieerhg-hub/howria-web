// Funciones puras de cálculo para boletas, facturas y finanzas — sin
// estado de React ni llamadas a Supabase, para poder testearlas directo
// (ver calculosBoletas.test.js). HowriaAdmin.jsx las usa desde acá en vez
// de recalcular inline en cada componente.

export function diasDelMes(mesIdx, anio) {
  return new Date(anio, mesIdx + 1, 0).getDate();
}

// Feriados de Chile — lista editable. Fechas fijas se repiten cada año;
// Semana Santa y algunos feriados "puente" cambian, así que conviene
// revisar/agregar los del año siguiente cuando corresponda.
export const FERIADOS_CHILE = new Set([
  // 2026
  "2026-01-01", "2026-04-03", "2026-04-04", "2026-05-01", "2026-05-21",
  "2026-06-21", "2026-06-29", "2026-07-16", "2026-08-15", "2026-09-18",
  "2026-09-19", "2026-10-12", "2026-10-31", "2026-11-01", "2026-12-08",
  "2026-12-25",
  // 2027 (Viernes/Sábado Santo, San Pedro y San Pablo y Encuentro de Dos
  // Mundos son movibles — calculados a partir de Pascua 2027 = 28 de marzo)
  "2027-01-01", "2027-03-26", "2027-03-27", "2027-05-01", "2027-05-21",
  "2027-06-21", "2027-06-28", "2027-07-16", "2027-08-15", "2027-09-18",
  "2027-09-19", "2027-10-11", "2027-10-31", "2027-11-01", "2027-12-08",
  "2027-12-25",
]);

export const RECARGO_FIN_SEMANA_FERIADO_DEFAULT = 30; // % por defecto, editable desde Boletas

export function esFinDeSemanaOFeriado(fecha) {
  const dow = fecha.getDay(); // 0=domingo, 6=sábado
  if (dow === 0 || dow === 6) return true;
  const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
  return FERIADOS_CHILE.has(key);
}

export function valorConRecargo(valorPaseo, esRecargo, pct = RECARGO_FIN_SEMANA_FERIADO_DEFAULT) {
  return esRecargo ? Math.round(Number(valorPaseo) * (1 + Number(pct) / 100)) : Number(valorPaseo);
}

// devuelve los días del mes cuyo día de semana (0=lunes) está en el set del plan
export function diasSegunPlan(mesIdx, anio, diasSemana) {
  const total = diasDelMes(mesIdx, anio);
  const resultado = [];
  for (let d = 1; d <= total; d++) {
    const dow = (new Date(anio, mesIdx, d).getDay() + 6) % 7; // 0=lunes
    if (diasSemana.includes(dow)) resultado.push(d);
  }
  return resultado;
}

// Boleta de paseos: separa los días con/sin recargo, aplica el % de
// recargo, resta paseos cancelados y suma extras (dogsitter, paseo
// largo, paseos pendientes del mes anterior). neto/iva son el desglose
// del total a 19% IVA (el total ya lo incluye, no se suma aparte).
export function calcularBoletaPaseos({
  dias, mesIdx, anio, valorPaseo, recargoPct = RECARGO_FIN_SEMANA_FERIADO_DEFAULT,
  paseosMesAnterior = 0, paseosCancelados = 0, montoDogsitter = 0, montoPaseoLargo = 0,
}) {
  const diasConRecargo = dias.filter((d) => esFinDeSemanaOFeriado(new Date(anio, mesIdx, d)));
  const diasNormales = dias.filter((d) => !esFinDeSemanaOFeriado(new Date(anio, mesIdx, d)));
  const subtotal = diasNormales.length * Number(valorPaseo || 0)
    + diasConRecargo.reduce((acc) => acc + valorConRecargo(valorPaseo, true, recargoPct), 0)
    + Number(paseosMesAnterior || 0) * Number(valorPaseo || 0)
    + Number(montoDogsitter || 0) + Number(montoPaseoLargo || 0);
  const descuento = Number(paseosCancelados || 0) * Number(valorPaseo || 0);
  const total = Math.max(subtotal - descuento, 0);
  const neto = Math.round(total / 1.19);
  const iva = total - neto;
  return { diasConRecargo, diasNormales, subtotal, descuento, total, neto, iva };
}

// Boleta de adiestramiento: N clases a un precio, con descuento de pack
// (por % y/o monto fijo, se suman), más evaluación opcional y transporte.
//
// Excepción: un pack armado a mano (packPrecioManual) NO se calcula. El
// precio que escribió quien emite la boleta ES el total, y todo lo demás
// (clases, evaluación, lo que trae el pack) pasa a ser solo la
// descripción de qué incluye. Es a propósito: si el precio se recalculara
// a partir de las partes, escribir "$80.000" y ver otro número abajo
// sería exactamente el error que este modo viene a evitar.
export function calcularBoletaAdiestramiento({
  numClases, precioClase, descuentoPackPct = 0, descuentoPackMonto = 0,
  evaluacion = "ninguna", precioEvaluacion = 0, transporte = 0,
  packPrecioManual = false, packPrecio = 0,
}) {
  if (packPrecioManual) {
    const total = Math.max(Number(packPrecio || 0), 0);
    // subtotalClases = total (no 0) para que cualquier vista que muestre
    // el subtotal sin saber de packs siga mostrando algo coherente.
    return { subtotalClases: total, montoDescuentoPct: 0, montoDescuento: 0, montoEvaluacion: 0, total };
  }
  const subtotalClases = Number(numClases || 0) * Number(precioClase || 0);
  const montoDescuentoPct = Math.round(subtotalClases * (Number(descuentoPackPct || 0) / 100));
  const montoDescuento = montoDescuentoPct + Number(descuentoPackMonto || 0);
  const montoEvaluacion = evaluacion !== "ninguna" ? Number(precioEvaluacion || 0) : 0;
  const total = Math.max(subtotalClases - montoDescuento + montoEvaluacion + Number(transporte || 0), 0);
  return { subtotalClases, montoDescuentoPct, montoDescuento, montoEvaluacion, total };
}

// A qué mes de servicio pertenece una boleta.
//
// Manda boletas.mes/anio, el mes que se elige AL EMITIRLA. No se puede
// deducir de la fecha de emisión, y eso está comprobado con los datos:
// Howria factura de dos formas el mismo día. A unos clientes por
// adelantado (boleta del 27 de agosto que cubre el 1 al 30 de
// septiembre) y a otros por los días ya caminados (boleta del 31 de
// agosto que cubre el 3 al 28 de agosto). Dos boletas emitidas el mismo
// día pertenecen a meses distintos, así que solo el mes elegido las
// distingue.
//
// Las de adiestramiento no tienen mes/anio — una evaluación o un pack se
// cobran cuando ocurren, no por adelantado — así que ahí la fecha de
// emisión sí es su período.
const MESES_PERIODO = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];

export function periodoDeBoleta(boleta) {
  const idx = MESES_PERIODO.indexOf(String(boleta.mes || "").trim().toLowerCase());
  if (idx >= 0 && boleta.anio) return new Date(Number(boleta.anio), idx, 1);
  return boleta.fechaISO ? new Date(boleta.fechaISO) : null;
}

// El ciclo de facturación en curso a una fecha: el cobro de un mes se
// genera entre el 20 del mes anterior y el 5 de ese mes. NO decide a qué
// mes pertenece una boleta (ver arriba) — sirve para sugerir el mes al
// emitir, que es el momento en que hay que preguntarlo.
export function cicloDeFecha(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const mes = d.getDate() <= 5 ? d.getMonth() : d.getMonth() + 1;
  return new Date(d.getFullYear(), mes, 1);
}

export function calcularTotales(lista) {
  const ingresos = lista.reduce((acc, b) => acc + b.total, 0);
  const paseos = lista.reduce((acc, b) => acc + (b.cantidad || 0), 0);
  const descuentos = lista.reduce((acc, b) => acc + (b.descuento || 0), 0);
  return { ingresos, paseos, descuentos, cantidad: lista.length };
}

// Una boleta solo cuenta como venta real una vez que el equipo la aceptó
// (pendiente_pago) o el cliente ya pagó (pagada) — un borrador sin revisar
// (no_enviada) o una boleta cancelada no deben sumar en ningún cálculo de
// ingresos/ventas.
export function esVenta(boleta) {
  return boleta.estado === "pendiente_pago" || boleta.estado === "pagada";
}

// Solo una boleta aceptada y todavía sin pagar es plata que el cliente
// realmente debe — un borrador sin revisar (no_enviada) no debería
// mostrarse como deuda, ni interna ni al propio cliente.
export function esPorCobrar(boleta) {
  return boleta.estado === "pendiente_pago";
}

// Cuánto de una boleta de adiestramiento le corresponde al responsable
// (entrenador a cargo del caso) vs a Howria. Si todavía no se definió a
// mano, se asume que es 100% del responsable — mismo comportamiento que
// existía antes de que este reparto se pudiera registrar. Las boletas de
// paseo no tienen este reparto (el costo del paseador se calcula aparte,
// vía tarifaPaseador), así que siempre devuelven el total completo.
export function montoParaResponsable(boleta) {
  if (boleta._tipo !== "adiestramiento") return boleta.total;
  return boleta.montoResponsable ?? boleta.total;
}
