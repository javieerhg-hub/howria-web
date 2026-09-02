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
//
// El vínculo cuenta-admin ↔ cuenta-paseador se guarda en
// usuarios.paseador_vinculado (database/120) en vez de escribir un nombre
// en el código.
import { useState, useMemo } from "react";
import {
  NAVY, CREAM_SOFT, GOLD, RUST, INK, MESES, tarjeta, sectionTitle, hint, input,
  botonSecundario, SkeletonLista, fmtCLP, esBoletaDeCliente,
} from "../HowriaAdmin.jsx";
import { diasDelMesProgramados } from "../lib/programacion.js";
import { periodoDeBoleta, esVenta } from "../lib/calculosBoletas.js";

const VERDE = "#2F6A46";

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
  citasAgenda = [], reprogramaciones = [], user, cargando,
}) {
  // El user de la sesión es una foto del momento del login: si el vínculo
  // se elige acá mismo, hay que leerlo de la lista viva para que la
  // pantalla reaccione sin recargar.
  const yo = usuarios.find((u) => u.id === user?.id) || user || {};
  const miPaseador = yo.paseadorVinculado || "";
  const enTerreno = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador");

  const [offset, setOffset] = useState(0);
  const hoy = new Date();
  const ref = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
  const mes = ref.getMonth(), anio = ref.getFullYear();
  const tituloPeriodo = `${MESES[mes]} ${anio}`;

  function vincular(nombre) {
    setUsuarios((prev) => prev.map((u) => (u.id === yo.id ? { ...u, paseadorVinculado: nombre || null } : u)));
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
        const d = new Date(c.fechaISO);
        return d.getMonth() === mes && d.getFullYear() === anio;
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

  const ganare = paseos.cobrado + adiestramiento.queda;
  const yaEntro = paseos.pagado + adiestramiento.quedaCobrado;

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

      <div className="howria-card" style={{ ...tarjeta, marginBottom: 20 }}>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          <Kpi titulo={`Ganarás en ${MESES[mes]}`} valor={fmtCLP(ganare)} color={VERDE}
            detalle={`Paseos ${fmtCLP(paseos.cobrado)} · adiestramiento ${fmtCLP(adiestramiento.queda)}`} />
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
          Cada evaluación y clase hecha en {MESES[mes]}: lo que entró menos lo acordado
          con el adiestrador. Solo suman las que ya tienen el monto acordado — las
          demás van abajo, sin contar.
        </p>

        {adiestramiento.filas.length === 0 ? (
          <p style={hint}>No hay evaluaciones ni clases realizadas en {MESES[mes]}.</p>
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
                    {" · "}{new Date(f.cita.fechaISO).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}
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
    </div>
  );
}
