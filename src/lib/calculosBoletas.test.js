import { describe, it, expect } from "vitest";
import {
  esFinDeSemanaOFeriado, valorConRecargo, diasSegunPlan,
  calcularBoletaPaseos, calcularBoletaAdiestramiento, calcularTotales,
  esVenta, esPorCobrar, montoParaResponsable,
  periodoDeBoleta, cicloDeFecha,
} from "./calculosBoletas.js";

describe("esFinDeSemanaOFeriado", () => {
  it("un martes cualquiera no tiene recargo", () => {
    expect(esFinDeSemanaOFeriado(new Date(2026, 7, 4))).toBe(false); // martes 4 de agosto 2026
  });

  it("sábado y domingo sí tienen recargo", () => {
    expect(esFinDeSemanaOFeriado(new Date(2026, 7, 8))).toBe(true); // sábado
    expect(esFinDeSemanaOFeriado(new Date(2026, 7, 9))).toBe(true); // domingo
  });

  it("un feriado en día de semana también tiene recargo", () => {
    expect(esFinDeSemanaOFeriado(new Date(2026, 7, 15))).toBe(true); // 15 de agosto, feriado, sábado además
    expect(esFinDeSemanaOFeriado(new Date(2026, 8, 18))).toBe(true); // 18 de septiembre 2026, viernes
  });
});

describe("valorConRecargo", () => {
  it("sin recargo devuelve el valor tal cual", () => {
    expect(valorConRecargo(8000, false, 30)).toBe(8000);
  });

  it("con 30% de recargo sobre $8.000 da $10.400", () => {
    expect(valorConRecargo(8000, true, 30)).toBe(10400);
  });

  it("redondea el resultado", () => {
    expect(valorConRecargo(8500, true, 25)).toBe(Math.round(8500 * 1.25));
  });

  it("usa 30% por defecto si no se pasa pct", () => {
    expect(valorConRecargo(10000, true)).toBe(13000);
  });
});

describe("diasSegunPlan", () => {
  it("plan lunes/miércoles/viernes en agosto 2026 devuelve las fechas correctas", () => {
    // agosto 2026: lunes=0 en la convención de la app (0=lunes..6=domingo)
    const dias = diasSegunPlan(7, 2026, [0, 2, 4]); // mesIdx 7 = agosto
    expect(dias).toEqual([3, 5, 7, 10, 12, 14, 17, 19, 21, 24, 26, 28, 31]);
  });

  it("plan solo martes y jueves en agosto 2026", () => {
    const dias = diasSegunPlan(7, 2026, [1, 3]);
    expect(dias).toEqual([4, 6, 11, 13, 18, 20, 25, 27]);
  });
});

describe("calcularBoletaPaseos", () => {
  it("calcula subtotal, descuento, total y el desglose de IVA de un mes mixto", () => {
    // agosto 2026, plan L-M-V (recargo el sábado 1 y feriado sábado 15 no
    // aplican porque el plan no cae esos días — se agrega el 8 a mano
    // como paseo de fin de semana para probar el recargo)
    const dias = [...diasSegunPlan(7, 2026, [0, 2, 4]), 8]; // + sábado 8
    const r = calcularBoletaPaseos({
      dias, mesIdx: 7, anio: 2026, valorPaseo: 8000, recargoPct: 30,
      paseosMesAnterior: 0, paseosCancelados: 1, montoDogsitter: 0, montoPaseoLargo: 0,
    });
    expect(r.diasConRecargo).toEqual([8]);
    expect(r.diasNormales.length).toBe(13);
    // 13 paseos normales x 8000 + 1 paseo con recargo (10400) - 1 paseo cancelado (8000)
    expect(r.subtotal).toBe(13 * 8000 + 10400);
    expect(r.descuento).toBe(8000);
    expect(r.total).toBe(r.subtotal - r.descuento);
    expect(r.neto + r.iva).toBe(r.total);
    expect(r.neto).toBe(Math.round(r.total / 1.19));
  });

  it("suma dogsitter y paseo largo al subtotal", () => {
    const r = calcularBoletaPaseos({
      dias: [3], mesIdx: 7, anio: 2026, valorPaseo: 8000, recargoPct: 30,
      montoDogsitter: 15000, montoPaseoLargo: 5000,
    });
    expect(r.subtotal).toBe(8000 + 15000 + 5000);
  });

  it("el total nunca queda negativo aunque el descuento supere el subtotal", () => {
    const r = calcularBoletaPaseos({
      dias: [3], mesIdx: 7, anio: 2026, valorPaseo: 8000, paseosCancelados: 10,
    });
    expect(r.total).toBe(0);
  });
});

