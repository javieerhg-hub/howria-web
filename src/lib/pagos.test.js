import { describe, it, expect } from "vitest";
import { programadosEnRango, realizadosEnRango, montoRealizadoEnRango, resumenPaseadorEnRango } from "./pagos.js";

// Semana de lunes 17 a domingo 23 de agosto de 2026. `hasta` es exclusivo,
// así que para cubrir la semana completa se pasa el lunes siguiente.
const LUNES = new Date(2026, 7, 17);
const LUNES_SIGUIENTE = new Date(2026, 7, 24);
const cliente = { id: 7, diasHabituales: [0, 2, 4] }; // lunes, miércoles, viernes

describe("programadosEnRango", () => {
  it("cuenta un día por cada día habitual dentro del rango", () => {
    expect(programadosEnRango(cliente, LUNES, LUNES_SIGUIENTE, {})).toBe(3);
  });

  it("un día cancelado no cuenta — no es incumplimiento del paseador", () => {
    const registro = { "7_2026-08-19": { cancelado: true } }; // el miércoles
    expect(programadosEnRango(cliente, LUNES, LUNES_SIGUIENTE, registro)).toBe(2);
  });

  it("un cliente sin días habituales no tiene paseos programados", () => {
    expect(programadosEnRango({ id: 9 }, LUNES, LUNES_SIGUIENTE, {})).toBe(0);
  });

  it("hasta es exclusivo — no incluye el día final", () => {
    // Solo el lunes 17: hasta = martes 18.
    expect(programadosEnRango(cliente, LUNES, new Date(2026, 7, 18), {})).toBe(1);
  });

  it("un alumno de solo adiestramiento no tiene paseos programados, aunque le queden días habituales", () => {
    const alumno = { ...cliente, tipoServicio: ["clases"] };
    expect(programadosEnRango(alumno, LUNES, LUNES_SIGUIENTE, {})).toBe(0);
  });

  it("un cliente sin tipoServicio guardado se sigue tratando como de paseos (clientes antiguos)", () => {
    expect(programadosEnRango({ ...cliente, tipoServicio: [] }, LUNES, LUNES_SIGUIENTE, {})).toBe(3);
  });
});

describe("realizadosEnRango", () => {
  it("cuenta solo los marcados como realizados", () => {
    const registro = {
      "7_2026-08-17": { realizado: true },
      "7_2026-08-19": { cancelado: true },
      "7_2026-08-21": { realizado: true },
    };
    expect(realizadosEnRango(registro, 7, LUNES, LUNES_SIGUIENTE)).toBe(2);
  });

  it("si el registro guardó otro paseador, no cuenta para el esperado", () => {
    const registro = {
      "7_2026-08-17": { realizado: true, paseadorNombre: "Ana" },
      "7_2026-08-19": { realizado: true, paseadorNombre: "Beto" },
    };
    expect(realizadosEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, "Ana")).toBe(1);
    expect(realizadosEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, "Beto")).toBe(1);
  });

  it("un registro sin paseador guardado cuenta para quien se pregunte (datos viejos)", () => {
    const registro = { "7_2026-08-17": { realizado: true } };
    expect(realizadosEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, "Ana")).toBe(1);
  });
});

describe("montoRealizadoEnRango", () => {
  it("suma la tarifa completa por cada paseo propio", () => {
    const registro = {
      "7_2026-08-17": { realizado: true },
      "7_2026-08-19": { realizado: true },
    };
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, null, 8000)).toBe(16000);
  });

  it("un paseo compartido deja al principal solo con su parte (regresión del bug de reparto)", () => {
    const registro = {
      "7_2026-08-17": { realizado: true },
      "7_2026-08-19": { realizado: true, compartidoCon: "Beto", porcentajeCompartido: 50 },
    };
    // 8000 completo + 4000 (la mitad, porque el otro 50% es de Beto)
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, null, 8000)).toBe(12000);
  });

  it("un paseo cedido al 100% no le deja nada al paseador principal", () => {
    const registro = { "7_2026-08-17": { realizado: true, compartidoCon: "Beto", porcentajeCompartido: 100 } };
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, null, 8000)).toBe(0);
  });

  it("tarifa en $0 da monto $0 aunque haya paseos hechos (el caso que motivó el aviso de Inicio)", () => {
    const registro = {
      "7_2026-08-17": { realizado: true },
      "7_2026-08-19": { realizado: true },
    };
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, null, 0)).toBe(0);
  });

  it("no paga los paseos que quedaron atribuidos a otro paseador", () => {
    const registro = {
      "7_2026-08-17": { realizado: true, paseadorNombre: "Ana" },
      "7_2026-08-19": { realizado: true, paseadorNombre: "Beto" },
    };
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, "Ana", 8000)).toBe(8000);
  });

  // Caso encontrado comparando la pestaña Paseadores contra la tabla de
  // Pago trabajadores: un paseo cuyo reparto apunta al MISMO paseador
  // dueño del cliente. Pasa al usar "Agregar paseo anterior" (que reparte
  // al 100%) y después dejar al cliente asignado a esa misma persona.
  // Esta función devuelve SOLO la parte principal — quien la use tiene que
  // sumar aparte montoCompartido cuando `compartidoCon` es esa persona,
  // porque hizo el paseo entero. Es lo que hace la tabla de Pago
  // trabajadores (dos pasadas) y lo que le faltaba a detalleMesCliente.
  it("con el reparto apuntando al mismo paseador, devuelve solo la parte principal", () => {
    const registro = { "7_2026-08-17": { realizado: true, compartidoCon: "Ana", porcentajeCompartido: 50 } };
    expect(montoRealizadoEnRango(registro, 7, LUNES, LUNES_SIGUIENTE, "Ana", 8000)).toBe(4000);
  });
});

