// Las tres cosas que hay que revisarle a un cliente, y que hasta ahora se
// contestaban en tres archivos distintos: el aviso de Inicio las calculaba
// dentro de calcularAvisos, Coordinación repetía la de los días sueltos, y
// la lista de Clientes no las tenía aunque es justo donde se arreglan.
//
// Son las que cuestan plata callada: un cliente sin boleta es un servicio
// dado y no cobrado, uno sin días no aparece nunca en el calendario y nadie
// le marca un paseo, y uno con tarifa en $0 le suma paseos a un paseador
// que después valen nada al momento de pagarle.
//
// Viven acá para que la lista de Clientes filtre EXACTAMENTE por lo mismo
// que dice el aviso. Si el aviso dice 7 y el filtro muestra 5, el que
// pierde la confianza es el aviso.
import { fechaKey } from "./programacion.js";
import { esBoletaDeCliente } from "./calculosBoletas.js";

// Un cliente de paseos activo sin ningún día marcado: ni días habituales,
// ni fechas sueltas. No es que esté pendiente — es que no existe para el
// calendario, así que nadie le puede marcar un paseo y no se le factura
// nada. Es el punto ciego de Coordinación: todo lo demás muestra lo que
// hay, y esto muestra lo que falta.
export function sinDiasAsignados(c) {
  const servicios = c.tipoServicio || [];
  // Sin tipoServicio guardado se asume "paseos", por compatibilidad: antes
  // de que existiera el campo, todo cliente era de paseos.
  if (servicios.length && !servicios.includes("paseos")) return false;
  if ((c.estadoCliente || "activo") !== "activo") return false;
  return !(c.diasHabituales || []).length && !(c.diasPuntuales || []).length;
}

// ¿Le falta la boleta del mes en curso? Mira las de paseo y las de
// adiestramiento juntas, y por el mes en que se EMITIÓ.
//
// OJO: no filtra por estadoCliente, así que también cuenta a los de baja.
// Se dejó tal cual a propósito — es el mismo criterio que usa "Clientes sin
// boleta este mes" en Finanzas, y cambiarlo acá haría que los dos números
// dejaran de coincidir. Si algún día se acota, hay que acotar los dos.
export function sinBoletaEnElMes(c, boletas, fecha) {
  return !boletas.some((b) => {
    const f = new Date(b.fechaISO);
    return esBoletaDeCliente(b, c) && f.getMonth() === fecha.getMonth() && f.getFullYear() === fecha.getFullYear();
  });
}

// Cliente con paseador asignado, tarifa del paseador en $0, y paseos YA
// hechos este mes. Las tres condiciones importan: un cliente recién
// cargado, todavía sin tarifa y sin paseos, no es un problema —— es un
// cliente recién cargado.
//
// Caso real que lo originó: Javier Arniaz llegó a 25 paseos realizados con
// $0 de pago calculado, y solo se descubrió mirando "Pago trabajadores" a
// mano.
export function conPaseosSinTarifa(c, registroPaseos, fecha) {
  if (!c.paseadorNombre || Number(c.tarifaPaseador || 0) > 0) return false;
  const cur = new Date(fecha.getFullYear(), fecha.getMonth(), 1);
  // Mediodía y no medianoche: en el cambio de hora de septiembre un cursor
  // anclado a las 00:00 se salta un día. Mismo arreglo que en lib/pagos.js.
  cur.setHours(12, 0, 0, 0);
  const fin = new Date(fecha);
  fin.setHours(12, 0, 0, 0);
  while (cur <= fin) {
    if (registroPaseos[`${c.id}_${fechaKey(cur)}`]?.realizado) return true;
    cur.setDate(cur.getDate() + 1);
  }
  return false;
}

// Los tres filtros rápidos de la lista de Clientes, en un solo lugar para
// que la lista y los contadores no se puedan desincronizar.
//
// `soloPaseos` apaga los dos que no aplican al negocio de adiestramiento:
// un alumno no tiene días de paseo ni tarifa de paseador.
export const FILTROS_REVISION = [
  { id: "sin-boleta", etiqueta: "Sin boleta este mes", soloPaseos: false },
  { id: "sin-dias", etiqueta: "Sin días asignados", soloPaseos: true },
  { id: "tarifa-cero", etiqueta: "Tarifa en $0", soloPaseos: true },
];

export function cumpleRevision(id, c, { boletas = [], registroPaseos = {}, fecha }) {
  const dia = fecha || new Date();
  if (id === "sin-boleta") return sinBoletaEnElMes(c, boletas, dia);
  if (id === "sin-dias") return sinDiasAsignados(c);
  if (id === "tarifa-cero") return conPaseosSinTarifa(c, registroPaseos, dia);
  return true;
}
