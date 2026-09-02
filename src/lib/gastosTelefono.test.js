// El parseo del monto que llega desde el iPhone. Son pesos: equivocarse
// acá no es un detalle de formato, es cobrar 100 veces de más o de menos
// en un gasto. Por eso está cubierto antes de que llegue el primer gasto
// de verdad.
import { describe, it, expect } from "vitest";
import { parsearMonto, parsearComercio } from "../../api/gastos.js";

describe("parsearMonto", () => {
  it("un número entero pasa tal cual", () => {
    expect(parsearMonto(600)).toBe(600);
    expect(parsearMonto("600")).toBe(600);
  });

  it("ignora el signo peso y los espacios", () => {
    expect(parsearMonto("$600")).toBe(600);
    expect(parsearMonto("$ 1.234")).toBe(1234);
    expect(parsearMonto("CLP 7.500")).toBe(7500);
  });

  it("el punto es separador de miles, no decimal", () => {
    // El error clásico: leer 1.234 como 1,234 pesos.
    expect(parsearMonto("$1.234")).toBe(1234);
    expect(parsearMonto("$12.500")).toBe(12500);
    expect(parsearMonto("$1.234.567")).toBe(1234567);
  });

  it("descarta los centavos si vinieran", () => {
    // El otro error caro: leer 600.00 como 60.000.
    expect(parsearMonto("$600.00")).toBe(600);
    expect(parsearMonto("600,00")).toBe(600);
    expect(parsearMonto("$1.234,56")).toBe(1234);
    expect(parsearMonto("$1,234.56")).toBe(1234);
  });

  it("saca el monto de una frase suelta", () => {
    expect(parsearMonto("Compraste $600 en EL CERRO")).toBe(600);
    expect(parsearMonto("$8.990 en Jumbo con tu Débito")).toBe(8990);
  });

  it("una devolución se guarda como monto positivo", () => {
    // El signo se pierde a propósito: la bandeja es de gastos, y un
    // negativo colado ahí restaría del total sin que se note.
    expect(parsearMonto("-$600")).toBe(600);
    expect(parsearMonto(-600)).toBe(600);
  });

  it("sin número devuelve null y el gasto se rechaza", () => {
    expect(parsearMonto("")).toBeNull();
    expect(parsearMonto("compra en el cerro")).toBeNull();
    expect(parsearMonto(null)).toBeNull();
    expect(parsearMonto(undefined)).toBeNull();
  });
});

describe("parsearComercio", () => {
  it("saca el comercio de una frase con monto", () => {
    expect(parsearComercio("Compraste $600 en EL CERRO SPA")).toBe("CERRO SPA");
    expect(parsearComercio("$8.990 en Jumbo")).toBe("Jumbo");
  });

  it("si al quitar el monto no queda nada legible, devuelve el texto completo", () => {
    // Una descripción fea es mejor que una vacía: igual la va a mirar
    // una persona antes de que el gasto cuente.
    expect(parsearComercio("$600")).toBe("$600");
  });

  it("no se cae con vacío", () => {
    expect(parsearComercio("")).toBe("");
    expect(parsearComercio(null)).toBe("");
  });
});
