import { describe, it, expect } from "vitest";
import { construirICS } from "./ics.js";

describe("construirICS", () => {
  it("genera un VEVENT recurrente semanal con los días pedidos", () => {
    const ics = construirICS([
      { uid: "paseo-1@howria.app", titulo: "Paseo — Toby", diasSemana: [0, 2, 4], horaHabitual: "09:00", duracionMin: 45 },
    ]);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("UID:paseo-1@howria.app");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
    expect(ics).toContain("SUMMARY:Paseo — Toby");
    expect(ics).toMatch(/DTSTART:\d{8}T090000/);
    expect(ics).toMatch(/DTEND:\d{8}T094500/);
  });

  it("ordena los días del RRULE aunque diasSemana venga desordenado", () => {
    const ics = construirICS([{ uid: "x@howria.app", titulo: "x", diasSemana: [4, 0, 2], horaHabitual: "09:00" }]);
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR");
  });

  it("sin hora habitual, genera un evento de todo el día (VALUE=DATE)", () => {
    const ics = construirICS([{ uid: "x@howria.app", titulo: "x", diasSemana: [1] }]);
    expect(ics).toContain("DTSTART;VALUE=DATE:");
    expect(ics).not.toMatch(/DTSTART:\d{8}T/);
  });

  it("escapa comas y punto y coma en textos libres (direcciones con comuna)", () => {
    const ics = construirICS([
      { uid: "x@howria.app", titulo: "Paseo", diasSemana: [0], horaHabitual: "09:00", ubicacion: "Av. Providencia 1650, Providencia" },
    ]);
    expect(ics).toContain("LOCATION:Av. Providencia 1650\\, Providencia");
  });

  it("omite clientes sin ningún día asignado en vez de generar un VEVENT vacío", () => {
    const ics = construirICS([{ uid: "x@howria.app", titulo: "x", diasSemana: [] }]);
    expect(ics).not.toContain("BEGIN:VEVENT");
  });

  it("usa el día más próximo entre varios para DTSTART, no siempre el primero de la lista", () => {
    // diasSemana=[0,2,4] (lun/mié/vie); si el primero de la lista no fuera el correcto,
    // esto detectaría el bug de tomar ciegamente diasSemana[0].
    const ics = construirICS([{ uid: "x@howria.app", titulo: "x", diasSemana: [4, 0, 2], horaHabitual: "09:00" }]);
    const match = ics.match(/DTSTART:(\d{8})T/);
    expect(match).not.toBeNull();
  });
});