describe("calcularBoletaAdiestramiento", () => {
  it("4 clases sin descuento", () => {
    const r = calcularBoletaAdiestramiento({ numClases: 4, precioClase: 15000 });
    expect(r.subtotalClases).toBe(60000);
    expect(r.montoDescuento).toBe(0);
    expect(r.total).toBe(60000);
  });

  it("combina descuento por porcentaje y por monto fijo", () => {
    const r = calcularBoletaAdiestramiento({
      numClases: 4, precioClase: 15000, descuentoPackPct: 10, descuentoPackMonto: 5000,
    });
    // subtotal 60000, 10% = 6000, + 5000 fijo = 11000 de descuento
    expect(r.montoDescuentoPct).toBe(6000);
    expect(r.montoDescuento).toBe(11000);
    expect(r.total).toBe(60000 - 11000);
  });

  it("suma evaluación y transporte al total", () => {
    const r = calcularBoletaAdiestramiento({
      numClases: 4, precioClase: 15000, evaluacion: "presencial", precioEvaluacion: 20000, transporte: 3000,
    });
    expect(r.montoEvaluacion).toBe(20000);
    expect(r.total).toBe(60000 + 20000 + 3000);
  });

  it('no cuenta el precio de evaluación si evaluacion es "ninguna"', () => {
    const r = calcularBoletaAdiestramiento({
      numClases: 4, precioClase: 15000, evaluacion: "ninguna", precioEvaluacion: 20000,
    });
    expect(r.montoEvaluacion).toBe(0);
    expect(r.total).toBe(60000);
  });

  describe("evaluación suelta (sin clases)", () => {
    it("con 0 clases el total es solo la evaluación", () => {
      const r = calcularBoletaAdiestramiento({
        numClases: 0, precioClase: 0, evaluacion: "presencial", precioEvaluacion: 25000,
      });
      expect(r.subtotalClases).toBe(0);
      expect(r.total).toBe(25000);
    });

    it("le suma el transporte si lo hay", () => {
      const r = calcularBoletaAdiestramiento({
        numClases: 0, precioClase: 0, evaluacion: "online", precioEvaluacion: 20000, transporte: 5000,
      });
      expect(r.total).toBe(25000);
    });
  });

  describe("pack con precio puesto a mano", () => {
    it("el precio escrito es el total, sin recalcular nada", () => {
      const r = calcularBoletaAdiestramiento({ packPrecioManual: true, packPrecio: 80000 });
      expect(r.total).toBe(80000);
    });

    it("ignora clases, descuentos, evaluación y transporte", () => {
      // Todo esto sumaría/restaría en el modo normal — en un pack a mano
      // es solo descripción de qué trae, no entra en el precio.
      const r = calcularBoletaAdiestramiento({
        packPrecioManual: true, packPrecio: 80000,
        numClases: 8, precioClase: 15000, descuentoPackPct: 10, descuentoPackMonto: 5000,
        evaluacion: "presencial", precioEvaluacion: 20000, transporte: 3000,
      });
      expect(r.total).toBe(80000);
      expect(r.montoDescuento).toBe(0);
      expect(r.montoEvaluacion).toBe(0);
    });

    it("nunca devuelve un total negativo", () => {
      const r = calcularBoletaAdiestramiento({ packPrecioManual: true, packPrecio: -5000 });
      expect(r.total).toBe(0);
    });

    it("un pack sin precio todavía escrito da 0, no NaN", () => {
      const r = calcularBoletaAdiestramiento({ packPrecioManual: true, packPrecio: "" });
      expect(r.total).toBe(0);
    });
  });
});

describe("calcularTotales", () => {
  it("suma ingresos, paseos y descuentos de una lista de boletas", () => {
    const lista = [
      { total: 80000, cantidad: 10, descuento: 0 },
      { total: 72000, cantidad: 9, descuento: 8000 },
      { total: 45000, cantidad: 5, descuento: 0 },
    ];
    const r = calcularTotales(lista);
    expect(r.ingresos).toBe(197000);
    expect(r.paseos).toBe(24);
    expect(r.descuentos).toBe(8000);
    expect(r.cantidad).toBe(3);
  });

  it("lista vacía da todo en cero", () => {
    expect(calcularTotales([])).toEqual({ ingresos: 0, paseos: 0, descuentos: 0, cantidad: 0 });
  });
});

