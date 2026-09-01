import { describe, it, expect } from "vitest";
import { fechaKey, estaProgramadoEnFecha } from "./HowriaAdmin.jsx";

describe("fechaKey", () => {
  it("arma YYYY-MM-DD en hora LOCAL, no UTC", () => {
    expect(fechaKey(new Date(2026, 7, 19))).toBe("2026-08-19");
  });

  it("rellena con cero el mes y el día de un dígito", () => {
    expect(fechaKey(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("entrada de la noche sigue siendo el mismo día local (regresión del bug de zona horaria ya corregido — el 'día' de la app rodaba temprano usando cálculos en UTC)", () => {
    const tarde = new Date(2026, 7, 19, 23, 30); // 19 de agosto, 23:30 hora local
    expect(fechaKey(tarde)).toBe("2026-08-19");
  });
});

describe("estaProgramadoEnFecha", () => {
  const miercoles = new Date(2026, 7, 19); // miércoles 19 de agosto 2026 — dow=2 (0=lunes)

  it("true si el día de la semana está en diasHabituales", () => {
    const cliente = { _dbId: "abc", diasHabituales: [2] };
    expect(estaProgramadoEnFecha(cliente, miercoles, [])).toBe(true);
  });

  it("false si el día no está en diasHabituales y no hay reprogramación", () => {
    const cliente = { _dbId: "abc", diasHabituales: [0, 4] }; // lunes y viernes
    expect(estaProgramadoEnFecha(cliente, miercoles, [])).toBe(false);
  });

  it("true si no es día habitual pero hay una reprogramación a esa fecha para ese cliente", () => {
    const cliente = { _dbId: "abc", diasHabituales: [0] };
    const reprogramaciones = [{ clienteId: "abc", fechaNueva: "2026-08-19" }];
    expect(estaProgramadoEnFecha(cliente, miercoles, reprogramaciones)).toBe(true);
  });

  it("una reprogramación de OTRO cliente no cuenta", () => {
    const cliente = { _dbId: "abc", diasHabituales: [0] };
    const reprogramaciones = [{ clienteId: "otro-cliente", fechaNueva: "2026-08-19" }];
    expect(estaProgramadoEnFecha(cliente, miercoles, reprogramaciones)).toBe(false);
  });

  it("una reprogramación a otra fecha no cuenta", () => {
    const cliente = { _dbId: "abc", diasHabituales: [0] };
    const reprogramaciones = [{ clienteId: "abc", fechaNueva: "2026-08-20" }];
    expect(estaProgramadoEnFecha(cliente, miercoles, reprogramaciones)).toBe(false);
  });

  it("false para un cliente solo de adiestramiento (tipoServicio sin 'paseos'), aunque tenga diasHabituales guardados", () => {
    const cliente = { _dbId: "abc", diasHabituales: [2], tipoServicio: ["clases"] };
    expect(estaProgramadoEnFecha(cliente, miercoles, [])).toBe(false);
  });

  it("true para un cliente que SÍ incluye 'paseos' en tipoServicio, junto con otros servicios", () => {
    const cliente = { _dbId: "abc", diasHabituales: [2], tipoServicio: ["paseos", "clases"] };
    expect(estaProgramadoEnFecha(cliente, miercoles, [])).toBe(true);
  });

  it("true para un cliente sin tipoServicio guardado (compatibilidad hacia atrás, se trata como paseos)", () => {
    const cliente = { _dbId: "abc", diasHabituales: [2], tipoServicio: [] };
    expect(estaProgramadoEnFecha(cliente, miercoles, [])).toBe(true);
  });
});

describe("estaProgramadoEnFecha y el estado del cliente", () => {
  const miercoles = new Date(2026, 8, 2); // 2 de septiembre de 2026
  const base = { _dbId: "x", tipoServicio: ["paseos"], diasHabituales: [2] };

  it("un cliente activo con ese día sí tiene paseo", () => {
    expect(estaProgramadoEnFecha({ ...base, estadoCliente: "activo" }, miercoles, [])).toBe(true);
  });

  // Los días habituales se conservan a proposito para cuando vuelva, asi
  // que el estado es lo unico que lo saca de la lista.
  it("uno pausado no, aunque conserve sus días", () => {
    expect(estaProgramadoEnFecha({ ...base, estadoCliente: "pausado" }, miercoles, [])).toBe(false);
  });

  it("uno dado de baja tampoco", () => {
    expect(estaProgramadoEnFecha({ ...base, estadoCliente: "baja" }, miercoles, [])).toBe(false);
  });

  // Las fichas viejas no tienen el campo: se tratan como activas.
  it("sin estado guardado se trata como activo", () => {
    expect(estaProgramadoEnFecha(base, miercoles, [])).toBe(true);
  });
});

describe("días puntuales", () => {
  const miercoles = new Date(2026, 8, 2); // 2 de septiembre de 2026
  const jueves = new Date(2026, 8, 3);

  // El caso de Chascona: sin dias fijos, solo fechas que avisa el tutor.
  it("un cliente sin días fijos aparece en su fecha puntual", () => {
    const c = { _dbId: "x", tipoServicio: ["paseos"], diasHabituales: [], diasPuntuales: ["2026-09-02"] };
    expect(estaProgramadoEnFecha(c, miercoles, [])).toBe(true);
    expect(estaProgramadoEnFecha(c, jueves, [])).toBe(false);
  });

  // Un cliente puede tener las dos cosas: sus dias de siempre y un extra.
  it("convive con los días fijos", () => {
    const c = { _dbId: "x", tipoServicio: ["paseos"], diasHabituales: [3], diasPuntuales: ["2026-09-02"] };
    expect(estaProgramadoEnFecha(c, miercoles, [])).toBe(true); // por la fecha suelta
    expect(estaProgramadoEnFecha(c, jueves, [])).toBe(true); // por el día fijo
  });

  it("un pausado con fechas puntuales tampoco se programa", () => {
    const c = { _dbId: "x", tipoServicio: ["paseos"], estadoCliente: "pausado", diasPuntuales: ["2026-09-02"] };
    expect(estaProgramadoEnFecha(c, miercoles, [])).toBe(false);
  });
});
