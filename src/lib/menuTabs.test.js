// Guardas de la metadata del menú. Nada de esto se rompe con un error
// ruidoso: un id mal escrito en TABS_SECUNDARIOS simplemente hace que la
// pestaña nunca se esconda (o que la sección "Más" quede vacía), y una
// pestaña sin `desc` sale en blanco en el buscador. Los dos casos pasan
// el build sin chistar, así que se cubren acá.
import { describe, it, expect } from "vitest";
import { TODOS_LOS_TABS, TABS_SECUNDARIOS, esTabSecundario, fusionDeTab, entradasDeMenu, ORDEN_GRUPOS, PRIORIDAD_BARRA_NAV } from "../HowriaAdmin.jsx";

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

  it("solo los grupos que sabemos quedan sin pestañas visibles", () => {
    // Un grupo cuyas pestañas están todas en "Más" no dibuja título: no
    // rompe nada, pero tiene que ser una decisión y no un descuido.
    //
    // Los dos de abajo son deliberados. Siguen declarados porque sus
    // pestañas existen (dentro de "Más") y el buscador muestra el grupo
    // de cada resultado — sacarlos dejaría esos resultados sin contexto.
    // Si aparece un tercero, casi seguro es que alguien movió una
    // pestaña sin darse cuenta de que dejaba el grupo vacío.
    const vaciosAPosta = ["Equipo", "Prospección"];
    const grupos = [...new Set(TODOS_LOS_TABS.map((t) => t.grupo).filter(Boolean))];
    const vacios = grupos.filter((g) => !TODOS_LOS_TABS.some((t) => t.grupo === g && !esTabSecundario(t.id)));
    expect(vacios.sort()).toEqual(vaciosAPosta.sort());
  });

  it("Inicio y Calendario son las únicas sueltas, sin grupo", () => {
    const sueltas = TODOS_LOS_TABS.filter((t) => !t.grupo).map((t) => t.id);
    expect(sueltas).toEqual(["inicio", "calendario"]);
  });
});

describe("fusiones del menú", () => {
  const tabsDe = (...ids) => TODOS_LOS_TABS.filter((t) => ids.includes(t.id));

  it("Boletas y Facturas viven bajo la misma entrada", () => {
    expect(fusionDeTab("boletas")?.id).toBe("cobrar");
    expect(fusionDeTab("facturas")?.id).toBe("cobrar");
  });

  it("una pestaña suelta no pertenece a ninguna fusión", () => {
    expect(fusionDeTab("clientes")).toBeNull();
    expect(fusionDeTab("finanzas")).toBeNull();
  });

  it("Finanzas personales nunca se fusiona con nada", () => {
    // Decisión explícita de Javier: "finanzas personales se creó para mí
    // personalmente no para los demás". Fusionarla con Finanzas haría que
    // cualquiera con permiso de Finanzas viera su plata.
    expect(fusionDeTab("finanzas-personales")).toBeNull();
  });

  it("dos pestañas fusionadas se dibujan como una sola entrada", () => {
    const entradas = entradasDeMenu(tabsDe("clientes", "boletas", "facturas", "finanzas"), "Clientes y dinero");
    const ids = entradas.map((e) => e.id);
    expect(ids).toEqual(["clientes", "cobrar", "finanzas"]);
    expect(entradas.find((e) => e.id === "cobrar").subs.map((s) => s.id)).toEqual(["boletas", "facturas"]);
  });

  it("quien tiene solo una mitad ve solo esa mitad", () => {
    // Lo que protege el gateo por permiso: fusionar es visual, NO reparte
    // accesos. Un rol con 'facturas' y sin 'boletas' no puede terminar
    // pudiendo emitir boletas por haber juntado las pestañas.
    const entradas = entradasDeMenu(tabsDe("facturas"), "Clientes y dinero");
    expect(entradas).toHaveLength(1);
    expect(entradas[0].id).toBe("cobrar");
    expect(entradas[0].subs.map((s) => s.id)).toEqual(["facturas"]);
    expect(entradas[0].destino).toBe("facturas");
  });

  it("sin ninguna mitad permitida, la entrada no aparece", () => {
    const entradas = entradasDeMenu(tabsDe("clientes"), "Clientes y dinero");
    expect(entradas.map((e) => e.id)).toEqual(["clientes"]);
  });

  it("Pagar junta las dos mitades y quedan en el mismo grupo", () => {
    // Antes vivian en grupos distintos del menu: 'pagos' en Equipo y
    // 'pago-adiestramiento' en Adiestramiento. Era la misma tarea en dos
    // secciones que no se tocan.
    expect(fusionDeTab("pagos")?.id).toBe("pagar");
    expect(fusionDeTab("pago-adiestramiento")?.id).toBe("pagar");
    const grupoDe = (id) => TODOS_LOS_TABS.find((t) => t.id === id).grupo;
    expect(grupoDe("pagos")).toBe("Clientes y dinero");
    expect(grupoDe("pago-adiestramiento")).toBe("Clientes y dinero");
  });

  it("el grupo del dinero queda en el orden Cobrar, Pagar, Finanzas", () => {
    const delGrupo = TODOS_LOS_TABS.filter((t) => t.grupo === "Clientes y dinero");
    const ids = entradasDeMenu(delGrupo, "Clientes y dinero").map((e) => e.id);
    expect(ids).toEqual(["clientes", "cobrar", "pagar", "finanzas", "finanzas-personales"]);
  });

  it("toda sub-pestaña declarada existe como pestaña real", () => {
    const ids = TODOS_LOS_TABS.map((t) => t.id);
    for (const t of TODOS_LOS_TABS) {
      const f = fusionDeTab(t.id);
      if (!f) continue;
      for (const s of f.subs) {
        expect(ids, `la fusión "${f.id}" declara "${s.id}", que no es una pestaña`).toContain(s.id);
      }
    }
  });
});

describe("barra inferior de mobile", () => {
  // Todas las entradas que el menú puede dibujar, en el mismo orden que
  // el sidebar: las sin grupo primero, después grupo por grupo.
  const entradas = [
    ...entradasDeMenu(TODOS_LOS_TABS, ""),
    ...ORDEN_GRUPOS.flatMap((g) => entradasDeMenu(TODOS_LOS_TABS, g)),
  ].map((e) => e.id);

  it("la prioridad solo nombra entradas que existen", () => {
    // El bug que esto evita: la barra elige sus 3 accesos rápidos por
    // esta lista. Un id que ya no es una entrada (porque se fusionó o se
    // fue a "Más") no rompe nada — simplemente ese slot no se llena, en
    // silencio. Paso justo eso al fusionar Cobrar: la lista seguía
    // diciendo "boletas" y "facturas".
    for (const id of PRIORIDAD_BARRA_NAV) {
      expect(entradas, `"${id}" está en PRIORIDAD_BARRA_NAV pero no es una entrada del menú`).toContain(id);
    }
  });

  it("la prioridad no nombra sub-pestañas de una fusión", () => {
    for (const id of PRIORIDAD_BARRA_NAV) {
      expect(fusionDeTab(id), `"${id}" es una sub-pestaña; en la barra va su entrada, no ella`).toBeNull();
    }
  });

  it("alcanza para llenar los 3 accesos rápidos", () => {
    expect(PRIORIDAD_BARRA_NAV.length).toBeGreaterThanOrEqual(3);
  });
});
