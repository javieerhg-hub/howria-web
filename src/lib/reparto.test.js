import { describe, it, expect } from "vitest";
import { montoPrincipal, montoCompartido } from "./reparto.js";

describe("montoPrincipal", () => {
  it("sin reparto, el principal se queda con el total", () => {
    expect(montoPrincipal(10000, { compartidoCon: null })).toBe(10000);
    expect(montoPrincipal(10000, {})).toBe(10000);
    expect(montoPrincipal(10000, undefined)).toBe(10000);
  });

  it("con reparto 50/50, al principal le queda la mitad", () => {
    expect(montoPrincipal(10000, { compartidoCon: "Ana", porcentajeCompartido: 50 })).toBe(5000);
  });

  it("con reparto 70/30, al principal le queda el 30% (el resto del porcentaje)", () => {
    expect(montoPrincipal(10000, { compartidoCon: "Ana", porcentajeCompartido: 70 })).toBe(3000);
  });

  it("si compartidoCon existe pero no viene el porcentaje, asume 50", () => {
    expect(montoPrincipal(10000, { compartidoCon: "Ana" })).toBe(5000);
  });
});

describe("montoCompartido", () => {
  it("sin reparto, quien ayudó no se lleva nada", () => {
    expect(montoCompartido(10000, { compartidoCon: null })).toBe(0);
    expect(montoCompartido(10000, {})).toBe(0);
  });

  it("con reparto 50/50, a quien ayudó le toca la mitad", () => {
    expect(montoCompartido(10000, { compartidoCon: "Ana", porcentajeCompartido: 50 })).toBe(5000);
  });

  it("con reparto 70/30, a quien ayudó le toca el 70%", () => {
    expect(montoCompartido(10000, { compartidoCon: "Ana", porcentajeCompartido: 70 })).toBe(7000);
  });

  it("montoPrincipal + montoCompartido siempre suman el total, con cualquier porcentaje", () => {
    for (const pct of [1, 25, 50, 75, 99]) {
      const registro = { compartidoCon: "Ana", porcentajeCompartido: pct };
      expect(montoPrincipal(8543, registro) + montoCompartido(8543, registro)).toBeCloseTo(8543, 8);
    }
  });
});
