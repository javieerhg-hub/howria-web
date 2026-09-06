// Los dos recordatorios automáticos (api/recordatorios.js). Lo que se
// prueba acá es la zona horaria, que es lo único que puede fallar en
// silencio: si la ventana se corre una hora, el aviso de "sal a tu ruta"
// llega a las 7:30 o no llega, y nadie se entera hasta que alguien
// reclama.
//
// El diseño que estos tests fijan: los crons de Vercel corren SIEMPRE en
// UTC, y Chile cambia la hora dos veces al año. Por eso hay dos crons por
// horario —uno por temporada— y solo el que cae dentro de la ventana de
// Chile hace algo.
import { describe, it, expect } from "vitest";
import { fechaDeChile, horaDeChile, MOMENTOS } from "../../api/recordatorios.js";

// Verano chileno (UTC-3) e invierno (UTC-4). El cambio es el primer
// domingo de septiembre y el primero de abril.
const VERANO = "2026-12-15";
const INVIERNO = "2026-07-15";
const enVentana = (momento, iso) => MOMENTOS[momento].horas.includes(horaDeChile(new Date(iso)));

describe("la hora de Chile, no la del servidor", () => {
  it("en verano Chile va 3 horas atrás de UTC", () => {
    expect(horaDeChile(new Date(`${VERANO}T11:30:00Z`))).toBe(8);
  });

  it("en invierno va 4 horas atrás", () => {
    expect(horaDeChile(new Date(`${INVIERNO}T11:30:00Z`))).toBe(7);
  });
});

describe("el cron de la mañana cae en la ventana en las dos temporadas", () => {
  it("verano: el cron de las 11:30 UTC llega a las 8:30 de Chile", () => {
    expect(enVentana("manana", `${VERANO}T11:30:00Z`)).toBe(true);
  });

  it("invierno: el que sirve es el de las 12:30 UTC", () => {
    expect(enVentana("manana", `${INVIERNO}T12:30:00Z`)).toBe(true);
  });

  it("y el cron de la temporada equivocada NO manda en invierno", () => {
    // 11:30 UTC en invierno son las 7:30 de Chile: una hora antes de que
    // nadie salga. Sin esta guarda, medio año el aviso llegaría temprano.
    expect(enVentana("manana", `${INVIERNO}T11:30:00Z`)).toBe(false);
  });

  it("el margen de ±59 min de Vercel sigue cayendo dentro", () => {
    // "a cron job configured as 0 1 *** will trigger anywhere between
    // 1:00 am and 1:59 am" — el peor caso del cron correcto en verano.
    expect(enVentana("manana", `${VERANO}T12:29:00Z`)).toBe(true);
  });
});

describe("el cron de la tarde", () => {
  it("verano: 21:00 UTC son las 18:00 de Chile", () => {
    expect(enVentana("tarde", `${VERANO}T21:00:00Z`)).toBe(true);
  });

  it("invierno: el que sirve es el de las 22:00 UTC", () => {
    expect(enVentana("tarde", `${INVIERNO}T22:00:00Z`)).toBe(true);
  });

  it("acá las ventanas NO se pisan entre temporadas", () => {
    // En verano el cron de invierno cae a las 19; en invierno el de verano
    // cae a las 17. Ninguno entra, así que ni siquiera hace falta la
    // reserva del día para este horario.
    expect(enVentana("tarde", `${VERANO}T22:00:00Z`)).toBe(false);
    expect(enVentana("tarde", `${INVIERNO}T21:00:00Z`)).toBe(false);
  });
});

describe("la fecha es la de Chile, no la del servidor", () => {
  it("a las 23:00 de Chile el servidor ya está en el día siguiente", () => {
    // 2026-09-07 02:00 UTC = 2026-09-06 23:00 en Chile. Si se usara la
    // fecha del servidor, el aviso de la tarde miraría los paseos del día
    // equivocado — y en la práctica no encontraría ninguno.
    expect(fechaDeChile(new Date("2026-09-07T02:00:00Z"))).toBe("2026-09-06");
  });

  it("a las 9 de la mañana de Chile los dos coinciden", () => {
    expect(fechaDeChile(new Date("2026-09-07T12:00:00Z"))).toBe("2026-09-07");
  });
});

describe("los textos", () => {
  it("hablan en singular cuando es uno solo", () => {
    expect(MOMENTOS.manana.cuerpo(1)).toContain("1 paseo hoy");
    expect(MOMENTOS.tarde.cuerpo(1)).toContain("queda 1 paseo");
  });

  it("y en plural cuando son varios", () => {
    expect(MOMENTOS.manana.cuerpo(4)).toContain("4 paseos hoy");
    expect(MOMENTOS.tarde.cuerpo(4)).toContain("quedan 4 paseos");
  });
});
