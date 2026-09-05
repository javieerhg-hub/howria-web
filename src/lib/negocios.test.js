// A qué negocio pertenece un cliente. La regla se usa en Clientes (parte
// la lista en dos vistas) y en Boletas (a quién se le puede emitir una
// boleta de adiestramiento). Estaba escrita dos veces y las dos copias se
// habían separado: la de Boletas pedía solo "clases", así que a alguien
// que entró pidiendo una evaluación no se le podía cobrar esa evaluación.
import { describe, it, expect } from "vitest";
import { esClienteDePaseos, esClienteDeAdiestramiento } from "./negocios.js";

const con = (...tipos) => ({ nombre: "X", tipoServicio: tipos });

describe("esClienteDeAdiestramiento", () => {
  it("un alumno de clases", () => {
    expect(esClienteDeAdiestramiento(con("clases"))).toBe(true);
  });

  it("alguien que solo pidió una evaluación TAMBIÉN entra", () => {
    // Es el caso que originó todo esto: la evaluación es la puerta de
    // entrada al adiestramiento y se cobra igual que una clase.
    expect(esClienteDeAdiestramiento(con("evaluacion"))).toBe(true);
  });

  it("un cliente de solo paseos no", () => {
    expect(esClienteDeAdiestramiento(con("paseos"))).toBe(false);
  });

  it("uno que hace las dos cosas entra en los dos negocios", () => {
    const mixto = con("paseos", "clases");
    expect(esClienteDeAdiestramiento(mixto)).toBe(true);
    expect(esClienteDePaseos(mixto)).toBe(true);
  });

  it("sin tipoServicio no es de adiestramiento", () => {
    // Al revés que en paseos, donde la lista vacía se trata como "paseos"
    // por compatibilidad hacia atrás (ver lib/programacion.js): un cliente
    // viejo sin el campo nunca fue alumno.
    expect(esClienteDeAdiestramiento({})).toBe(false);
    expect(esClienteDeAdiestramiento(con())).toBe(false);
  });

  it("no se cae con null", () => {
    expect(esClienteDeAdiestramiento(null)).toBe(false);
    expect(esClienteDePaseos(null)).toBe(false);
  });
});

describe("esClienteDePaseos", () => {
  it("solo si tiene paseos marcado", () => {
    expect(esClienteDePaseos(con("paseos"))).toBe(true);
    expect(esClienteDePaseos(con("clases"))).toBe(false);
    expect(esClienteDePaseos(con("evaluacion"))).toBe(false);
  });
});
