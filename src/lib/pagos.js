import { fechaKey, estaProgramadoEnFecha } from "./programacion.js";

// Conteo y monto de paseos dentro de un rango de fechas — la base de lo
// que se le paga a cada paseador (ver src/tabs/PagoTrabajadores.jsx).
// Vive acá y no dentro del componente para poder probarlo: es lógica de
// plata, y ya hubo un bug real en esta zona (el reparto entre dos
// paseadores no se aplicaba al pago, ver lib/reparto.js). Mismo criterio
// que reparto.js y calculosBoletas.js — sin dependencias de React.
import { montoPrincipal, montoCompartido } from "./reparto.js";

// Cuántos paseos DEBERÍA haber tenido el cliente en el rango, según sus
// días habituales. Un día cancelado no cuenta: no es un incumplimiento del
// paseador, así que tampoco debe empeorar su % de cumplimiento.
// `hasta` es exclusivo.
export function programadosEnRango(cliente, desde, hasta, registroPaseos = {}, reprogramaciones = []) {
  // La regla de "tiene paseo este día" vive en lib/programacion.js y la
  // usa toda la app. Antes esta función tenía su propia copia y se quedó
  // atrás dos veces: no sabía de fechas sueltas ni del estado del cliente.
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const cancelado = registroPaseos[`${cliente.id}_${fechaKey(cur)}`]?.cancelado;
    if (estaProgramadoEnFecha(cliente, cur, reprogramaciones) && !cancelado) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// Cuántos se marcaron realizados. Si el registro guardó quién era el
// paseador ese día, solo cuenta para esa persona — así, si el cliente
// cambió de paseador a mitad de mes, cada uno se lleva lo suyo.
export function realizadosEnRango(registroPaseos, clienteId, desde, hasta, paseadorEsperado = null) {
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const r = registroPaseos[`${clienteId}_${fechaKey(cur)}`];
    if (r?.realizado && (!paseadorEsperado || !r.paseadorNombre || r.paseadorNombre === paseadorEsperado)) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

// Monto real del cliente en el rango — a diferencia de "realizados ×
// tarifa", va día por día, porque un paseo puntual puede estar repartido
// con otro paseador (Coordinación, "Compartir con...") y entonces el
// paseador principal se queda solo con el resto del porcentaje.
export function montoRealizadoEnRango(registroPaseos, clienteId, desde, hasta, paseadorEsperado, tarifa) {
  let monto = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const r = registroPaseos[`${clienteId}_${fechaKey(cur)}`];
    if (r?.realizado && (!paseadorEsperado || !r.paseadorNombre || r.paseadorNombre === paseadorEsperado)) {
      monto += montoPrincipal(tarifa, r);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return monto;
}

// Claves de fecha de los días habituales de un cliente dentro de un rango.
// OJO: acá `hasta` es INCLUSIVO, al revés que programadosEnRango /
// realizadosEnRango / montoRealizadoEnRango de más arriba. Se respeta el
// criterio que ya tenía Finanzas para no cambiarle los números al
// paseador al mover esto de lugar.
function clavesHabitualesEnRango(desde, hasta, diasSemana) {
  const claves = [];
  // MEDIODÍA, no medianoche. En el cambio de hora de Chile (septiembre
  // adelanta, abril atrasa) el reloj salta a las 00:00, así que avanzar un
  // día desde las 00:00 deja el cursor en las 01:00 — y esa hora de más se
  // arrastra hasta el final del rango, dejando el último día fuera por 60
  // minutos. Septiembre de 2026 perdía el miércoles 30: un paseo menos en
  // el conteo del paseador, en silencio. Anclado a las 12:00, un
  // corrimiento de ±1 hora nunca cruza el borde del día.
  const cursor = new Date(desde);
  cursor.setHours(12, 0, 0, 0);
  const fin = new Date(hasta);
  fin.setHours(12, 0, 0, 0);
  while (cursor <= fin) {
    const dow = (cursor.getDay() + 6) % 7;
    if (diasSemana.includes(dow)) claves.push(fechaKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return claves;
}

// Lo que ve un PASEADOR en su pestaña Finanzas: cuántos paseos hizo y
// cuánta plata le toca en el rango. Vivía dentro de Finanzas.jsx, donde
// no se podía probar; se movió acá porque ya hubo un bug de plata en
// esta cuenta exacta (mostraba de más, ver el test "un paseo de su
// cliente hecho por otro y compartido con él").
//
// La regla que sostiene todo: la plata sigue al REGISTRO del paseo, no al
// dueño del cliente. Si el registro dice quién lo hizo y no fue esta
// persona, la parte principal no le toca — aunque el cliente sea suyo.
// Es el mismo criterio de montoRealizadoEnRango, que es lo que usa Pago
// trabajadores para pagar de verdad; los dos números tienen que cuadrar.
// `hasta` corta en HOY: es lo que define "faltantes", o sea los paseos que
// ya deberían estar marcados. `hastaTotal` es el fin del período completo
// y sirve para el compromiso del mes — sin él, el día 2 de septiembre un
// cliente de 13 paseos mostraba "1/1", que es correcto pero no es lo que
// el paseador quiere saber.
//
// `boletas` + `mesBoleta`/`anioBoleta`: el compromiso del mes sale de la
// BOLETA cuando existe, no de contar días habituales. La boleta es lo que
// el tutor efectivamente pagó ("13 paseos") y es el número contra el que
// el paseador se quiere medir; los días habituales son solo el plan
// teórico y se mueven con feriados, días puntuales y reprogramaciones.
// Sin boleta del mes se cae al plan, que es la mejor estimación que hay.
export function resumenPaseadorEnRango({
  clientes = [], registroPaseos = {}, reprogramaciones = [], boletas = [],
  paseador, desde, hasta, hastaTotal = null, mesBoleta = null, anioBoleta = null,
}) {
  const misClientes = clientes.filter((c) => c.paseadorNombre === paseador);
  const desdeKey = fechaKey(new Date(desde));
  const hastaKey = fechaKey(new Date(hasta));
  const finTotal = hastaTotal || hasta;

  const filas = misClientes.map((c) => {
    // Un paseo movido HACIA una fecha del rango (venga de donde venga)
    // también cuenta — si no, el paseador pierde la plata de un paseo que
    // sí hizo, solo porque cayó en un día no habitual.
    const clavesReprogramadas = reprogramaciones
      .filter((r) => r.clienteId === c._dbId && r.fechaNueva >= desdeKey && r.fechaNueva <= hastaKey)
      .map((r) => r.fechaNueva);
    const claves = [...new Set([
      ...clavesHabitualesEnRango(desde, hasta, c.diasHabituales || []),
      ...clavesReprogramadas,
    ])];
    const cancelados = claves.filter((k) => registroPaseos[`${c.id}_${k}`]?.cancelado).length;
    const validas = claves.filter((k) => !registroPaseos[`${c.id}_${k}`]?.cancelado);
    const tarifa = Number(c.tarifaPaseador || 0);

    let realizados = 0, monto = 0;
    validas.forEach((k) => {
      const r = registroPaseos[`${c.id}_${k}`];
      if (!r?.realizado) return;
      if (r.paseadorNombre && r.paseadorNombre !== paseador) return;
      realizados++;
      monto += montoPrincipal(tarifa, r);
    });
    // El plan del período COMPLETO (no solo hasta hoy), que es el respaldo
    // cuando todavía no hay boleta del mes.
    const clavesTotal = [...new Set([
      ...clavesHabitualesEnRango(desde, finTotal, c.diasHabituales || []),
      ...reprogramaciones
        .filter((r) => r.clienteId === c._dbId && r.fechaNueva >= desdeKey && r.fechaNueva <= fechaKey(new Date(finTotal)))
        .map((r) => r.fechaNueva),
    ])];
    const programadosTotal = clavesTotal.filter((k) => !registroPaseos[`${c.id}_${k}`]?.cancelado).length;

    // Una boleta cancelada no compromete nada. Un borrador sí: en Howria
    // el flujo real es borrador -> pagada, así que esperar a que esté
    // aceptada dejaría al paseador sin meta media semana.
    const boleta = mesBoleta
      ? boletas.find((b) => b.clienteId === c._dbId && b.mes === mesBoleta && b.anio === anioBoleta && b.estado !== "cancelada")
      : null;
    const cobrados = boleta ? Number(boleta.cantidad || 0) : null;

    // Contra esto se mide el paseador: la boleta si existe, el plan si no.
    const delMes = cobrados ?? programadosTotal;

    // "faltantes": de los días netos de cancelación, los que ya deberían
    // haberse hecho pero todavía no se marcaron.
    return {
      cliente: c, programados: validas.length, realizados, cancelados,
      faltantes: validas.length - realizados, monto,
      programadosTotal, cobrados, delMes, metaMonto: delMes * tarifa,
    };
  });

  // Paseos de clientes AJENOS donde este paseador quedó como el segundo
  // de un reparto.
  const compartidos = Object.entries(registroPaseos)
    .filter(([, r]) => r.realizado && r.compartidoCon === paseador)
    .map(([clave, r]) => {
      const corte = clave.indexOf("_");
      const fecha = clave.slice(corte + 1);
      if (fecha < desdeKey || fecha > hastaKey) return null;
      const cliente = clientes.find((c) => c.id === Number(clave.slice(0, corte)));
      if (!cliente) return null;
      return { cliente, fecha, monto: montoCompartido(Number(cliente.tarifaPaseador || 0), r) };
    })
    .filter(Boolean);

  const totalCompartido = compartidos.reduce((acc, x) => acc + x.monto, 0);
  return {
    filas,
    compartidos,
    totales: {
      realizados: filas.reduce((acc, f) => acc + f.realizados, 0),
      programados: filas.reduce((acc, f) => acc + f.programados, 0),
      // Del período completo, para "cuánto llevo del mes".
      delMes: filas.reduce((acc, f) => acc + f.delMes, 0),
      // La meta en plata: lo que va a ganar si hace todo lo comprometido.
      meta: filas.reduce((acc, f) => acc + f.metaMonto, 0),
      compartido: totalCompartido,
      monto: filas.reduce((acc, f) => acc + f.monto, 0) + totalCompartido,
    },
  };
}

// ---------- Pagos que se pisan ----------

// El rango de TRABAJO que cubre un pago ya registrado. Se guarda
// `periodoDesdeISO` (el inicio del trabajo, no el día en que se registró)
// junto con `periodo` ("semana" | "mes"); el fin se deduce de los dos.
//
// Mediodía y no medianoche, por convención del proyecto: las fechas que
// se mueven de a días se anclan al mediodía para que el cambio de hora no
// las corra (ver lib/revisiones.js y clavesHabitualesEnRango acá arriba,
// donde sí llegó a restar un paseo cada septiembre). Acá no se comprobó
// que hiciera diferencia — se usa igual para no dejar la excepción.
export function rangoDePago(pago) {
  if (!pago?.periodoDesdeISO) return null;
  const desde = new Date(`${pago.periodoDesdeISO}T12:00:00`);
  if (Number.isNaN(desde.getTime())) return null;
  const hasta = new Date(desde);
  if (pago.periodo === "semana") hasta.setDate(hasta.getDate() + 7);
  else hasta.setMonth(hasta.getMonth() + 1);
  return { desde, hasta };
}

// Pagos ya hechos a esta persona cuyo trabajo se PISA con el rango que se
// está mirando, sin ser el de este período exacto.
//
// POR QUÉ EXISTE: la pantalla marca "Pagado" comparando periodo+etiqueta
// exactos. Un pago de la semana del 1 al 7 no calza con "mes de
// septiembre", así que al mirar el mes esa fila sale como IMPAGA y con el
// monto del mes entero. Pagarla ahí le paga esa semana dos veces, sin que
// nada avise. La trampa ya existía —basta cambiar de semana a mes a
// mano— y se volvió importante al alinear los defaults de las pantallas
// de plata.
//
// Los pagos viejos sin `periodoDesdeISO` (anteriores a que se guardara) se
// omiten: no hay forma de saber qué cubrían, y adivinar sería peor.
export function pagosQueSeCruzan(pagos, paseador, desde, hasta, periodo, etiqueta) {
  return (pagos || []).filter((p) => {
    if (p.paseador !== paseador || p.deshechoEn) return false;
    // Ese ya se ve como "Pagado" en la misma fila; no es un cruce.
    if (p.periodo === periodo && p.etiqueta === etiqueta) return false;
    const r = rangoDePago(p);
    return !!r && r.desde < hasta && r.hasta > desde;
  });
}
