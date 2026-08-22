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
