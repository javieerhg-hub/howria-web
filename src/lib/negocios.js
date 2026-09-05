// Los dos negocios de Howria, y a cuál pertenece un cliente.
//
// Vive acá porque la misma pregunta se hace en dos pestañas que no se
// pueden importar entre sí sin arrastrarse el chunk (Clientes parte la
// lista en dos vistas; Boletas decide a quién se le puede emitir una
// boleta de adiestramiento). Tenerla dos veces era cuestión de tiempo para
// que una se quedara atrás — de hecho pasó: la de Boletas pedía solo
// "clases", así que a un cliente que entró pidiendo una evaluación no se
// le podía emitir la boleta de esa evaluación.
//
// Un cliente puede caer en los dos (hoy ninguno lo hace, pero si lo
// hiciera aparecería en las dos vistas, que es lo correcto).

export function esClienteDePaseos(c) {
  return (c?.tipoServicio || []).includes("paseos");
}

// Evaluación Y clases. La evaluación es la puerta de entrada al
// adiestramiento: se cobra igual que una clase, y el formulario de boletas
// tiene un modo "Solo evaluación" hecho justo para eso. Dejarla fuera
// obligaba a marcarle "clases" en la ficha a alguien que todavía no es
// alumno.
export function esClienteDeAdiestramiento(c) {
  const t = c?.tipoServicio || [];
  return t.includes("evaluacion") || t.includes("clases");
}
