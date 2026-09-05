// Las tres reglas de "qué hay que revisarle a este cliente". Ahora las
// comparten el aviso de Inicio, el de Coordinación y el filtro rápido de la
// lista de Clientes, así que un error acá se ve en tres lugares a la vez —
// y peor, se ve distinto en cada uno si alguna copia se desincroniza. Por
// eso hay una sola copia, y por eso está cubierta.
import { describe, it, expect } from "vitest";
import { sinDiasAsignados, sinBoletaEnElMes, conPaseosSinTarifa, cumpleRevision, FILTROS_REVISION } from "./revisiones.js";
import { fechaKey } from "./programacion.js";

const paseos = (extra = {}) => ({ id: 1, nombre: "Ana", perro: "Nube", tipoServicio: ["paseos"], estadoCliente: "activo", diasHabituales: [], diasPuntuales: [], ...extra });

describe("sinDiasAsignados", () => {
  it("un cliente de paseos activo sin ningún día marcado", () => {
    expect(sinDiasAsignados(paseos())).toBe(true);
  });

  it("con días habituales, o con fechas sueltas, ya aparece en el calendario", () => {
    expect(sinDiasAsignados(paseos({ diasHabituales: [1, 3] }))).toBe(false);
    expect(sinDiasAsignados(paseos({ diasPuntuales: ["2026-09-10"] }))).toBe(false);
  });

  it("los pausados y los de baja no cuentan: no se les programa a propósito", () => {
    expect(sinDiasAsignados(paseos({ estadoCliente: "pausado" }))).toBe(false);
    expect(sinDiasAsignados(paseos({ estadoCliente: "baja" }))).toBe(false);
  });

  it("un alumno de adiestramiento no tiene días de paseo que faltar", () => {
    expect(sinDiasAsignados(paseos({ tipoServicio: ["clases"] }))).toBe(false);
    expect(sinDiasAsignados(paseos({ tipoServicio: ["evaluacion"] }))).toBe(false);
  });

  it("sin tipoServicio guardado se trata como de paseos", () => {
    // Compatibilidad hacia atrás: antes de que existiera el campo, todo
    // cliente era de paseos. Si esto cambiara, los clientes viejos
    // desaparecerían del aviso sin que nadie lo note.
    expect(sinDiasAsignados(paseos({ tipoServicio: undefined }))).toBe(true);
    expect(sinDiasAsignados(paseos({ tipoServicio: [] }))).toBe(true);
  });
});

describe("sinBoletaEnElMes", () => {
  const sept = new Date(2026, 8, 15);
  const cliente = { id: 1, _dbId: "uuid-ana", nombre: "Ana" };

  it("sin ninguna boleta, falta", () => {
    expect(sinBoletaEnElMes(cliente, [], sept)).toBe(true);
  });

  it("con una boleta de este mes, no falta", () => {
    const b = [{ clienteId: "uuid-ana", fechaISO: new Date(2026, 8, 3).toISOString() }];
    expect(sinBoletaEnElMes(cliente, b, sept)).toBe(false);
  });

  it("una boleta del mes pasado no salva el mes en curso", () => {
    const b = [{ clienteId: "uuid-ana", fechaISO: new Date(2026, 7, 30).toISOString() }];
    expect(sinBoletaEnElMes(cliente, b, sept)).toBe(true);
  });

  it("ni una del mismo mes del año pasado", () => {
    const b = [{ clienteId: "uuid-ana", fechaISO: new Date(2025, 8, 3).toISOString() }];
    expect(sinBoletaEnElMes(cliente, b, sept)).toBe(true);
  });

  it("la boleta de otro cliente no cuenta", () => {
    const b = [{ clienteId: "uuid-otro", fechaISO: new Date(2026, 8, 3).toISOString() }];
    expect(sinBoletaEnElMes(cliente, b, sept)).toBe(true);
  });

  it("las boletas viejas calzan por nombre, que es como se guardaron", () => {
    // Antes de que existiera cliente_id la boleta solo traía el nombre.
    const b = [{ cliente: "Ana", fechaISO: new Date(2026, 8, 3).toISOString() }];
    expect(sinBoletaEnElMes(cliente, b, sept)).toBe(false);
  });
});

describe("conPaseosSinTarifa", () => {
  const hoy = new Date(2026, 8, 20);
  const conTarifaCero = { id: 7, paseadorNombre: "Beatriz", tarifaPaseador: 0 };
  const unPaseoEl = (d) => ({ [`7_${fechaKey(new Date(2026, 8, d))}`]: { realizado: true } });

  it("paseador asignado, tarifa en $0 y paseos ya hechos este mes", () => {
    expect(conPaseosSinTarifa(conTarifaCero, unPaseoEl(4), hoy)).toBe(true);
  });

  it("un cliente recién cargado, sin paseos todavía, no es un problema", () => {
    expect(conPaseosSinTarifa(conTarifaCero, {}, hoy)).toBe(false);
  });

  it("con tarifa puesta, no avisa", () => {
    expect(conPaseosSinTarifa({ ...conTarifaCero, tarifaPaseador: 5000 }, unPaseoEl(4), hoy)).toBe(false);
  });

  it("sin paseador asignado tampoco: no hay a quién pagarle de menos", () => {
    expect(conPaseosSinTarifa({ ...conTarifaCero, paseadorNombre: "" }, unPaseoEl(4), hoy)).toBe(false);
  });

  it("un paseo del mes pasado no cuenta", () => {
    const agosto = { [`7_${fechaKey(new Date(2026, 7, 20))}`]: { realizado: true } };
    expect(conPaseosSinTarifa(conTarifaCero, agosto, hoy)).toBe(false);
  });

  it("un paseo cancelado no cuenta como hecho", () => {
    const cancelado = { [`7_${fechaKey(new Date(2026, 8, 4))}`]: { cancelado: true } };
    expect(conPaseosSinTarifa(conTarifaCero, cancelado, hoy)).toBe(false);
  });

  it("encuentra el paseo cualquier día del mes, incluso en el cambio de hora", () => {
    // Chile cambia la hora el primer domingo de septiembre. Un cursor
    // anclado a medianoche se salta un día al cruzarlo, y ese día el aviso
    // no vería el paseo. Mismo bug que ya apareció en lib/pagos.js.
    const finDeMes = new Date(2026, 8, 30);
    for (let d = 1; d <= 30; d++) {
      expect(conPaseosSinTarifa(conTarifaCero, unPaseoEl(d), finDeMes), `no encontró el paseo del ${d} de septiembre`).toBe(true);
    }
  });
});

describe("cumpleRevision", () => {
  it("cada filtro de la lista tiene su regla", () => {
    // Un id sin regla devuelve true y el filtro no filtra nada: la lista se
    // ve igual que sin tocar la pastilla, sin ningún error.
    const cliente = paseos();
    for (const f of FILTROS_REVISION) {
      const r = cumpleRevision(f.id, cliente, { boletas: [], registroPaseos: {}, fecha: new Date(2026, 8, 20) });
      expect(typeof r, `"${f.id}" no devuelve un booleano`).toBe("boolean");
    }
  });

  it("los tres filtros tienen etiqueta, y solo los de paseo se marcan como tales", () => {
    for (const f of FILTROS_REVISION) expect(f.etiqueta).toBeTruthy();
    expect(FILTROS_REVISION.find((f) => f.id === "sin-boleta").soloPaseos).toBe(false);
    expect(FILTROS_REVISION.find((f) => f.id === "sin-dias").soloPaseos).toBe(true);
    expect(FILTROS_REVISION.find((f) => f.id === "tarifa-cero").soloPaseos).toBe(true);
  });
});
