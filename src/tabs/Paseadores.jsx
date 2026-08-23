// Pestaña Paseadores — el perfil de cada paseador/entrenador en un solo
// lugar: sus paseos del mes (hechos y sin marcar), cuánta plata lleva por
// cliente, y el avance contra su meta mensual. Antes eso estaba repartido
// entre Pago trabajadores (montos), Usuarios (donde se fija la meta, pero
// sin ver el avance) y Coordinación (el día a día).
// Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import {
  NAVY, CREAM_SOFT, GOLD, RUST, MESES, tarjeta, sectionTitle, hint, label,
  botonSecundario, SkeletonLista, fmtCLP, fechaKey,
} from "../HowriaAdmin.jsx";
import { CeldaDiaMes, filasDetalleMes, detalleMesCliente } from "./_compartido.jsx";

const VERDE = "#2F6A46";
const DIAS_CORTOS = ["L", "M", "X", "J", "V", "S", "D"];
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

// Calendario de un perro en particular: el mes completo en grilla de
// semanas (no la tira corrida de la ficha), para trabajar sobre un
// cliente puntual. Permite dos cosas distintas, separadas a propósito:
// marcar/desmarcar un día concreto (arriba) y cambiar qué días le tocan
// de aquí en adelante (abajo) — lo segundo afecta todas las semanas
// futuras, así que va aparte y advertido.
function CalendarioPerro({ cliente, paseador, registroPaseos, dias, anio, mes, hoy, realizados, monto, compartido, onToggleDia, onToggleDiaHabitual, onCerrar, onCambiarMes }) {
  // Relleno inicial para que el día 1 caiga en su columna real (0 = lunes).
  const offsetInicial = (new Date(anio, mes, 1).getDay() + 6) % 7;
  const habituales = cliente.diasHabituales || [];

  return (
    <div onClick={onCerrar} className="howria-modal-fondo" style={{ position: "fixed", inset: 0, zIndex: 10015, background: "rgba(18,42,64,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} className="howria-modal-caja" style={{ background: "#FFFFFF", borderRadius: 14, padding: 22, width: "100%", maxWidth: 460, maxHeight: "88vh", overflowY: "auto", boxShadow: "0 8px 30px rgba(20,33,61,0.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", minWidth: 0 }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", flex: "none", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, border: "2px solid #EDE4CE" }} />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ ...sectionTitle, fontSize: 17, margin: 0 }}>🐾 {cliente.perro || "Sin nombre"}</h3>
              <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>{cliente.nombre}{compartido ? " · paseo compartido" : ""}</p>
            </div>
          </div>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "none", fontSize: 20, color: "#8A7E5C", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, margin: "16px 0 10px" }}>
          <button onClick={() => onCambiarMes(-1)} style={{ ...botonSecundario, padding: "6px 11px", fontSize: 12, flex: "none" }}>←</button>
          <span style={{ fontWeight: 600, color: NAVY, fontSize: 13.5, textTransform: "capitalize" }}>{MESES[mes]} {anio}</span>
          <button onClick={() => onCambiarMes(1)} style={{ ...botonSecundario, padding: "6px 11px", fontSize: 12, flex: "none" }}>→</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
          {DIAS_CORTOS.map((d, i) => (
            <span key={i} style={{ textAlign: "center", fontSize: 10.5, fontWeight: 700, color: "#B0A587" }}>{d}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
          {Array.from({ length: offsetInicial }).map((_, i) => <span key={`v${i}`} />)}
          {dias.map((d) => {
            const editable = !compartido && d.estado !== "libre" && d.fecha <= hoy;
            // En la tira de la ficha los días que no le tocan van
            // invisibles (compacta), pero acá eso dejaba la grilla casi
            // vacía y no se leía como un mes: se muestran en gris suave
            // para que el calendario tenga forma de calendario.
            if (d.estado === "libre") {
              return (
                <span key={d.dia} style={{ display: "flex", justifyContent: "center" }}>
                  <span title={`${d.dia}/${mes + 1}: no le toca este día`}
                    style={{ width: 28, height: 28, borderRadius: 6, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#CFC7B0" }}>
                    {d.dia}
                  </span>
                </span>
              );
            }
            return (
              <span key={d.dia} style={{ display: "flex", justifyContent: "center" }}>
                <CeldaDiaMes dia={d.dia} estado={d.estado} mes={mes}
                  onClick={editable ? () => onToggleDia(d.fecha) : undefined}
                  titulo={d.fecha > hoy ? `${d.dia}/${mes + 1}: aún no llega` : undefined} />
              </span>
            );
          })}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, padding: "10px 12px", background: CREAM_SOFT, borderRadius: 9, fontSize: 12.5 }}>
          <span style={{ color: "#8A7E5C" }}>{realizados} paseo(s) este mes</span>
          <b style={{ color: NAVY }}>{fmtCLP(monto)}</b>
        </div>

        <p style={{ ...label, marginTop: 22, marginBottom: 4 }}>Días que le tocan</p>
        <p style={{ ...hint, marginTop: 0 }}>
          Esto cambia su horario <b>de aquí en adelante</b>, no solo este mes — los paseos ya marcados no se tocan.
        </p>
        {compartido ? (
          <p style={{ ...hint, marginTop: 6 }}>Este cliente es de otro paseador; su horario se edita desde el perfil de esa persona.</p>
        ) : (
          <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
            {DIAS_CORTOS.map((d, dow) => {
              const activo = habituales.includes(dow);
              return (
                <button key={dow} onClick={() => onToggleDiaHabitual(dow)} title={DIAS_LARGOS[dow]}
                  style={{
                    width: 38, height: 38, borderRadius: 9, cursor: "pointer", fontSize: 13, fontWeight: 700,
                    border: activo ? `1.5px solid ${GOLD}` : "1px solid #DCD2B4",
                    background: activo ? NAVY : "#FFFFFF", color: activo ? "#F3ECDC" : "#B0A587",
                  }}>
                  {d}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function BarraMeta({ monto, meta }) {
  if (!meta) return <p style={{ ...hint, margin: 0, fontSize: 11.5 }}>Sin meta fijada</p>;
  const pct = Math.min(100, Math.round((monto / meta) * 100));
  return (
    <div>
      <div style={{ width: "100%", height: 6, borderRadius: 4, background: "#EDE4CE", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: pct >= 100 ? VERDE : GOLD, borderRadius: 4 }} />
      </div>
      <p style={{ margin: "4px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>{pct}% de {fmtCLP(meta)}</p>
    </div>
  );
}

function Kpi({ etiqueta, valor, color = NAVY, fondo = CREAM_SOFT }) {
  return (
    <div style={{ background: fondo, borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C" }}>{etiqueta}</p>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color }}>{valor}</p>
    </div>
  );
}

// Totales del mes de un paseador, sumando todos sus clientes (los propios
// y aquellos donde recibió parte de un paseo compartido).
function totalesDelMes(clientes, paseador, registroPaseos, anio, mes, diasEnMes, hoyMedianoche) {
  const filas = filasDetalleMes(clientes, paseador, registroPaseos, anio, mes, diasEnMes);
  let realizados = 0, monto = 0, sinMarcar = 0, cancelados = 0;
  const porCliente = filas.map(({ cliente, compartido }) => {
    const d = detalleMesCliente({ cliente, compartido, paseador, registroPaseos, anio, mes, diasEnMes, hoyMedianoche });
    realizados += d.realizados; monto += d.monto; sinMarcar += d.sinMarcar; cancelados += d.cancelados;
    return { cliente, compartido, ...d };
  });
  return { porCliente, realizados, monto, sinMarcar, cancelados };
}

export function Paseadores({ clientes, setClientes, usuarios, registroPaseos, setRegistroPaseos, cargandoClientes }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const [mes, setMes] = useState(hoy.getMonth());
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [perfil, setPerfil] = useState(null); // nombre del paseador abierto
  const [perroAbierto, setPerroAbierto] = useState(null); // id local del cliente

  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  // Solo cuentas que de verdad salen a pasear — mismo filtro que ya usan
  // Coordinación, Clientes y Mapa.
  const equipoPaseo = useMemo(
    () => usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador"),
    [usuarios],
  );

  const resumen = useMemo(
    () => equipoPaseo.map((u) => ({
      usuario: u,
      ...totalesDelMes(clientes, u.nombre, registroPaseos, anio, mes, diasEnMes, hoy),
    })),
    [equipoPaseo, clientes, registroPaseos, anio, mes, diasEnMes],
  );

  function cambiarMes(delta) {
    let m = mes + delta, a = anio;
    if (m < 0) { m = 11; a -= 1; } else if (m > 11) { m = 0; a += 1; }
    setMes(m); setAnio(a);
  }

  // Mismo comportamiento que "Marcar hecho" en Coordinación
  // (toggleRealizadoDia): al desmarcar se borra también el reparto, porque
  // un paseo no realizado no debería seguir repartiendo pago con nadie.
  function toggleRealizado(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    const marcando = !registroPaseos[key]?.realizado;
    setRegistroPaseos((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}), realizado: marcando, cancelado: false,
        ...(marcando ? {} : { compartidoCon: null, porcentajeCompartido: null }),
      },
    }));
  }

  // Cambia el horario del cliente de aquí en adelante — mismo mecanismo
  // que "Horario por paseador" en Coordinación (toggleDiaCliente).
  function toggleDiaHabitual(clienteId, dow) {
    setClientes((prev) => prev.map((c) => {
      if (c.id !== clienteId) return c;
      const dias = c.diasHabituales || [];
      const tiene = dias.includes(dow);
      return { ...c, diasHabituales: tiene ? dias.filter((d) => d !== dow) : [...dias, dow].sort((a, b) => a - b) };
    }));
  }

  const NavMes = (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <button onClick={() => cambiarMes(-1)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12.5 }}>← Mes anterior</button>
      <span style={{ fontWeight: 600, color: NAVY, fontSize: 13.5, textTransform: "capitalize" }}>{MESES[mes]} {anio}</span>
      <button onClick={() => cambiarMes(1)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12.5 }}>Mes siguiente →</button>
    </div>
  );

  if (perfil) {
    const fila = resumen.find((r) => r.usuario.nombre === perfil);
    if (!fila) return null;
    const { usuario: u, porCliente, realizados, monto, sinMarcar, cancelados } = fila;
    return (
      <>
        <button onClick={() => setPerfil(null)} style={{ ...botonSecundario, marginBottom: 18, width: "auto" }}>← Volver a paseadores</button>
        <div className="howria-card" style={tarjeta}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", flex: "none", background: u.fotoUrl ? `url(${u.fotoUrl}) center/cover` : CREAM_SOFT, border: `2px solid ${CREAM_SOFT}` }} />
              <div>
                <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 2 }}>{u.nombre}</h2>
                <p style={{ margin: 0, color: "#8A7E5C", fontSize: 13, textTransform: "capitalize" }}>{u.rol}</p>
              </div>
            </div>
            {NavMes}
          </div>

          <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 20 }}>
            <Kpi etiqueta="Paseos hechos" valor={realizados} color={VERDE} fondo="#D8ECDE" />
            <Kpi etiqueta="Sin marcar" valor={sinMarcar} color={sinMarcar > 0 ? RUST : NAVY} fondo={sinMarcar > 0 ? "#F1DCD2" : CREAM_SOFT} />
            <Kpi etiqueta="Cancelados" valor={cancelados} />
            <Kpi etiqueta="A recibir este mes" valor={fmtCLP(monto)} />
          </div>

          <div style={{ marginTop: 16 }}>
            <p style={{ ...label, marginBottom: 6 }}>Meta mensual</p>
            <BarraMeta monto={monto} meta={u.metaMensual} />
          </div>

          <p style={{ ...label, marginTop: 26 }}>Paseos por cliente</p>
          <p style={{ ...hint, marginTop: 0 }}>
            Cada cuadradito es un día del mes. Tócalo para marcar o desmarcar ese paseo — los días que aún no llegan no se pueden marcar.
          </p>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11.5, color: "#8A7E5C", margin: "10px 0 16px" }}>
            {[["Realizado", { background: VERDE }], ["Falta marcar", { border: `1px dashed ${RUST}` }],
              ["Cancelado", { background: "#EDE4CE" }], ["Aún no llega", { border: "1px solid #EDE4CE" }]].map(([texto, estilo]) => (
              <span key={texto} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, display: "inline-block", ...estilo }} /> {texto}
              </span>
            ))}
          </div>

          {porCliente.length === 0 && <p style={{ ...hint, textAlign: "center" }}>Sin clientes ni paseos compartidos este mes.</p>}

          {porCliente.map(({ cliente, compartido, tarifa, realizados: rc, monto: mc, dias }) => (
            <div key={cliente.id} style={{ padding: "12px 0", borderBottom: "1px solid #EDE4CE" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
                {/* Abre el calendario del perro: el mes en grilla, para
                    trabajar sobre este cliente puntual sin perderse entre
                    la tira de cuadraditos de todos. */}
                <button onClick={() => setPerroAbierto(cliente.id)}
                  style={{ border: "none", background: "none", padding: 0, font: "inherit", cursor: "pointer", textAlign: "left", fontSize: 13.5, fontWeight: 600, color: NAVY }}>
                  {cliente.nombre}{compartido ? " 🤝" : ""}
                  <span style={{ fontWeight: 400, color: "#8A7E5C", fontSize: 12 }}> · 🐾 {cliente.perro || "sin nombre"} · {tarifa > 0 ? `${fmtCLP(tarifa)} por paseo` : "sin tarifa cargada"}</span>
                  <span style={{ color: GOLD, fontSize: 11.5, marginLeft: 6 }}>ver calendario →</span>
                </button>
                <span style={{ fontSize: 12.5, color: "#8A7E5C", whiteSpace: "nowrap" }}>{rc} paseo(s) · <b style={{ color: NAVY }}>{fmtCLP(mc)}</b></span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                {dias.map((d) => {
                  // Un paseo compartido se edita en Coordinación (ahí se
                  // define el reparto), no desde acá.
                  const editable = !compartido && d.estado !== "libre" && d.fecha <= hoy;
                  return (
                    <CeldaDiaMes key={d.dia} dia={d.dia} estado={d.estado} mes={mes}
                      onClick={editable ? () => toggleRealizado(cliente.id, d.fecha) : undefined}
                      titulo={d.estado === "libre" ? "" : d.fecha > hoy ? `${d.dia}/${mes + 1}: aún no llega` : undefined} />
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {(() => {
          if (perroAbierto == null) return null;
          const fila = porCliente.find((f) => f.cliente.id === perroAbierto);
          if (!fila) return null;
          return (
            <CalendarioPerro
              cliente={fila.cliente} paseador={u.nombre} compartido={fila.compartido}
              registroPaseos={registroPaseos} dias={fila.dias} anio={anio} mes={mes} hoy={hoy}
              realizados={fila.realizados} monto={fila.monto}
              onToggleDia={(fecha) => toggleRealizado(fila.cliente.id, fecha)}
              onToggleDiaHabitual={(dow) => toggleDiaHabitual(fila.cliente.id, dow)}
              onCambiarMes={cambiarMes}
              onCerrar={() => setPerroAbierto(null)}
            />
          );
        })()}
      </>
    );
  }

  return (
    <div className="howria-card" style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={sectionTitle}>Paseadores</h2>
          <p style={hint}>Cómo va cada uno este mes. Toca a alguien para ver el detalle por cliente y corregir sus paseos.</p>
        </div>
        {NavMes}
      </div>

      {cargandoClientes ? (
        <div style={{ marginTop: 18 }}><SkeletonLista filas={3} alto={92} gap={12} /></div>
      ) : resumen.length === 0 ? (
        <p style={{ ...hint, marginTop: 18 }}>No hay paseadores ni entrenadores cargados todavía.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 14, marginTop: 18 }}>
          {resumen.map(({ usuario: u, realizados, monto, sinMarcar, porCliente }) => (
            <button key={u.id} onClick={() => setPerfil(u.nombre)} className="howria-card"
              style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 14, padding: 16, cursor: "pointer", font: "inherit" }}>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
                <div style={{ width: 42, height: 42, borderRadius: "50%", flex: "none", background: u.fotoUrl ? `url(${u.fotoUrl}) center/cover` : CREAM_SOFT, border: "2px solid #EDE4CE" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nombre}</div>
                  <div style={{ fontSize: 12, color: "#8A7E5C" }}>{porCliente.length} cliente(s)</div>
                </div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ color: "#8A7E5C" }}>Paseos hechos</span>
                <b style={{ color: VERDE }}>{realizados}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ color: "#8A7E5C" }}>Sin marcar</span>
                <b style={{ color: sinMarcar > 0 ? RUST : "#8A7E5C" }}>{sinMarcar}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 12 }}>
                <span style={{ color: "#8A7E5C" }}>A recibir</span>
                <b style={{ color: NAVY }}>{fmtCLP(monto)}</b>
              </div>
              <BarraMeta monto={monto} meta={u.metaMensual} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
