// Pestaña Finanzas personales — la plata de Howria administración, que no
// es lo mismo que la plata de la empresa.
//
// El caso que resuelve: Javier atiende él mismo una parte de la cartera.
// Para llevar el orden operativo se hizo una cuenta de paseador ("Javier
// H"), pero esos clientes no son de un empleado: son suyos. Finanzas
// muestra la empresa completa mezclando su cartera con la del resto, y
// Pago trabajadores le muestra su tarifa de paseador — que es plata
// moviéndose dentro de la misma caja, no una ganancia.
//
// Acá se junta lo que sí es ganancia propia:
//   1. Lo que se le cobra a los clientes de su cartera (completo: los
//      pasea él, así que no sale nada por ellos).
//   2. Lo que queda para Howria de cada evaluación o clase, o sea lo que
//      entró menos lo que se le paga al adiestrador.
//   3. Lo que deja cada paseador ajeno: lo que paga el tutor menos lo que
//      se le paga a esa persona por hacer el paseo. Ojo: eso NO vale para
//      todos — Constanza trabaja asi, pero Arniaz y Andreina van aparte y
//      su margen no es de Howria. Se marca por persona
//      (usuarios.margen_va_a_howria, database/122).
//
// Y abajo, lo que no es de la empresa en absoluto: sus gastos personales
// (database/123, privados por RLS incluso de otros administradores),
// para cerrar con lo unico que de verdad sirve para organizarse el mes:
// cuanto le queda limpio despues de pagar todo.
//
// El vínculo cuenta-admin ↔ cuenta-paseador se guarda en
// usuarios.paseador_vinculado (database/120) en vez de escribir un nombre
// en el código.
import { useState, useMemo } from "react";
import {
  NAVY, CREAM_SOFT, GOLD, RUST, INK, MESES, tarjeta, sectionTitle, hint, input,
  botonSecundario, SkeletonLista, fmtCLP, showToast, esBoletaDeCliente,
} from "../HowriaAdmin.jsx";
import { diasDelMesProgramados } from "../lib/programacion.js";
import { realizadosEnRango, programadosEnRango } from "../lib/pagos.js";
import { periodoDeBoleta, cicloDeFecha, esVenta } from "../lib/calculosBoletas.js";
import { QueSeCuenta } from "./_compartido.jsx";

const VERDE = "#2F6A46";

// Categorias de gasto personal. Son pocas a proposito: una lista larga
// hace que uno dude donde poner cada cosa y termine usando "otros" para
// todo. El emoji ayuda a reconocerlas de un vistazo en el desglose.
const CATEGORIAS_GASTO = [
  { id: "casa", nombre: "Casa", emoji: "\u{1F3E0}" },
  { id: "comida", nombre: "Comida", emoji: "\u{1F37D}" },
  { id: "transporte", nombre: "Transporte", emoji: "\u{1F697}" },
  { id: "deudas", nombre: "Deudas y cuotas", emoji: "\u{1F4B3}" },
  { id: "salud", nombre: "Salud", emoji: "\u{1FA7A}" },
  { id: "personal", nombre: "Personal", emoji: "\u2728" },
  { id: "otros", nombre: "Otros", emoji: "\u{1F4E6}" },
];

function catDe(id) {
  return CATEGORIAS_GASTO.find((c) => c.id === id) || CATEGORIAS_GASTO[CATEGORIAS_GASTO.length - 1];
}

// Un gasto normal cuenta en el mes de su fecha. Uno fijo cuenta en todos
// los meses desde esa fecha, hasta el mes de fijoHasta si se dio de baja
// — asi un arriendo no hay que escribirlo de nuevo cada mes, y dejar de
// pagarlo no borra los meses en que si se pago.
function gastoCuentaEn(g, mes, anio) {
  const f = new Date(g.fecha.length <= 10 ? g.fecha + "T00:00:00" : g.fecha);
  const desde = f.getFullYear() * 12 + f.getMonth();
  const mirado = anio * 12 + mes;
  if (!g.fijo) return desde === mirado;
  if (mirado < desde) return false;
  if (!g.fijoHasta) return true;
  const h = new Date(g.fijoHasta.length <= 10 ? g.fijoHasta + "T00:00:00" : g.fijoHasta);
  return mirado <= h.getFullYear() * 12 + h.getMonth();
}

function Kpi({ titulo, valor, detalle, color = NAVY, bg = CREAM_SOFT }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</p>
      <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color, fontFamily: "Georgia, serif" }}>{valor}</p>
      {detalle && <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{detalle}</p>}
    </div>
  );
}

