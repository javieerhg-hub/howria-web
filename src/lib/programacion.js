// "¿Este cliente tiene paseo este día?" — una sola respuesta para toda la
// app.
//
// La pregunta se contestaba en cuatro lugares con reglas distintas:
// Coordinación, el pago del paseador en Mis Paseos, programadosEnRango
// (Pago Trabajadores y Finanzas) y el calendario. Cada vez que se agregó
// una forma nueva de programar un paseo —el tipo de servicio, las
// reprogramaciones, el estado del cliente, las fechas sueltas— hubo que
// acordarse de las cuatro, y nunca se acertó a la primera: la última fue
// dias_puntuales, que quedó solo en Coordinación y habría dejado al
// paseador sin cobrar los paseos que sí hizo.
//
// Vive en lib/ y no en HowriaAdmin.jsx para que lib/pagos.js pueda usarla
// sin arrastrar React, y para poder probarla sin montar la app.

export function fechaKey(d) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

// Quién cuenta como carga de paseos: los de servicio "paseos" (o sin
// tipoServicio guardado, por compatibilidad con fichas viejas) y que estén
// activos. Un pausado conserva sus días para cuando vuelva, así que el
// estado es lo único que lo saca de la lista.
export function esClienteDePaseosActivo(cliente) {
  if (cliente.tipoServicio?.length && !cliente.tipoServicio.includes("paseos")) return false;
  return (cliente.estadoCliente || "activo") === "activo";
}

// Las cuatro formas en que un cliente puede tener paseo un día:
//   1. es uno de sus días habituales de la semana;
//   2. es una fecha suelta marcada en su ficha (el que no tiene días
//      fijos y sale cuando el tutor avisa);
//   3. le movieron un paseo a ese día;
// y en todos los casos, que el cliente esté activo y sea de paseos.
export function estaProgramadoEnFecha(cliente, fecha, reprogramaciones = []) {
  if (!esClienteDePaseosActivo(cliente)) return false;
  const dow = (fecha.getDay() + 6) % 7;
  if (cliente.diasHabituales?.includes(dow)) return true;
  const clave = fechaKey(fecha);
  if (cliente.diasPuntuales?.includes(clave)) return true;
  return reprogramaciones.some((r) => r.clienteId === cliente._dbId && r.fechaNueva === clave);
}

// Los días de un mes en que el cliente tiene paseo, como números de día.
// Lo usan el pago del paseador y la sugerencia de la boleta, que razonan
// por mes y no por fecha suelta.
export function diasDelMesProgramados(cliente, mesIdx, anio, reprogramaciones = []) {
  const total = new Date(anio, mesIdx + 1, 0).getDate();
  const dias = [];
  for (let d = 1; d <= total; d++) {
    if (estaProgramadoEnFecha(cliente, new Date(anio, mesIdx, d), reprogramaciones)) dias.push(d);
  }
  return dias;
}