// --- Lo que ve un paseador en su pestaña Finanzas ---------------------
//
// Acá `hasta` es INCLUSIVO (ver el comentario en pagos.js), así que la
// semana de lunes 17 a domingo 23 se cubre pasando el domingo 23.
describe("resumenPaseadorEnRango", () => {
  const DOMINGO = new Date(2026, 7, 23);
  const CONSTANZA = "Constanza";
  const OTRO = "Javier";
  // Cliente de Constanza: lunes, miércoles y viernes a $5.000 el paseo.
  const suCliente = { id: 7, _dbId: "c7", nombre: "Ana", paseadorNombre: CONSTANZA, tarifaPaseador: 5000, diasHabituales: [0, 2, 4] };

  function resumen(registroPaseos, extra = {}) {
    return resumenPaseadorEnRango({
      clientes: [suCliente, ...(extra.clientes || [])],
      registroPaseos, reprogramaciones: extra.reprogramaciones || [],
      paseador: CONSTANZA, desde: LUNES, hasta: DOMINGO,
    });
  }

  it("cuenta los paseos que hizo ella y los cobra a su tarifa", () => {
    const r = resumen({
      "7_2026-08-17": { realizado: true, paseadorNombre: CONSTANZA },
      "7_2026-08-19": { realizado: true, paseadorNombre: CONSTANZA },
    });
    expect(r.totales.programados).toBe(3); // lun, mie, vie
    expect(r.totales.realizados).toBe(2);
    expect(r.totales.monto).toBe(10000);
  });

  it("un registro sin paseadorNombre cuenta para el dueño del cliente", () => {
    // Compatibilidad: los paseos viejos no guardaban quién lo hizo.
    const r = resumen({ "7_2026-08-17": { realizado: true } });
    expect(r.totales.realizados).toBe(1);
    expect(r.totales.monto).toBe(5000);
  });

  it("un día cancelado no cuenta como programado ni como faltante", () => {
    const r = resumen({ "7_2026-08-19": { cancelado: true } });
    expect(r.totales.programados).toBe(2);
    expect(r.filas[0].cancelados).toBe(1);
    expect(r.filas[0].faltantes).toBe(2);
  });

  it("un paseo movido hacia el rango cuenta aunque caiga en día no habitual", () => {
    // El martes 18 no es día habitual de este cliente.
    const r = resumen(
      { "7_2026-08-18": { realizado: true, paseadorNombre: CONSTANZA } },
      { reprogramaciones: [{ clienteId: "c7", fechaNueva: "2026-08-18" }] },
    );
    expect(r.totales.programados).toBe(4); // los 3 habituales + el movido
    expect(r.totales.monto).toBe(5000);
  });

  it("un paseo de su cliente hecho por OTRA persona no le suma nada", () => {
    const r = resumen({ "7_2026-08-17": { realizado: true, paseadorNombre: OTRO } });
    expect(r.totales.realizados).toBe(0);
    expect(r.totales.monto).toBe(0);
  });

  // EL BUG que motivó todo esto (commit 948329c). Finanzas le sumaba las
  // DOS partes del mismo paseo: la principal (porque el cliente es suyo)
  // y la compartida (porque el reparto la nombra a ella). Resultado: veía
  // más plata de la que Pago trabajadores le iba a pagar.
  it("un paseo de su cliente hecho por otro y compartido con ella paga SOLO su parte", () => {
    const r = resumen({
      "7_2026-08-17": { realizado: true, paseadorNombre: OTRO, compartidoCon: CONSTANZA, porcentajeCompartido: 40 },
    });
    expect(r.totales.monto).toBe(2000); // 40% de 5.000, no 5.000 ni 7.000
    expect(r.compartidos).toHaveLength(1);
    expect(r.totales.realizados).toBe(0); // el paseo no es suyo
  });

  it("si el paseo lo hizo ella y lo compartió, se queda con el resto", () => {
    const r = resumen({
      "7_2026-08-17": { realizado: true, paseadorNombre: CONSTANZA, compartidoCon: OTRO, porcentajeCompartido: 40 },
    });
    expect(r.totales.monto).toBe(3000); // el 60% que le queda
    expect(r.totales.realizados).toBe(1);
  });

  it("suma su parte de un paseo de un cliente ajeno", () => {
    const ajeno = { id: 9, _dbId: "c9", nombre: "Beto", paseadorNombre: OTRO, tarifaPaseador: 8000, diasHabituales: [0] };
    const r = resumen(
      { "9_2026-08-17": { realizado: true, paseadorNombre: OTRO, compartidoCon: CONSTANZA, porcentajeCompartido: 50 } },
      { clientes: [ajeno] },
    );
    expect(r.totales.monto).toBe(4000);
    expect(r.filas).toHaveLength(1); // solo su propio cliente en la tabla
  });

  it("no cuenta un paseo compartido fuera del rango de fechas", () => {
    const r = resumen({
      "7_2026-09-15": { realizado: true, paseadorNombre: OTRO, compartidoCon: CONSTANZA, porcentajeCompartido: 50 },
    });
    expect(r.totales.monto).toBe(0);
    expect(r.compartidos).toHaveLength(0);
  });
});

