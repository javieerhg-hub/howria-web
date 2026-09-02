// Guardas de la metadata del menú. Nada de esto se rompe con un error
// ruidoso: un id mal escrito en TABS_SECUNDARIOS simplemente hace que la
// pestaña nunca se esconda (o que la sección "Más" quede vacía), y una
// pestaña sin `desc` sale en blanco en el buscador. Los dos casos pasan
// el build sin chistar, así que se cubren acá.
import { describe, it, expect } from "vitest";
import { TODOS_LOS_TABS, TABS_SECUNDARIOS, esTabSecundario } from "../HowriaAdmin.jsx";

describe("metadata de las pestañas", () => {
  it("cada pestaña tiene descripción y palabras de búsqueda", () => {
    for (const t of TODOS_LOS_TABS) {
      expect(t.desc, `la pestaña "${t.id}" no tiene desc`).toBeTruthy();
      expect(t.busca, `la pestaña "${t.id}" no tiene busca`).toBeTruthy();
    }
  });

  it("no hay ids repetidos", () => {
    const ids = TODOS_LOS_TABS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("todos los ids secundarios existen de verdad", () => {
    const ids = TODOS_LOS_TABS.map((t) => t.id);
    for (const id of TABS_SECUNDARIOS) {
      expect(ids, `"${id}" está en TABS_SECUNDARIOS pero no es una pestaña`).toContain(id);
    }
  });

  it("Inicio nunca es secundaria", () => {
    // Se esconde con el resto solo si alguien la agrega por error a la
    // lista; Inicio vive fuera de los grupos y se dibuja aparte.
    expect(esTabSecundario("inicio")).toBe(false);
  });

  it("las secundarias no se llevan un grupo entero por delante", () => {
    // Si todas las pestañas de un grupo quedaran escondidas, el grupo
    // desaparece del menú sin aviso. Hoy no pasa, y si algún día pasa
    // conviene que sea una decisión y no un descuido.
    const grupos = [...new Set(TODOS_LOS_TABS.map((t) => t.grupo).filter(Boolean))];
    for (const g of grupos) {
      const delGrupo = TODOS_LOS_TABS.filter((t) => t.grupo === g);
      const visibles = delGrupo.filter((t) => !esTabSecundario(t.id));
      expect(visibles.length, `el grupo "${g}" se quedaría sin ninguna pestaña visible`).toBeGreaterThan(0);
    }
  });
});
