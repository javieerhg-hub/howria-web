// Guardas de la metadata del menú. Nada de esto se rompe con un error
// ruidoso: un id mal escrito en TABS_SECUNDARIOS simplemente hace que la
// pestaña nunca se esconda (o que la sección "Más" quede vacía), y una
// pestaña sin `desc` sale en blanco en el buscador. Los dos casos pasan
// el build sin chistar, así que se cubren acá.
import { describe, it, expect } from "vitest";
import { TODOS_LOS_TABS, TABS_SECUNDARIOS, esTabSecundario, fusionDeTab, entradasDeMenu, ORDEN_GRUPOS, PRIORIDAD_BARRA_NAV, pestanasDelRol, calcularAvisos, URGENCIAS, ordenarPorUrgencia } from "../HowriaAdmin.jsx";

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

// Qué pestañas ve cada rol. Los dos ajustes que no viven en permisos_roles
// se hacen en código, y si alguno se cae nadie ve un error: al
// administrador se le esconde la única pantalla desde donde se arreglan
// los permisos, o al paseador le vuelve un Inicio que ya no dibuja nada.
describe("pestañas por rol", () => {
  const permisos = {
    administrador: ["inicio", "clientes", "finanzas"],
    coordinador: ["inicio", "clientes", "coordinacion"],
    paseador: ["inicio", "mis-paseos", "finanzas"],
    entrenador: ["inicio", "mis-paseos", "agenda", "alumnos"],
  };

  it("el administrador siempre llega a Usuarios, aunque no esté en la tabla", () => {
    expect(pestanasDelRol("administrador", permisos)).toContain("usuarios");
  });

  it("no se le duplica Usuarios si ya lo tenía", () => {
    const tabs = pestanasDelRol("administrador", { administrador: ["inicio", "usuarios"] });
    expect(tabs.filter((t) => t === "usuarios")).toHaveLength(1);
  });

  it("el paseador no tiene Inicio: lo suyo vive en Mis paseos", () => {
    const tabs = pestanasDelRol("paseador", permisos);
    expect(tabs).not.toContain("inicio");
    expect(tabs).toContain("mis-paseos");
  });

  it("y le queda a dónde caer, para que la pantalla no quede en blanco", () => {
    // El efecto que corrige la pestaña activa manda a "mis-paseos" cuando
    // la abierta no existe. Si el filtro dejara la lista vacía, no habría
    // dónde caer.
    expect(pestanasDelRol("paseador", permisos).length).toBeGreaterThan(0);
  });

  it("al entrenador NO se le toca el Inicio: es otra pantalla y es suya", () => {
    expect(pestanasDelRol("entrenador", permisos)).toContain("inicio");
  });

  it("el coordinador conserva su Inicio", () => {
    expect(pestanasDelRol("coordinador", permisos)).toContain("inicio");
  });

  it("un rol sin fila en permisos_roles devuelve lista vacía, no explota", () => {
    expect(pestanasDelRol("cliente", permisos)).toEqual([]);
    expect(pestanasDelRol("paseador", null)).toEqual([]);
    expect(pestanasDelRol("administrador", undefined)).toEqual(["usuarios"]);
  });
});

// La lista de "Hoy hay que…" del Inicio. Un aviso sin urgencia no rompe
// nada: cae a "baja" y se hunde al final de la lista, en silencio. Como los
// avisos se agregan de a uno y a mano, es justo el error que se comete al
// agregar el número once.
describe("urgencia de los avisos", () => {
  const hoy = new Date();
  const clave = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const entrada = {
    // Cliente de paseos sin paseador, sin boleta este mes, y con evaluación
    // pendiente: dispara tres avisos distintos de una.
    clientes: [{ id: 1, nombre: "Ana", perro: "Nube", tipoServicio: ["paseos", "evaluacion"], diasHabituales: [], estadoCliente: "activo" }],
    boletasEmitidas: [
      { id: 1, estado: "no_enviada", total: 30000, fechaISO: hoy.toISOString(), clienteNombre: "Otro" },
      { id: 2, estado: "pendiente_pago", total: 45000, fechaISO: hoy.toISOString(), clienteNombre: "Otro" },
    ],
    boletasAdiestramiento: [],
    registroPaseos: {},
    tareasEquipo: [{ id: 1, fechaISO: hoy.toISOString(), estado: "pendiente", asignadoA: "Javier" }],
    citasAgenda: [],
    prospectos: [{ id: 1, proximoSeguimiento: clave(hoy), estado: "contactado" }],
    ausenciasPaseador: { Beatriz: "resfriada" },
    reprogramaciones: [],
  };

  const avisos = calcularAvisos(entrada);

  it("la fixture dispara varios avisos, si no el test no probaría nada", () => {
    expect(avisos.length).toBeGreaterThanOrEqual(5);
  });

  it("todos traen una urgencia conocida", () => {
    for (const a of avisos) {
      expect(Object.keys(URGENCIAS), `el aviso "${a.tipo}" no tiene urgencia`).toContain(a.urgencia);
    }
  });

  it("todos traen clave, texto y una pestaña a dónde ir", () => {
    for (const a of avisos) {
      expect(a.clave, `el aviso "${a.tipo}" no tiene clave — sin ella no se puede descartar`).toBeTruthy();
      expect(a.texto).toBeTruthy();
      expect(a.tab).toBeTruthy();
    }
  });

  it("no hay dos avisos con la misma clave", () => {
    // Descartar uno descartaría los dos, y React repetiría la key.
    const claves = avisos.map((a) => a.clave);
    expect(new Set(claves).size).toBe(claves.length);
  });

  it("lo urgente queda arriba y lo que puede esperar abajo", () => {
    const ordenados = ordenarPorUrgencia([
      { clave: "c", urgencia: "baja" },
      { clave: "a", urgencia: "alta" },
      { clave: "b", urgencia: "media" },
    ]);
    expect(ordenados.map((x) => x.clave)).toEqual(["a", "b", "c"]);
  });

  it("dentro de una misma urgencia se respeta el orden de llegada", () => {
    const ordenados = ordenarPorUrgencia([
      { clave: "primera", urgencia: "media" },
      { clave: "segunda", urgencia: "media" },
    ]);
    expect(ordenados.map((x) => x.clave)).toEqual(["primera", "segunda"]);
  });

  it("una urgencia desconocida se hunde al final en vez de romper la lista", () => {
    const ordenados = ordenarPorUrgencia([{ clave: "rara", urgencia: "🤷" }, { clave: "alta", urgencia: "alta" }]);
    expect(ordenados[0].clave).toBe("alta");
  });
});
