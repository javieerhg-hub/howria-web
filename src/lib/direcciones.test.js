// El enlace a Google Maps de la dirección de un cliente. Lo usa sobre todo
// el paseador, en la calle: si la URL sale mal, se entera parado en la
// vereda equivocada.
import { describe, it, expect } from "vitest";
import { consultaDeDireccion, urlGoogleMaps } from "./direcciones.js";

describe("consultaDeDireccion", () => {
  it("agrega comuna y país", () => {
    expect(consultaDeDireccion("Los Leones 100", "Providencia")).toBe("Los Leones 100, Providencia, Chile");
  });

  it("sin comuna asume Santiago, igual que el geocodificador del mapa", () => {
    // Tiene que coincidir con geocodificarDireccion en MapaRutas.jsx, o el
    // enlace y el pin del mapa apuntarían a lugares distintos.
    expect(consultaDeDireccion("Los Leones 100")).toBe("Los Leones 100, Santiago, Chile");
    expect(consultaDeDireccion("Los Leones 100", "   ")).toBe("Los Leones 100, Santiago, Chile");
  });

  it("sin dirección no hay consulta que hacer", () => {
    expect(consultaDeDireccion("")).toBeNull();
    expect(consultaDeDireccion("   ")).toBeNull();
    expect(consultaDeDireccion(null)).toBeNull();
    expect(consultaDeDireccion(undefined)).toBeNull();
  });
});

describe("urlGoogleMaps", () => {
  it("arma el formato universal, que en el celular abre la app", () => {
    const url = urlGoogleMaps("Los Leones 100", "Providencia");
    expect(url.startsWith("https://www.google.com/maps/search/?api=1&query=")).toBe(true);
  });

  it("escapa lo que rompería la URL", () => {
    // Direcciones reales traen #, & y tildes: "Av. Ñuñoa 1200 depto #5B".
    const url = urlGoogleMaps("Av. Ñuñoa 1200 depto #5B", "Ñuñoa");
    expect(url).not.toContain("#");
    expect(url).not.toContain(" ");
    expect(decodeURIComponent(url.split("query=")[1])).toBe("Av. Ñuñoa 1200 depto #5B, Ñuñoa, Chile");
  });

  it("sin dirección devuelve null y no se dibuja un enlace muerto", () => {
    expect(urlGoogleMaps("")).toBeNull();
    expect(urlGoogleMaps(null, "Providencia")).toBeNull();
  });
});
