import { describe, it, expect } from "vitest";
import { contarPerros } from "../HowriaAdmin.jsx";
import { hayChoqueHorario } from "./_compartido.jsx";

const BASE = "2026-08-19T10:00:00.000Z"; // miércoles 19 de agosto, 10:00

describe("hayChoqueHorario", () => {
  it("sin citas, no hay choque", () => {
    expect(hayChoqueHorario([], "Ana", BASE)).toBe(false);
  });

  it("mismo horario exacto, mismo adiestrador, cita pendiente -> choque", () => {
    const citas = [{ adiestrador: "Ana", estado: "pendiente", fechaISO: BASE, duracionMin: 60 }];
    expect(hayChoqueHorario(citas, "Ana", BASE, 60)).toBe(true);
  });

  it("mismo horario pero de OTRO adiestrador -> sin choque", () => {
    const citas = [{ adiestrador: "Beto", estado: "pendiente", fechaISO: BASE, duracionMin: 60 }];
    expect(hayChoqueHorario(citas, "Ana", BASE, 60)).toBe(false);
  });

  it("citas canceladas, rechazadas o ya realizadas no cuentan aunque se superpongan", () => {
    const citas = [
      { adiestrador: "Ana", estado: "cancelada", fechaISO: BASE, duracionMin: 60 },
      { adiestrador: "Ana", estado: "rechazada", fechaISO: BASE, duracionMin: 60 },
      { adiestrador: "Ana", estado: "realizada", fechaISO: BASE, duracionMin: 60 },
    ];
    expect(hayChoqueHorario(citas, "Ana", BASE, 60)).toBe(false);
  });

  it("horarios consecutivos, sin superposición -> sin choque", () => {
    // existente 9:00-10:00, nueva 10:00-11:00: terminan/empiezan justo, no se pisan
    const citas = [{ adiestrador: "Ana", estado: "agendada", fechaISO: "2026-08-19T09:00:00.000Z", duracionMin: 60 }];
    expect(hayChoqueHorario(citas, "Ana", BASE, 60)).toBe(false);
  });

  it("superposición parcial -> choque", () => {
    // existente 9:30-10:30, nueva 10:00-11:00: se pisan entre 10:00 y 10:30
    const citas = [{ adiestrador: "Ana", estado: "agendada", fechaISO: "2026-08-19T09:30:00.000Z", duracionMin: 60 }];
    expect(hayChoqueHorario(citas, "Ana", BASE, 60)).toBe(true);
  });

  it("respeta una duración distinta a los 60 minutos por defecto", () => {
    // nueva de 30 min: 10:00-10:30; existente 10:45-11:15 -> no se pisan
    const citas = [{ adiestrador: "Ana", estado: "agendada", fechaISO: "2026-08-19T10:45:00.000Z", duracionMin: 30 }];
    expect(hayChoqueHorario(citas, "Ana", BASE, 30)).toBe(false);
  });
});

// El conteo de perros sale de un texto libre, asi que conviene fijarlo:
// de el depende si un turno se ve lleno o vacio.
describe("contarPerros", () => {
  it("un perro es uno", () => {
    expect(contarPerros("Benito")).toBe(1);
  });

  it("separa por coma y por 'y'", () => {
    expect(contarPerros("Billy, Taffy y Nala")).toBe(3);
    expect(contarPerros("Bruno, Lobi y Choqui")).toBe(3);
  });

  it("aguanta el ampersand", () => {
    expect(contarPerros("Willy & Antonio")).toBe(2);
  });

  // Un nombre con "y" adentro no debe partirse: "Maya" no son dos perros.
  it("no parte un nombre que contiene la letra", () => {
    expect(contarPerros("Maya")).toBe(1);
    expect(contarPerros("Yaco")).toBe(1);
  });

  // Sin nombre igual es un cliente con un perro, no cero.
  it("cuenta uno cuando no hay nombre", () => {
    expect(contarPerros("")).toBe(1);
    expect(contarPerros(null)).toBe(1);
  });
});