// Las fechas sueltas tienen que contar como paseos programados: son la
// unica forma de programar de un cliente sin dias fijos, y si no cuentan
// el paseador no cobra lo que si hizo.
describe("programadosEnRango con fechas sueltas", () => {
  const desde = new Date(2026, 8, 1);
  const hasta = new Date(2026, 8, 8); // exclusivo

  it("cuenta las fechas sueltas de un cliente sin días fijos", () => {
    const c = { id: 1, tipoServicio: ["paseos"], diasHabituales: [], diasPuntuales: ["2026-09-02", "2026-09-04"] };
    expect(programadosEnRango(c, desde, hasta, {})).toBe(2);
  });

  it("las suma a los días fijos sin duplicar", () => {
    // El 2 de septiembre de 2026 es miércoles (dow 2), o sea ya está en
    // los días fijos: no puede contarse dos veces.
    const c = { id: 1, tipoServicio: ["paseos"], diasHabituales: [2], diasPuntuales: ["2026-09-02"] };
    expect(programadosEnRango(c, desde, hasta, {})).toBe(1);
  });

  it("una fecha suelta cancelada no cuenta", () => {
    const c = { id: 1, tipoServicio: ["paseos"], diasHabituales: [], diasPuntuales: ["2026-09-02"] };
    expect(programadosEnRango(c, desde, hasta, { "1_2026-09-02": { cancelado: true } })).toBe(0);
  });

  it("un cliente pausado no tiene programados", () => {
    const c = { id: 1, tipoServicio: ["paseos"], estadoCliente: "pausado", diasHabituales: [2] };
    expect(programadosEnRango(c, desde, hasta, {})).toBe(0);
  });
});

