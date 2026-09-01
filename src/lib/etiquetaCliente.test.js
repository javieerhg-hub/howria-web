import { describe, it, expect } from "vitest";
import { textoClienteEnLista, esClienteReciente } from "../HowriaAdmin.jsx";

// Cómo se lee un cliente dentro de un <select>. Se testea porque el
// límite de "reciente" es una fecha relativa a hoy: sin esto, un cambio
// en el cálculo no lo nota nadie hasta que en la lista dejan de salir los
// clientes nuevos.
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

describe("esClienteReciente", () => {
  it("marca al que entró hoy", () => {
    expect(esClienteReciente({ creadoEn: hace(0) })).toBe(true);
  });

  it("marca hasta el día 7", () => {
    expect(esClienteReciente({ creadoEn: hace(6.9) })).toBe(true);
  });

  it("ya no marca al de 8 días", () => {
    expect(esClienteReciente({ creadoEn: hace(8) })).toBe(false);
  });

  // Las fichas viejas no tienen created_at mapeado hasta que se recargan;
  // sin este caso, un undefined daría NaN y NaN <= 7 es false por suerte,
  // no por diseño.
  it("no marca al que no tiene fecha de ingreso", () => {
    expect(esClienteReciente({})).toBe(false);
    expect(esClienteReciente(null)).toBe(false);
  });
});

describe("textoClienteEnLista", () => {
  it("pone nombre, perro y tipo", () => {
    expect(textoClienteEnLista({ nombre: "Alejandra", perro: "Rio", tipoServicio: ["evaluacion"], creadoEn: hace(30) }))
      .toBe("Alejandra — Rio · Evaluación");
  });

  it("antepone la marca de nuevo", () => {
    expect(textoClienteEnLista({ nombre: "Beatriz", perro: "Kaiser", tipoServicio: ["paseos"], creadoEn: hace(2) }))
      .toBe("🆕 Beatriz — Kaiser · Paseos");
  });

  it("junta los dos servicios cuando el cliente hace ambos", () => {
    expect(textoClienteEnLista({ nombre: "Cata", perro: "Bruno", tipoServicio: ["paseos", "clases"], creadoEn: hace(30) }))
      .toBe("Cata — Bruno · Paseos y Clases");
  });

  it("sin tipo cuando la lista ya es de un solo servicio", () => {
    expect(textoClienteEnLista({ nombre: "Carla", perro: "Atenea", tipoServicio: ["paseos"], creadoEn: hace(30) }, { conTipo: false }))
      .toBe("Carla — Atenea");
  });

  it("aguanta un cliente sin perro y sin servicio", () => {
    expect(textoClienteEnLista({ nombre: "Ivonne" })).toBe("Ivonne");
  });
});
