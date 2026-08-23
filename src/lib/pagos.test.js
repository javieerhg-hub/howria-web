import { describe, it, expect } from "vitest";
import { programadosEnRango, realizadosEnRango, montoRealizadoEnRango } from "./pagos.js";

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
