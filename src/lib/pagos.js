// Conteo y monto de paseos dentro de un rango de fechas — la base de lo
// que se le paga a cada paseador (ver src/tabs/PagoTrabajadores.jsx).
// Vive acá y no dentro del componente para poder probarlo: es lógica de
// plata, y ya hubo un bug real en esta zona (el reparto entre dos
// paseadores no se aplicaba al pago, ver lib/reparto.js). Mismo criterio
// que reparto.js y calculosBoletas.js — sin dependencias de React.
import { montoPrincipal } from "./reparto.js";

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
