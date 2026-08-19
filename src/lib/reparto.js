// Reparto de pago de un paseo puntual entre dos paseadores (Coordinación,
// "Compartir con...", database/098). Antes esta cuenta vivía repetida a
// mano en HowriaAdmin.jsx, Finanzas.jsx y PagoTrabajadores.jsx — se juntó
// acá para que un cambio futuro (o un bug) no tenga que corregirse tres
// veces por separado.

// Lo que le queda al paseador PRINCIPAL de un cliente ese día — el total
// si no hubo reparto, o el resto del porcentaje si sí lo hubo.
export function montoPrincipal(tarifa, registro) {
  if (!registro?.compartidoCon) return tarifa;
  return (tarifa * (100 - (registro.porcentajeCompartido ?? 50))) / 100;
}

// Lo que le corresponde al paseador CON QUIEN se compartió ese paseo —
// 0 si no hubo reparto.
export function montoCompartido(tarifa, registro) {
  if (!registro?.compartidoCon) return 0;
  return (tarifa * (registro.porcentajeCompartido ?? 50)) / 100;
}