// El caso que reportó Javier: el 2 de septiembre, un cliente que pagó 13
// paseos aparecía como "1/1" — correcto si se cuenta solo hasta hoy, pero
// no es lo que el paseador quiere saber. El compromiso del mes sale de la
// boleta; el conteo hasta hoy se queda para saber si va al día.
describe("resumenPaseadorEnRango — compromiso del mes y meta", () => {
  const CONSTANZA = "Constanza";
  // Lunes, miércoles y viernes a $5.000. Septiembre 2026 empieza martes.
  const suCliente = { id: 7, _dbId: "c7", nombre: "Ana", paseadorNombre: CONSTANZA, tarifaPaseador: 5000, diasHabituales: [0, 2, 4] };
  const INICIO_SEPT = new Date(2026, 8, 1);
  const FIN_SEPT = new Date(2026, 8, 30, 23, 59, 59);
  const HOY_DIA_2 = new Date(2026, 8, 2); // solo pasó el miércoles 2

  function resumen(extra = {}) {
    return resumenPaseadorEnRango({
      clientes: [suCliente],
      registroPaseos: extra.registroPaseos || {},
      boletas: extra.boletas || [],
      paseador: CONSTANZA,
      desde: INICIO_SEPT,
      hasta: HOY_DIA_2,
      hastaTotal: FIN_SEPT,
      mesBoleta: extra.mesBoleta === undefined ? "septiembre" : extra.mesBoleta,
      anioBoleta: 2026,
    });
  }

  const boletaDe13 = { clienteId: "c7", mes: "septiembre", anio: 2026, cantidad: 13, estado: "pendiente_pago" };

  it("el compromiso del mes sale de la boleta, no de los días corridos", () => {
    const r = resumen({ boletas: [boletaDe13] });
    expect(r.filas[0].cobrados).toBe(13);
    expect(r.filas[0].delMes).toBe(13);
    expect(r.totales.delMes).toBe(13);
  });

  it("el conteo hasta hoy sigue siendo aparte, para saber si va al día", () => {
    const r = resumen({ boletas: [boletaDe13] });
    // Del 1 al 2 de septiembre solo cae el miércoles 2.
    expect(r.filas[0].programados).toBe(1);
    expect(r.filas[0].delMes).toBe(13);
  });

  it("sin boleta del mes se cae al plan del mes completo, no a los días corridos", () => {
    const r = resumen();
    expect(r.filas[0].cobrados).toBeNull();
    // Septiembre 2026 tiene 13 lunes/miércoles/viernes.
    expect(r.filas[0].delMes).toBe(13);
    expect(r.filas[0].programados).toBe(1);
  });

  it("una boleta cancelada no compromete nada", () => {
    const r = resumen({ boletas: [{ ...boletaDe13, cantidad: 99, estado: "cancelada" }] });
    expect(r.filas[0].cobrados).toBeNull();
  });

  it("un borrador sí compromete — en Howria el flujo real es borrador a pagada", () => {
    const r = resumen({ boletas: [{ ...boletaDe13, estado: "no_enviada" }] });
    expect(r.filas[0].cobrados).toBe(13);
  });

  it("la boleta de otro mes no se toma", () => {
    const r = resumen({ boletas: [{ ...boletaDe13, mes: "agosto" }] });
    expect(r.filas[0].cobrados).toBeNull();
  });

  it("la meta es lo que va a ganar si hace todo lo comprometido", () => {
    const r = resumen({ boletas: [boletaDe13] });
    expect(r.totales.meta).toBe(13 * 5000);
  });

  it("fuera de un mes (semana o año) no se busca boleta y manda el plan", () => {
    const r = resumen({ boletas: [boletaDe13], mesBoleta: null });
    expect(r.filas[0].cobrados).toBeNull();
    expect(r.filas[0].delMes).toBe(13);
  });

  it("un día cancelado no infla el plan de respaldo", () => {
    const r = resumen({ registroPaseos: { "7_2026-09-04": { cancelado: true } } });
    expect(r.filas[0].delMes).toBe(12);
  });
});

// Bug encontrado al implementar el compromiso del mes: el conteo perdía el
// último día del mes cuando el rango cruzaba el cambio de hora de Chile.
// Es plata — un paseo menos en el total del paseador — y era silencioso.
describe("resumenPaseadorEnRango — cambio de hora de Chile", () => {
  const cli = { id: 7, _dbId: "c7", nombre: "Ana", paseadorNombre: "C", tarifaPaseador: 5000, diasHabituales: [0, 2, 4] };

  function delMesDe(anio, mes) {
    const ini = new Date(anio, mes, 1);
    const fin = new Date(anio, mes + 1, 0, 23, 59, 59);
    const r = resumenPaseadorEnRango({
      clientes: [cli], registroPaseos: {}, paseador: "C",
      desde: ini, hasta: ini, hastaTotal: fin,
    });
    return r.filas[0].delMes;
  }

  // Cuenta independiente, sin pasar por la función que se está probando.
  function realesDe(anio, mes) {
    let n = 0;
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    for (let d = 1; d <= ultimo; d++) {
      const f = new Date(anio, mes, d);
      if ([0, 2, 4].includes((f.getDay() + 6) % 7)) n++;
    }
    return n;
  }

  it("septiembre no pierde el último día cuando el reloj adelanta", () => {
    // El caso concreto: septiembre 2026 tenía 13 y devolvía 12, porque el
    // domingo 6 Chile adelanta una hora y el cursor arrastraba ese desfase.
    expect(delMesDe(2026, 8)).toBe(realesDe(2026, 8));
    expect(delMesDe(2026, 8)).toBe(13);
  });

  it("abril tampoco se descuadra cuando el reloj atrasa", () => {
    expect(delMesDe(2026, 3)).toBe(realesDe(2026, 3));
  });

  it("ningún mes del año se descuadra", () => {
    for (let mes = 0; mes < 12; mes++) {
      expect(delMesDe(2026, mes), `mes ${mes + 1} de 2026`).toBe(realesDe(2026, mes));
    }
  });
});
