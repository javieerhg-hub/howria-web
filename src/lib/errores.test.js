// El freno del reportador de errores. Es la parte que puede hacer daño:
// un error dentro de un render se dispara en bucle, así que sin tope y sin
// deduplicación una sola pantalla rota llena la tabla en segundos — y la
// tabla se descarga entera cada vez que el administrador abre Usuarios.
//
// `registrarError` no se prueba acá porque escribe en Supabase; lo que se
// prueba es la decisión de si mandar o no, que es donde vive el riesgo.
import { describe, it, expect, beforeEach } from "vitest";
import {
  recortar, firmaDeError, debeReportarse, reiniciarReporteDeErrores,
  MAX_POR_SESION, LARGO_MENSAJE,
} from "./errores.js";

// El contador de enviados solo lo mueve registrarError, así que para
// probar el tope se simula igual que lo haría él.
import { registrarError } from "./errores.js";

beforeEach(() => reiniciarReporteDeErrores());

describe("recortar", () => {
  it("deja corto lo que ya es corto", () => {
    expect(recortar("Error simple", 100)).toBe("Error simple");
  });

  it("corta lo largo y lo marca con puntos suspensivos", () => {
    const largo = "x".repeat(500);
    const r = recortar(largo, 300);
    expect(r).toHaveLength(301);
    expect(r.endsWith("…")).toBe(true);
  });

  it("no se cae con null ni undefined", () => {
    expect(recortar(null, 10)).toBe("");
    expect(recortar(undefined, 10)).toBe("");
  });
});

describe("firmaDeError", () => {
  it("el mismo mensaje en la misma pantalla es el mismo error", () => {
    expect(firmaDeError("Boom", "finanzas")).toBe(firmaDeError("Boom", "finanzas"));
  });

  it("el mismo mensaje en otra pantalla es otro error", () => {
    expect(firmaDeError("Boom", "finanzas")).not.toBe(firmaDeError("Boom", "clientes"));
  });

  it("dos mensajes que solo difieren después del corte cuentan como uno", () => {
    // Es lo que se quiere: un mensaje kilométrico que cambia solo al final
    // (un id, un timestamp) no debería contar como un error nuevo cada vez.
    const a = "y".repeat(LARGO_MENSAJE) + "AAA";
    const b = "y".repeat(LARGO_MENSAJE) + "BBB";
    expect(firmaDeError(a, "x")).toBe(firmaDeError(b, "x"));
  });
});

describe("debeReportarse", () => {
  it("un error normal se reporta", () => {
    expect(debeReportarse("Algo se rompió", "finanzas")).toBe(true);
  });

  it("un mensaje vacío no", () => {
    expect(debeReportarse("", "finanzas")).toBe(false);
    expect(debeReportarse("   ", "finanzas")).toBe(false);
    expect(debeReportarse(null, "finanzas")).toBe(false);
  });

  it("el mismo error dos veces se manda una sola", () => {
    // El caso real: un error en el render vuelve a dispararse en cada
    // intento de dibujar, decenas de veces por segundo.
    registrarError("Se rompió al dibujar", null, "coordinacion");
    expect(debeReportarse("Se rompió al dibujar", "coordinacion")).toBe(false);
  });

  it("el mismo mensaje en otra pantalla sí es nuevo", () => {
    registrarError("Cannot read properties of undefined", null, "coordinacion");
    expect(debeReportarse("Cannot read properties of undefined", "clientes")).toBe(true);
  });

  it("después del tope por sesión ya no se manda nada", () => {
    for (let i = 0; i < MAX_POR_SESION; i++) registrarError(`Error distinto ${i}`, null, "finanzas");
    expect(debeReportarse("Uno completamente nuevo", "finanzas")).toBe(false);
  });

  it("justo antes del tope todavía entra uno", () => {
    for (let i = 0; i < MAX_POR_SESION - 1; i++) registrarError(`Error distinto ${i}`, null, "finanzas");
    expect(debeReportarse("El último que cabe", "finanzas")).toBe(true);
  });
});

describe("registrarError", () => {
  it("no tira nunca, pase lo que pase", () => {
    // La regla número uno: un reportador de errores que tira errores es
    // peor que ninguno — el handler global lo volvería a atrapar y se
    // quedaría dando vueltas.
    expect(() => registrarError(null, null, null)).not.toThrow();
    expect(() => registrarError(undefined, undefined, undefined)).not.toThrow();
    expect(() => registrarError({ raro: true }, [1, 2], 42)).not.toThrow();
  });
});