export function FinanzasPersonales({
  usuarios = [], setUsuarios, clientes = [], boletasEmitidas = [], boletasAdiestramiento = [],
  citasAgenda = [], registroPaseos = {}, reprogramaciones = [],
  gastosPersonales = [], setGastosPersonales, cargandoGastos, user, cargando,
}) {
  // El user de la sesión es una foto del momento del login: si el vínculo
  // se elige acá mismo, hay que leerlo de la lista viva para que la
  // pantalla reaccione sin recargar.
  const yo = usuarios.find((u) => u.id === user?.id) || user || {};
  const miPaseador = yo.paseadorVinculado || "";
  const enTerreno = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador");

  const [offset, setOffset] = useState(0);
  // Al reves de lo que parece: la lista guarda a quien se esta mirando
  // "como va HOY". Por defecto todos salen con el mes completo, que es lo
  // que suma en el titular y lo que sirve para organizarse — lo de hoy es
  // la consulta puntual, no el estado normal.
  const [verHoy, setVerHoy] = useState([]);
  const [gastoNuevo, setGastoNuevo] = useState({ descripcion: "", monto: "", categoria: "casa", fijo: false });
  const [bajandoPdf, setBajandoPdf] = useState(false);
  const hoy = new Date();
  const ref = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const mes = ref.getMonth(), anio = ref.getFullYear();
  const tituloPeriodo = `${MESES[mes]} ${anio}`;

  function vincular(nombre) {
    setUsuarios((prev) => prev.map((u) => (u.id === yo.id ? { ...u, paseadorVinculado: nombre || null } : u)));
  }

  function alternarProyeccion(id) {
    setVerHoy((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  // Marcar si el margen de una persona es de Howria. Hay que decirlo por
  // persona: Constanza trabaja asi, Arniaz y Andreina van aparte, y eso no
  // se puede deducir de los datos.
  function marcarMargen(id, esMio) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, margenVaAHowria: esMio } : u)));
  }

  // Una boleta pertenece al ciclo que CUBRE, no al día en que se emitió
  // — la de fines de agosto que cubre septiembre cuenta en septiembre.
  const delCiclo = (b) => {
    const p = periodoDeBoleta(b);
    return p && p.getMonth() === mes && p.getFullYear() === anio;
  };

  const paseos = useMemo(() => {
    if (!miPaseador) return { filas: [], cobrado: 0, pagado: 0, conBoleta: 0 };
    const filas = clientes
      .filter((c) => c.paseadorNombre === miPaseador)
      .map((c) => {
        const suyas = boletasEmitidas.filter((b) => esBoletaDeCliente(b, c) && esVenta(b) && delCiclo(b));
        const cobrado = suyas.reduce((a, b) => a + (Number(b.total) || 0), 0);
        const pagado = suyas.filter((b) => b.estado === "pagada").reduce((a, b) => a + (Number(b.total) || 0), 0);
        return {
          cliente: c,
          cobrado,
          pagado,
          boletas: suyas.length,
          programados: diasDelMesProgramados(c, mes, anio, reprogramaciones).length,
        };
      })
      .sort((a, b) => b.cobrado - a.cobrado || String(a.cliente.nombre).localeCompare(String(b.cliente.nombre)));
    return {
      filas,
      cobrado: filas.reduce((a, f) => a + f.cobrado, 0),
      pagado: filas.reduce((a, f) => a + f.pagado, 0),
      conBoleta: filas.filter((f) => f.boletas > 0).length,
    };
  }, [miPaseador, clientes, boletasEmitidas, reprogramaciones, mes, anio]);

  // Adiestramiento: la parte de Howria es lo que entró por el servicio
  // menos lo acordado con el adiestrador. Mismo criterio que Pago
  // adiestramiento — solo suma lo que ya tiene monto acordado, porque un
  // ítem sin definir daría un "queda para Howria" inflado con plata que
  // todavía no se reparte. Los sin definir se muestran aparte para que se
  // vea que faltan, en vez de desaparecer del total en silencio.
  const adiestramiento = useMemo(() => {
    const filas = citasAgenda
      .filter((c) => {
        if (c.estado !== "realizada") return false;
        // Por CICLO DE COBRO, no por el mes en que se hizo. Una evaluacion
        // del 23 de agosto se cobra y se paga junto con septiembre, y asi
        // es como Javier la cuenta — igual que una boleta emitida a fines
        // de agosto que cubre septiembre. Pago adiestramiento no filtra por
        // fecha (es una cola de pendientes), asi que sin esto lo que esta
        // ahi hoy no aparecia en el mes en que se va a cobrar.
        const ciclo = cicloDeFecha(c.fechaISO);
        return ciclo && ciclo.getMonth() === mes && ciclo.getFullYear() === anio;
      })
      .map((c) => {
        const b = c.boletaAdiestramientoId
          ? boletasAdiestramiento.find((x) => x._dbId === c.boletaAdiestramientoId)
          : null;
        const entro = b ? Number(b.total) || 0 : Number(c.precio) || 0;
        const alAdiestrador = Number(c.pagoAdiestrador) || 0;
        return {
          cita: c,
          entro,
          alAdiestrador,
          queda: entro - alAdiestrador,
          definido: alAdiestrador > 0,
          cobrado: b ? b.estado === "pagada" : !!c.pagada,
        };
      })
      .sort((a, b) => new Date(a.cita.fechaISO) - new Date(b.cita.fechaISO));
    const cerradas = filas.filter((f) => f.definido);
    return {
      filas,
      sinDefinir: filas.filter((f) => !f.definido),
      entro: cerradas.reduce((a, f) => a + f.entro, 0),
      pagado: cerradas.reduce((a, f) => a + f.alAdiestrador, 0),
      queda: cerradas.reduce((a, f) => a + f.queda, 0),
      quedaCobrado: cerradas.filter((f) => f.cobrado).reduce((a, f) => a + f.queda, 0),
    };
  }, [citasAgenda, boletasAdiestramiento, mes, anio]);


  // Lo que dejan los paseadores ajenos: el tutor paga la boleta completa y
  // de ahí sale la tarifa de quien hace el paseo; la diferencia es de
  // Howria. Se cuenta por paseos REALIZADOS, que es lo que Pago
  // trabajadores paga de verdad — así los dos números cuadran.
  //
  // El costo va por cliente y no por persona: si un paseo se compartió, la
  // parte del principal más la del otro suman la misma tarifa
  // (ver lib/reparto.js), así que contar los realizados del cliente sin
  // mirar quién lo hizo da el costo completo y no lo parte en dos.
  const otros = useMemo(() => {
    // Sin el vínculo no se sabe cuál cartera es la propia, y entonces
    // "los demás" serían todos — incluida la suya. El titular quedaría
    // enorme y falso, así que hasta elegir la cuenta no se calcula nada.
    if (!miPaseador) return { grupos: [], mios: [], aparte: [], queda: 0, quedaCobrado: 0, quedaSiCompleta: 0, quedaCobradoSiCompleta: 0 };
    const desde = new Date(anio, mes, 1);
    const hasta = new Date(anio, mes + 1, 1);
    const grupos = enTerreno
      .filter((u) => u.nombre !== miPaseador)
      .map((u) => {
        const filas = clientes
          .filter((c) => c.paseadorNombre === u.nombre)
          .map((c) => {
            const suyas = boletasEmitidas.filter((b) => esBoletaDeCliente(b, c) && esVenta(b) && delCiclo(b));
            const tutorPaga = suyas.reduce((a, b) => a + (Number(b.total) || 0), 0);
            const pagado = suyas.filter((b) => b.estado === "pagada").reduce((a, b) => a + (Number(b.total) || 0), 0);
            const tarifa = Number(c.tarifaPaseador) || 0;
            const hechos = realizadosEnRango(registroPaseos, c.id, desde, hasta);
            const quedan = programadosEnRango(c, desde, hasta, registroPaseos, reprogramaciones);
            // Si ya hizo mas de los programados (un paseo extra), el mes
            // "completo" no puede ser menos de lo que ya lleva hecho.
            const paseosSiCompleta = Math.max(hechos, quedan);
            return {
              cliente: c, tutorPaga, pagado, tarifa, hechos, paseosSiCompleta,
              leToca: hechos * tarifa,
              leTocaSiCompleta: paseosSiCompleta * tarifa,
              boletas: suyas.length,
            };
          })
          .filter((f) => f.tutorPaga > 0 || f.leToca > 0)
          .sort((a, b) => (b.tutorPaga - b.leToca) - (a.tutorPaga - a.leToca));
        const tutores = filas.reduce((a, f) => a + f.tutorPaga, 0);
        const leToca = filas.reduce((a, f) => a + f.leToca, 0);
        return {
          persona: u,
          esMio: !!u.margenVaAHowria,
          filas,
          tutores,
          leToca,
          queda: tutores - leToca,
          leTocaSiCompleta: filas.reduce((a, f) => a + f.leTocaSiCompleta, 0),
          quedaSiCompleta: tutores - filas.reduce((a, f) => a + f.leTocaSiCompleta, 0),
          // Sin tarifa cargada el costo sale $0 y el margen se ve enorme
          // sin serlo — hay que decirlo, no callarlo.
          sinTarifa: filas.filter((f) => f.tarifa === 0 && f.hechos > 0).length,
          quedaCobrado: filas.filter((f) => f.pagado > 0).reduce((a, f) => a + (f.pagado - f.leToca), 0),
          // La misma cuenta pero descontando el costo del mes COMPLETO. El
          // titular usa el cierre, asi que "ya entro" tiene que descontar
          // ese mismo costo — con el de hoy daba mas que el total y
          // "falta cobrar" salia negativo.
          quedaCobradoSiCompleta: filas.filter((f) => f.pagado > 0).reduce((a, f) => a + (f.pagado - f.leTocaSiCompleta), 0),
        };
      })
      .filter((g) => g.filas.length > 0)
      .sort((a, b) => (b.esMio ? 1 : 0) - (a.esMio ? 1 : 0) || b.queda - a.queda);
    // Solo suma el margen de quien está marcado. Los demás se muestran
    // igual, apagados y sin detalle, para poder marcarlos si cambia el
    // trato — pero no entran en ningún total.
    const mios = grupos.filter((g) => g.esMio);
    return {
      grupos,
      mios,
      aparte: grupos.filter((g) => !g.esMio),
      queda: mios.reduce((a, g) => a + g.queda, 0),
      quedaCobrado: mios.reduce((a, g) => a + g.quedaCobrado, 0),
      quedaSiCompleta: mios.reduce((a, g) => a + g.quedaSiCompleta, 0),
      quedaCobradoSiCompleta: mios.reduce((a, g) => a + g.quedaCobradoSiCompleta, 0),
    };
  }, [enTerreno, miPaseador, clientes, boletasEmitidas, registroPaseos, reprogramaciones, mes, anio]);

  // El titular usa el margen AL CIERRE del mes, no el de hoy (decision de
  // Javier). A principio de mes casi nada esta marcado, asi que el margen
  // de hoy sale inflado y luego baja solo — un titular que empieza alto y
  // se desinfla no sirve para planificar.
  const ganare = paseos.cobrado + adiestramiento.queda + otros.quedaSiCompleta;
  const yaEntro = paseos.pagado + adiestramiento.quedaCobrado + otros.quedaCobradoSiCompleta;

  const gastos = useMemo(() => {
    const filas = gastosPersonales
      // Los que entraron solos desde el teléfono y aún no se revisan NO
      // cuentan: un cobro raro, una devolución o una prueba no deben
      // mover el "te queda limpio" sin que Javier los haya mirado.
      .filter((g) => g.confirmado !== false && gastoCuentaEn(g, mes, anio))
      .sort((a, b) => b.monto - a.monto);
    const porCategoria = CATEGORIAS_GASTO
      .map((c) => ({ ...c, total: filas.filter((g) => g.categoria === c.id).reduce((a, g) => a + g.monto, 0) }))
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
    return {
      filas,
      porCategoria,
      total: filas.reduce((a, g) => a + g.monto, 0),
      fijos: filas.filter((g) => g.fijo).reduce((a, g) => a + g.monto, 0),
    };
  }, [gastosPersonales, mes, anio]);

  // La bandeja: lo que llegó solo desde el iPhone y falta revisar. Va sin
  // filtrar por mes a propósito — una compra del 30 se revisa el 2 del mes
  // siguiente, y filtrada por mes desaparecería sin que nadie la viera.
  const porRevisar = useMemo(
    () => gastosPersonales
      .filter((g) => g.confirmado === false)
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))),
    [gastosPersonales],
  );

  function confirmarGasto(id, categoria) {
    setGastosPersonales((prev) => prev.map((g) => (g.id === id ? { ...g, confirmado: true, categoria } : g)));
  }

  const limpio = ganare - gastos.total;

  function agregarGasto(e) {
    e.preventDefault();
    const monto = Number(gastoNuevo.monto);
    if (!gastoNuevo.descripcion.trim() || !monto || monto <= 0) return;
    setGastosPersonales((prev) => [...prev, {
      id: Date.now(),
      usuarioEmail: user?.email,
      descripcion: gastoNuevo.descripcion.trim(),
      monto,
      categoria: gastoNuevo.categoria,
      // Se guarda con fecha en el mes que se esta mirando, no hoy: si
      // estoy revisando agosto y agrego un gasto, es de agosto.
      fecha: `${anio}-${String(mes + 1).padStart(2, "0")}-01`,
      fijo: gastoNuevo.fijo,
      fijoHasta: null,
    }]);
    setGastoNuevo({ descripcion: "", monto: "", categoria: gastoNuevo.categoria, fijo: false });
  }

  function borrarGasto(id) {
    setGastosPersonales((prev) => prev.filter((g) => g.id !== id));
  }

  // La liquidacion es el mismo resumen que se ve en pantalla, en papel:
  // de donde salio cada peso, que se gasto, y cuanto queda limpio. Para
  // los paseadores ajenos usa el MES COMPLETO, igual que el titular — un
  // informe que uno guarda o imprime tiene que traer el numero con el que
  // se organiza, no el de la hora en que se descargo.
  //
  // jsPDF pesa, y esta pestana no lo necesita para nada mas: se carga
  // recien al apretar (mismo criterio que explica _compartido_pdf.jsx).
  async function bajarLiquidacion() {
    if (bajandoPdf) return;
    setBajandoPdf(true);
    try {
      const { descargarLiquidacionPersonal } = await import("./_compartido_pdf.jsx");
      const secciones = [];

      if (paseos.filas.some((f) => f.cobrado > 0)) {
        secciones.push({
          titulo: "Mis paseos",
          detalle: `${paseos.conBoleta} de ${paseos.filas.length} clientes cobrados`,
          filas: paseos.filas.filter((f) => f.cobrado > 0).map((f) => ({
            izq: `${f.cliente.perro || "Sin perro"} · ${String(f.cliente.nombre).trim()}`,
            sub: `${f.programados} paseo(s) · ${f.pagado >= f.cobrado ? "pagada" : `pagado ${fmtCLP(f.pagado)}`}`,
            der: fmtCLP(f.cobrado),
          })),
          etiquetaTotal: "Total de mis paseos",
          total: fmtCLP(paseos.cobrado),
        });
      }

      const adiCerradas = adiestramiento.filas.filter((f) => f.definido);
      if (adiCerradas.length > 0) {
        secciones.push({
          titulo: "Adiestramiento",
          detalle: `entró ${fmtCLP(adiestramiento.entro)} · al adiestrador ${fmtCLP(adiestramiento.pagado)}`,
          filas: adiCerradas.map((f) => ({
            izq: `${f.cita.perro || ""} ${f.cita.clienteNombre}`.trim(),
            sub: `${f.cita.tipo === "evaluacion" ? "Evaluación" : "Clase"} · entró ${fmtCLP(f.entro)} · al adiestrador ${fmtCLP(f.alAdiestrador)}`,
            der: fmtCLP(f.queda),
          })),
          etiquetaTotal: "Queda para mí",
          total: fmtCLP(adiestramiento.queda),
        });
      }

      otros.mios.forEach((g) => {
        secciones.push({
          titulo: `Margen sobre ${g.persona.nombre}`,
          detalle: "proyectado al cierre del mes",
          filas: g.filas.map((f) => ({
            izq: `${f.cliente.perro || "Sin perro"} · ${String(f.cliente.nombre).trim()}`,
            sub: `tutor ${fmtCLP(f.tutorPaga)} · ${f.paseosSiCompleta} paseo(s) × ${fmtCLP(f.tarifa)} = ${fmtCLP(f.leTocaSiCompleta)}`,
            der: fmtCLP(f.tutorPaga - f.leTocaSiCompleta),
          })),
          etiquetaTotal: `Tutores ${fmtCLP(g.tutores)} menos ${fmtCLP(g.leTocaSiCompleta)}`,
          total: fmtCLP(g.quedaSiCompleta),
        });
      });

      if (gastos.filas.length > 0) {
        secciones.push({
          titulo: "Mis gastos",
          detalle: gastos.fijos > 0 ? `${fmtCLP(gastos.fijos)} son fijos` : "",
          filas: gastos.filas.map((g) => ({
            izq: g.descripcion,
            sub: catDe(g.categoria).nombre + (g.fijo ? " · todos los meses" : ""),
            der: `− ${fmtCLP(g.monto)}`,
            negativo: true,
          })),
          etiquetaTotal: "Total de gastos",
          total: `− ${fmtCLP(gastos.total)}`,
          totalNegativo: true,
        });
      }

      await descargarLiquidacionPersonal({
        titulo: "Mi liquidación personal",
        periodo: `${MESES[mes]} ${anio}`,
        secciones,
        ganare: fmtCLP(ganare),
        gastos: `− ${fmtCLP(gastos.total)}`,
        limpio: fmtCLP(limpio),
        yaEntro: fmtCLP(Math.max(0, yaEntro - gastos.total)),
      });
    } catch (e) {
      showToast("No se pudo generar la liquidación.");
    } finally {
      setBajandoPdf(false);
    }
  }

  // Dar de baja un fijo: deja de contar DESPUES de este mes, sin borrar
  // los meses en que si se pago.
  function darDeBajaFijo(id) {
    const ultimoDia = new Date(anio, mes + 1, 0);
    const hasta = `${ultimoDia.getFullYear()}-${String(ultimoDia.getMonth() + 1).padStart(2, "0")}-${String(ultimoDia.getDate()).padStart(2, "0")}`;
    setGastosPersonales((prev) => prev.map((g) => (g.id === id ? { ...g, fijoHasta: hasta } : g)));
  }

  if (cargando) return <SkeletonLista filas={6} />;

  return (
    <div>
      <h2 style={sectionTitle}>Finanzas personales</h2>
      <p style={{ ...hint, marginTop: 4, marginBottom: 16 }}>
        Solo tu plata: los clientes de tu propia cartera y lo que te queda de cada
        servicio de adiestramiento. Finanzas, en cambio, mezcla toda la empresa.
      </p>

      <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "0 0 20px", flexWrap: "wrap" }}>
        <button onClick={() => setOffset((n) => n - 1)} aria-label="Mes anterior"
          style={{ ...botonSecundario, width: "auto", margin: 0, padding: "6px 14px", flex: "none" }}>←</button>
        <span style={{ fontSize: 15, fontWeight: 600, color: NAVY, minWidth: 170, textAlign: "center" }}>
          Ciclo de {tituloPeriodo}
        </span>
        <button onClick={() => setOffset((n) => n + 1)} aria-label="Mes siguiente"
          style={{ ...botonSecundario, width: "auto", margin: 0, padding: "6px 14px", flex: "none" }}>→</button>
        {offset !== 0 && (
          <button onClick={() => setOffset(0)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600, padding: 0 }}>
            Volver a este mes
          </button>
        )}
      </div>
      {/* Esta pantalla mezcla dos reglas a propósito, y hasta acá no lo
          decía en ninguna parte: las boletas cuentan por el mes que
          CUBREN, y las evaluaciones y clases por el ciclo en que se
          COBRAN (una del 23 de agosto se cobra junto con septiembre). */}
      <QueSeCuenta
        que="boletas por el mes que cubren, y clases por el ciclo en que se cobran"
        desde={new Date(anio, mes, 1)} hasta={new Date(anio, mes + 1, 0)} />

      <div className="howria-card" style={{ ...tarjeta, marginBottom: 20 }}>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Kpi titulo={`Ganarás en ${MESES[mes]}`} valor={fmtCLP(ganare)} color={VERDE}
            detalle={`Mis paseos ${fmtCLP(paseos.cobrado)} · adiestramiento ${fmtCLP(adiestramiento.queda)} · otros paseadores ${fmtCLP(otros.quedaSiCompleta)} al cierre`} />
          <Kpi titulo="De eso, ya entró" valor={fmtCLP(yaEntro)}
            detalle={ganare > 0 ? `Falta cobrar ${fmtCLP(ganare - yaEntro)}` : "Todavía no hay nada emitido"} />
          <Kpi titulo="Clientes que cobraste" valor={`${paseos.conBoleta} de ${paseos.filas.length}`}
            detalle={paseos.filas.length - paseos.conBoleta > 0
              ? `${paseos.filas.length - paseos.conBoleta} sin boleta este ciclo`
              : "Ninguno pendiente"} />
        </div>
      </div>

      <div className="howria-card" style={{ ...tarjeta, marginBottom: 20 }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Mis paseos</h3>
        {!miPaseador ? (
          <>
            <p style={{ ...hint, marginTop: 4 }}>
              Elige con qué cuenta de terreno paseas tú. Los clientes de esa cuenta se
              tratan como tuyos: lo que se les cobra es tuyo completo, sin descontar
              tarifa de paseador.
            </p>
            <select value="" onChange={(e) => vincular(e.target.value)} style={{ ...input, maxWidth: 320 }}>
              <option value="">Elegir mi cuenta de terreno…</option>
              {enTerreno.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
            </select>
          </>
        ) : (
          <>
            <p style={{ ...hint, marginTop: 4, marginBottom: 14 }}>
              Los {paseos.filas.length} clientes que paseas como <b>{miPaseador}</b>, y cuánto se
              le cobró a cada uno en este ciclo.{" "}
              <button onClick={() => vincular("")} style={{ border: "none", background: "none", color: GOLD, cursor: "pointer", font: "inherit", padding: 0, textDecoration: "underline" }}>
                Cambiar cuenta
              </button>
            </p>

            {paseos.filas.length === 0 ? (
              <p style={hint}>No hay clientes asignados a {miPaseador}.</p>
            ) : (
              <div style={{ display: "grid", gap: 6 }}>
                {paseos.filas.map((f) => (
                  <div key={f.cliente.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>
                        {f.cliente.perro ? `🐾 ${f.cliente.perro} · ` : ""}{String(f.cliente.nombre).trim()}
                      </p>
                      <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                        {f.programados} paseo(s) este ciclo
                        {f.boletas === 0
                          ? " · sin boleta todavía"
                          : f.pagado >= f.cobrado ? " · pagada" : ` · pagado ${fmtCLP(f.pagado)}`}
                      </p>
                    </div>
                    <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, fontFamily: "Georgia, serif", color: f.boletas === 0 ? RUST : NAVY }}>
                      {f.boletas === 0 ? "—" : fmtCLP(f.cobrado)}
                    </p>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: NAVY, borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#EAE0C6", textTransform: "uppercase", letterSpacing: 0.5 }}>Total de mis paseos</p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#B9C4D2" }}>
                      {paseos.conBoleta} cliente(s) cobrado(s) · ya entró {fmtCLP(paseos.pagado)}
                    </p>
                  </div>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "Georgia, serif", color: "#FFFFFF" }}>{fmtCLP(paseos.cobrado)}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Adiestramiento: lo que queda para Howria</h3>
        <p style={{ ...hint, marginTop: 4, marginBottom: 14 }}>
          Cada evaluación y clase que se cobra en el ciclo de {MESES[mes]}: lo que entró
          menos lo acordado con el adiestrador. Va por ciclo, no por el día en que se
          hizo — una evaluación de fines de agosto se cobra con septiembre, igual que
          las boletas. Solo suman las que ya tienen el monto acordado; las demás van
          abajo, sin contar.
        </p>

        {adiestramiento.filas.length === 0 ? (
          <p style={hint}>No hay evaluaciones ni clases que se cobren en el ciclo de {MESES[mes]}.</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {adiestramiento.filas.filter((f) => f.definido).map((f) => (
              <div key={f.cita.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8, padding: "10px 14px" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>
                    {f.cita.perro ? `🐾 ${f.cita.perro} · ` : ""}{f.cita.clienteNombre}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                    {f.cita.tipo === "evaluacion" ? "Evaluación" : "Clase"}
                    {" · hecha el "}{new Date(f.cita.fechaISO).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
                    {" · entró "}{fmtCLP(f.entro)}{" · al adiestrador "}{fmtCLP(f.alAdiestrador)}
                    {!f.cobrado && " · aún sin cobrar"}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 15.5, fontWeight: 700, fontFamily: "Georgia, serif", color: f.queda >= 0 ? VERDE : RUST }}>{fmtCLP(f.queda)}</p>
              </div>
            ))}

            {adiestramiento.filas.some((f) => f.definido) && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: NAVY, borderRadius: 8, padding: "12px 14px", marginTop: 4 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#EAE0C6", textTransform: "uppercase", letterSpacing: 0.5 }}>Queda para Howria</p>
                  <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#B9C4D2" }}>
                    Entró {fmtCLP(adiestramiento.entro)} · al adiestrador {fmtCLP(adiestramiento.pagado)}
                  </p>
                </div>
                <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "Georgia, serif", color: "#FFFFFF" }}>{fmtCLP(adiestramiento.queda)}</p>
              </div>
            )}

            {adiestramiento.sinDefinir.length > 0 && (
              <div style={{ background: "#FDF6E8", border: `1px solid ${GOLD}`, borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
                <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: INK }}>
                  {adiestramiento.sinDefinir.length} servicio(s) sin monto acordado con el adiestrador
                </p>
                <p style={{ margin: "3px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                  {adiestramiento.sinDefinir.map((f) => f.cita.clienteNombre).join(", ")}. No suman
                  arriba: hasta definir cuánto le toca a él, no se sabe cuánto te queda a ti.
                  Se define en Pago adiestramiento.
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="howria-card" style={{ ...tarjeta, marginTop: 20 }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Lo que me dejan los demás paseadores</h3>
        <p style={{ ...hint, marginTop: 4, marginBottom: 14 }}>
          De cada cliente que pasea otra persona: lo que paga el tutor menos lo que le
          pagas a ella por hacerlo. Se cuenta por paseos ya realizados, que es lo que
          Pago trabajadores te va a cobrar de verdad — así que mientras el mes corre,
          el costo todavía sube.
        </p>
        <p style={{ ...hint, marginTop: 0, marginBottom: 14 }}>
          Solo suma la gente que trabaja así contigo. Quien va por su cuenta queda
          abajo, apagado y sin sumar, hasta que lo marques.
          {otros.quedaSiCompleta !== otros.queda && (
            <> Se muestra el <b>mes completo</b>, que es lo que suma arriba; el botón de cada
            persona muestra cuánto lleva hasta ahora ({fmtCLP(otros.queda)} en total).</>
          )}
        </p>

        {!miPaseador ? (
          <p style={hint}>
            Elige arriba con qué cuenta de terreno paseas tú. Hasta saber cuál cartera es
            la tuya, no se puede separar lo que dejan los demás de lo que ya es tuyo.
          </p>
        ) : otros.grupos.length === 0 ? (
          <p style={hint}>Nadie más tiene clientes de paseo con movimiento en este ciclo.</p>
        ) : (
          <div style={{ display: "grid", gap: 16 }}>
            {otros.mios.map((g) => {
              // Proyección: los mismos números pero contando TODOS los paseos
              // del mes, no solo los ya marcados. Sirve para saber cuánto se le
              // va a pagar al cierre y cuánto margen queda de verdad — a
              // principio de mes el costo casi no ha corrido y el margen se ve
              // mucho más alto de lo que va a terminar siendo.
              const proy = !verHoy.includes(g.persona.id);
              const leTocaVisto = proy ? g.leTocaSiCompleta : g.leToca;
              const quedaVisto = proy ? g.quedaSiCompleta : g.queda;
              const nombreCorto = g.persona.nombre.split(" ")[0];
              return (
              <div key={g.persona.id} style={proy ? { background: "#FDF6E8", border: "1px dashed " + GOLD, borderRadius: 10, padding: 12 } : undefined}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY }}>
                      {g.persona.nombre}
                      {proy && <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, color: "#8A6A1E", textTransform: "uppercase", letterSpacing: 0.5 }}>mes completo</span>}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                      Tutores pagan {fmtCLP(g.tutores)} · a {nombreCorto} {fmtCLP(leTocaVisto)}
                      {proy ? " si hace todos los paseos del mes" : " por lo hecho hasta hoy"}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                    <p style={{ margin: 0, fontSize: 17, fontWeight: 700, fontFamily: "Georgia, serif", color: quedaVisto >= 0 ? VERDE : RUST }}>{fmtCLP(quedaVisto)}</p>
                    <button onClick={() => marcarMargen(g.persona.id, false)} title="Sacar: esta persona trabaja aparte"
                      style={{ border: "none", background: "none", color: "#A99C78", cursor: "pointer", fontSize: 11.5, textDecoration: "underline", padding: 0 }}>
                      trabaja aparte
                    </button>
                  </div>
                </div>

                <button onClick={() => alternarProyeccion(g.persona.id)}
                  style={{ border: "1px solid " + (proy ? NAVY : GOLD), background: proy ? NAVY : "none", color: proy ? "#FFFFFF" : GOLD, borderRadius: 20, padding: "6px 14px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", marginBottom: 8 }}>
                  {proy ? "Ver cuánto lleva hasta ahora" : "← Volver al mes completo"}
                </button>

                {proy && (
                  <p style={{ margin: "0 0 8px", fontSize: 11.5, color: "#8A6A1E" }}>
                    Si {nombreCorto} hace todos sus paseos programados del mes le pagarías
                    <b> {fmtCLP(g.leTocaSiCompleta)}</b> y te quedarían <b>{fmtCLP(g.quedaSiCompleta)}</b>.
                    Hasta ahora lleva {fmtCLP(g.leToca)} y te deja {fmtCLP(g.queda)}.
                  </p>
                )}

                <div style={{ display: "grid", gap: 4 }}>
                  {g.filas.map((f) => (
                    <div key={f.cliente.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8, padding: "9px 12px" }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY }}>
                          {f.cliente.perro ? `🐾 ${f.cliente.perro} · ` : ""}{String(f.cliente.nombre).trim()}
                        </p>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
                          {f.boletas === 0 ? "sin boleta este ciclo" : "tutor " + fmtCLP(f.tutorPaga)}
                          {" · "}{proy ? f.paseosSiCompleta : f.hechos} paseo(s) {proy ? "del mes" : "hecho(s)"} × {fmtCLP(f.tarifa)} = {fmtCLP(proy ? f.leTocaSiCompleta : f.leToca)}
                          {f.tarifa === 0 && f.paseosSiCompleta > 0 && " · ⚠ sin tarifa cargada"}
                        </p>
                      </div>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, fontFamily: "Georgia, serif", color: f.tutorPaga - (proy ? f.leTocaSiCompleta : f.leToca) >= 0 ? VERDE : RUST }}>
                        {fmtCLP(f.tutorPaga - (proy ? f.leTocaSiCompleta : f.leToca))}
                      </p>
                    </div>
                  ))}
                </div>

                {g.sinTarifa > 0 && (
                  <div style={{ background: "#FDF6E8", border: `1px solid ${GOLD}`, borderRadius: 8, padding: "9px 12px", marginTop: 6 }}>
                    <p style={{ margin: 0, fontSize: 11.5, color: INK }}>
                      {g.sinTarifa} cliente(s) sin tarifa de paseador cargada: el costo sale $0 y
                      tu ganancia se ve más alta de lo que es. Se arregla en la ficha del cliente.
                    </p>
                  </div>
                )}
              </div>
              );
            })}

            {otros.mios.length > 0 && (() => {
              const hayProyeccion = otros.mios.some((g) => !verHoy.includes(g.persona.id));
              const total = otros.mios.reduce((a, g) => a + (verHoy.includes(g.persona.id) ? g.queda : g.quedaSiCompleta), 0);
              return (
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: NAVY, borderRadius: 8, padding: "12px 14px" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#EAE0C6", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {hayProyeccion ? "Total que me dejarían con el mes completo" : "Total que me dejan"}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#B9C4D2" }}>
                      {hayProyeccion
                        ? `Proyección — hoy van ${fmtCLP(otros.queda)}`
                        : `${otros.mios.length} paseador(es) · de eso ya entró ${fmtCLP(otros.quedaCobrado)}`}
                    </p>
                  </div>
                  <p style={{ margin: 0, fontSize: 19, fontWeight: 700, fontFamily: "Georgia, serif", color: hayProyeccion ? "#EAE0C6" : "#FFFFFF" }}>{fmtCLP(total)}</p>
                </div>
              );
            })()}

            {otros.aparte.length > 0 && (
              <div>
                <p style={{ margin: "6px 0 6px", fontSize: 11.5, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Trabajan aparte — no suman
                </p>
                <div style={{ display: "grid", gap: 4 }}>
                  {otros.aparte.map((g) => (
                    <div key={g.persona.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#F7F4EC", border: "1px dashed #DCD2B4", borderRadius: 8, padding: "9px 12px" }}>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#8A7E5C" }}>{g.persona.nombre}</p>
                        <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#A99C78" }}>
                          {g.filas.length} cliente(s) · su margen no es tuyo
                        </p>
                      </div>
                      <button onClick={() => marcarMargen(g.persona.id, true)}
                        style={{ border: `1px solid ${GOLD}`, background: "none", color: GOLD, borderRadius: 20, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", flex: "none" }}>
                        Su margen es mío
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="howria-card" style={{ ...tarjeta, marginTop: 20 }}>
        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Mis gastos de {MESES[mes]}</h3>
        <p style={{ ...hint, marginTop: 4, marginBottom: 14 }}>
          Lo tuyo, no lo de la empresa: arriendo, comida, cuotas, lo que sea. Solo tú
          los ves — ni los otros administradores pueden. Lo que marques como
          “todos los meses” se repite solo, sin que lo vuelvas a escribir.
        </p>

        {/* La bandeja de lo que entró solo desde el iPhone. Aparece arriba
            del formulario porque es lo que hay que resolver; si no hay
            nada por revisar, no ocupa espacio. */}
        {porRevisar.length > 0 && (
          <div style={{ border: `1px solid ${GOLD}`, background: "#FBF6E9", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
            <p style={{ margin: "0 0 3px", fontSize: 13.5, fontWeight: 700, color: NAVY }}>
              {porRevisar.length} gasto(s) por revisar
            </p>
            <p style={{ ...hint, margin: "0 0 12px" }}>
              Llegaron solos desde tu teléfono. Ponles categoría y confirma para que cuenten,
              o descártalos si no eran tuyos.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {porRevisar.map((g) => (
                <div key={g.id} style={{ background: "#FFFFFF", border: "1px solid #EFE2C4", borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: NAVY, flex: "1 1 140px", minWidth: 0 }}>{g.descripcion}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(g.monto)}</span>
                    <span style={{ fontSize: 11.5, color: "#9A9179" }}>{g.fecha}</span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select defaultValue={g.categoria || "otros"} aria-label={`Categoría de ${g.descripcion}`}
                      onChange={(e) => confirmarGasto(g.id, e.target.value)}
                      style={{ ...input, margin: 0, flex: "1 1 150px", fontSize: 13 }}>
                      {CATEGORIAS_GASTO.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
                    </select>
                    <button type="button" onClick={() => confirmarGasto(g.id, g.categoria || "otros")}
                      style={{ border: "none", background: NAVY, color: "#FFFFFF", borderRadius: 20, padding: "8px 16px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", flex: "none" }}>
                      Confirmar
                    </button>
                    <button type="button" onClick={() => borrarGasto(g.id)}
                      style={{ border: `1px solid ${RUST}`, background: "none", color: RUST, borderRadius: 20, padding: "7px 14px", fontSize: 12.5, cursor: "pointer", flex: "none" }}>
                      Descartar
                    </button>
                  </div>
                  {g.origenTexto && (
                    <p style={{ margin: "8px 0 0", fontSize: 11, color: "#A2977C" }} title="Lo que mandó el teléfono, por si el monto o el nombre quedaron mal">
                      Tu teléfono envió: {g.origenTexto}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={agregarGasto} style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input value={gastoNuevo.descripcion} onChange={(e) => setGastoNuevo({ ...gastoNuevo, descripcion: e.target.value })}
              placeholder="En qué (arriendo, supermercado…)" aria-label="En qué gastaste"
              style={{ ...input, margin: 0, flex: "2 1 200px" }} />
            <input type="number" min="0" value={gastoNuevo.monto} onChange={(e) => setGastoNuevo({ ...gastoNuevo, monto: e.target.value })}
              placeholder="Cuánto" aria-label="Cuánto"
              style={{ ...input, margin: 0, flex: "1 1 110px" }} />
            <select value={gastoNuevo.categoria} onChange={(e) => setGastoNuevo({ ...gastoNuevo, categoria: e.target.value })}
              aria-label="Categoría" style={{ ...input, margin: 0, flex: "1 1 150px" }}>
              {CATEGORIAS_GASTO.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nombre}</option>)}
            </select>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: INK, cursor: "pointer" }}>
              <input type="checkbox" checked={gastoNuevo.fijo} onChange={(e) => setGastoNuevo({ ...gastoNuevo, fijo: e.target.checked })} />
              Se repite todos los meses
            </label>
            <button type="submit" disabled={!gastoNuevo.descripcion.trim() || !Number(gastoNuevo.monto)}
              style={{ border: "none", background: NAVY, color: "#FFFFFF", borderRadius: 20, padding: "8px 18px", fontSize: 12.5, fontWeight: 600,
                cursor: "pointer", opacity: !gastoNuevo.descripcion.trim() || !Number(gastoNuevo.monto) ? 0.5 : 1 }}>
              Agregar gasto
            </button>
          </div>
        </form>

        {cargandoGastos ? (
          <SkeletonLista filas={3} />
        ) : gastos.filas.length === 0 ? (
          <p style={hint}>Todavía no anotaste gastos en {MESES[mes]}.</p>
        ) : (
          <>
            <div style={{ display: "grid", gap: 4, marginBottom: 12 }}>
              {gastos.filas.map((g) => (
                <div key={g.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 8, padding: "9px 12px" }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: NAVY }}>
                      {catDe(g.categoria).emoji} {g.descripcion}
                      {g.fijo && <span style={{ marginLeft: 7, fontSize: 10.5, fontWeight: 700, color: "#8A6A1E", textTransform: "uppercase", letterSpacing: 0.4 }}>todos los meses</span>}
                    </p>
                    <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{catDe(g.categoria).nombre}</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
                    <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, fontFamily: "Georgia, serif", color: RUST }}>− {fmtCLP(g.monto)}</p>
                    {g.fijo ? (
                      <button onClick={() => darDeBajaFijo(g.id)} title="Deja de contar después de este mes, sin borrar los anteriores"
                        style={{ border: "none", background: "none", color: "#A99C78", cursor: "pointer", fontSize: 11.5, textDecoration: "underline", padding: 0 }}>
                        ya no lo pago
                      </button>
                    ) : (
                      <button onClick={() => borrarGasto(g.id)} aria-label={`Borrar ${g.descripcion}`}
                        style={{ border: "none", background: "none", color: "#A99C78", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0 }}>×</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {gastos.porCategoria.map((c) => (
                <span key={c.id} style={{ fontSize: 11.5, background: CREAM_SOFT, color: INK, borderRadius: 20, padding: "5px 12px" }}>
                  {c.emoji} {c.nombre} {fmtCLP(c.total)}
                </span>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "grid", gap: 8, borderTop: "1px solid #E4DBC3", paddingTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: INK }}>
            <span>Vas a ganar</span><b style={{ fontFamily: "Georgia, serif" }}>{fmtCLP(ganare)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: INK }}>
            <span>Tus gastos{gastos.fijos > 0 ? ` (${fmtCLP(gastos.fijos)} son fijos)` : ""}</span>
            <b style={{ fontFamily: "Georgia, serif", color: RUST }}>− {fmtCLP(gastos.total)}</b>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, background: limpio >= 0 ? VERDE : RUST, borderRadius: 10, padding: "14px 16px", marginTop: 4 }}>
            <div>
              <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: 0.5 }}>
                {limpio >= 0 ? `Te queda limpio en ${MESES[mes]}` : `Te falta en ${MESES[mes]}`}
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "rgba(255,255,255,0.8)" }}>
                {limpio >= 0
                  ? `De eso ya tienes en la mano ${fmtCLP(Math.max(0, yaEntro - gastos.total))}`
                  : "Tus gastos superan lo que vas a ganar este mes"}
              </p>
            </div>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif", color: "#FFFFFF" }}>{fmtCLP(limpio)}</p>
          </div>

          <button onClick={bajarLiquidacion} disabled={bajandoPdf}
            style={{ ...botonSecundario, width: "auto", margin: "4px 0 0", padding: "9px 18px", alignSelf: "flex-start", opacity: bajandoPdf ? 0.5 : 1 }}>
            {bajandoPdf ? "Generando…" : "Descargar mi liquidación del mes"}
          </button>
          <p style={{ ...hint, marginTop: 0 }}>
            Un PDF con todo lo de esta pestaña: de dónde salió cada peso, tus gastos y lo
            que te queda limpio. Es para ti — no es un documento tributario.
          </p>
        </div>
      </div>
    </div>
  );
}