describe("esVenta", () => {
  it("no_enviada no cuenta como venta", () => {
    expect(esVenta({ estado: "no_enviada" })).toBe(false);
  });
  it("pendiente_pago cuenta como venta", () => {
    expect(esVenta({ estado: "pendiente_pago" })).toBe(true);
  });
  it("pagada cuenta como venta", () => {
    expect(esVenta({ estado: "pagada" })).toBe(true);
  });
  it("cancelada no cuenta como venta", () => {
    expect(esVenta({ estado: "cancelada" })).toBe(false);
  });
});

describe("esPorCobrar", () => {
  it("no_enviada no cuenta como por cobrar (todavía no la revisó el equipo)", () => {
    expect(esPorCobrar({ estado: "no_enviada" })).toBe(false);
  });
  it("pendiente_pago sí cuenta como por cobrar", () => {
    expect(esPorCobrar({ estado: "pendiente_pago" })).toBe(true);
  });
  it("pagada ya no cuenta como por cobrar", () => {
    expect(esPorCobrar({ estado: "pagada" })).toBe(false);
  });
  it("cancelada no cuenta como por cobrar", () => {
    expect(esPorCobrar({ estado: "cancelada" })).toBe(false);
  });
});

describe("montoParaResponsable", () => {
  it("una boleta de paseo siempre devuelve el total completo (sin reparto)", () => {
    expect(montoParaResponsable({ _tipo: "paseo", total: 100000, montoResponsable: 30000 })).toBe(100000);
  });

  it("adiestramiento sin reparto definido devuelve el total completo", () => {
    expect(montoParaResponsable({ _tipo: "adiestramiento", total: 220000 })).toBe(220000);
  });

  it("adiestramiento con reparto definido devuelve el monto del responsable", () => {
    expect(montoParaResponsable({ _tipo: "adiestramiento", total: 220000, montoResponsable: 180000 })).toBe(180000);
  });

  it("un reparto de 0 (todo para Howria) se respeta, no cae al total", () => {
    expect(montoParaResponsable({ _tipo: "adiestramiento", total: 220000, montoResponsable: 0 })).toBe(0);
  });
});

// Howria cobra por adelantado: los cobros salen entre el 28 y el 5 y
// cubren el mes siguiente. Dónde cae una boleta define en qué mes se ve
// la plata, así que conviene tenerlo fijado.
describe("cicloDeFecha y periodoDeBoleta", () => {
  // Howria factura por ciclo: el cobro de un mes se genera entre el 20 del
  // mes anterior y el 5 de ese mes. El ciclo cierra el dia 5.
  it("una boleta de fin de mes es del ciclo siguiente", () => {
    const p = periodoDeBoleta({ fechaISO: "2026-08-31T22:00:00-04:00" });
    expect(p.getMonth()).toBe(8); // septiembre
    expect(p.getDate()).toBe(1);
  });

  it("el dia 5 todavia es del ciclo que cierra", () => {
    expect(cicloDeFecha("2026-09-05T18:00:00-04:00").getMonth()).toBe(8);
  });

  it("el dia 6 ya es del ciclo siguiente", () => {
    expect(cicloDeFecha("2026-09-06T09:00:00-04:00").getMonth()).toBe(9); // octubre
  });

  // Diciembre tiene que saltar de anio, no quedarse en el mes 12.
  it("cruza el anio", () => {
    const p = cicloDeFecha("2026-12-28T10:00:00-03:00");
    expect(p.getMonth()).toBe(0);
    expect(p.getFullYear()).toBe(2027);
  });

  // El mes elegido a mano ya NO manda: era donde se colaba el error de
  // dejar en agosto una boleta emitida el 31 de agosto.
  it("ignora el mes escrito a mano y usa la fecha de emision", () => {
    const p = periodoDeBoleta({ mes: "agosto", anio: 2026, fechaISO: "2026-08-31T22:00:00-04:00" });
    expect(p.getMonth()).toBe(8); // septiembre, no agosto
  });

  it("devuelve null si no hay fecha", () => {
    expect(periodoDeBoleta({})).toBe(null);
  });
});
