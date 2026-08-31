// Conteo y monto de paseos dentro de un rango de fechas — la base de lo
// que se le paga a cada paseador (ver src/tabs/PagoTrabajadores.jsx).
// Vive acá y no dentro del componente para poder probarlo: es lógica de
// plata, y ya hubo un bug real en esta zona (el reparto entre dos
// paseadores no se aplicaba al pago, ver lib/reparto.js). Mismo criterio
// que reparto.js y calculosBoletas.js — sin dependencias de React.
import { montoPrincipal, montoCompartido } from "./reparto.js";

// Igual que fechaKey de HowriaAdmin.jsx, redefinido acá para no acoplar
// este archivo al bundle del panel (mismo motivo que en CalendarioMes.jsx).
function fechaKey(fecha) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}-${String(fecha.getDate()).padStart(2, "0")}`;
}

// Cuántos paseos DEBERÍA haber tenido el cliente en el rango, según sus
// días habituales. Un día cancelado no cuenta: no es un incumplimiento del
// paseador, así que tampoco debe empeorar su % de cumplimiento.
// `hasta` es exclusivo.
export function programadosEnRango(cliente, desde, hasta, registroPaseos = {}) {
  // Un cliente de solo adiestramiento no tiene paseos programados, aunque
  // le hayan quedado días habituales guardados. Mismo criterio que
  // estaProgramadoEnFecha: sin tipoServicio guardado se trata como paseos,
  // por compatibilidad con los clientes anteriores a ese campo. Sin esto
  // inflaba los "programados" y hundía el % de cumplimiento del paseador.
  if (cliente.tipoServicio?.length && !cliente.tipoServicio.includes("paseos")) return 0;
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
export function resumenPaseadorEnRango({
  clientes = [], registroPaseos = {}, reprogramaciones = [], paseador, desde, hasta,
}) {
  const misClientes = clientes.filter((c) => c.paseadorNombre === paseador);
  const desdeKey = fechaKey(new Date(desde));
  const hastaKey = fechaKey(new Date(hasta));

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
    // "faltantes": de los días netos de cancelación, los que ya deberían
    // haberse hecho pero todavía no se marcaron.
    return { cliente: c, programados: validas.length, realizados, cancelados, faltantes: validas.length - realizados, monto };
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
      compartido: totalCompartido,
      monto: filas.reduce((acc, f) => acc + f.monto, 0) + totalCompartido,
    },
  };
}
