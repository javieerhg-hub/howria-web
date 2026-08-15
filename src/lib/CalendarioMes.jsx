// Grilla de calendario mensual reusable — la usan tanto el editor de
// disponibilidad del adiestrador (Agenda, en HowriaAdminResto.jsx) como
// el calendario de reserva público (AgendarPublico.jsx). Archivo chico y
// sin depender de HowriaAdmin.jsx/HowriaAdminResto.jsx a propósito, para
// que los dos bundles lo puedan importar sin acoplarse entre sí (mismo
// criterio que calculosBoletas.js).
import { diasDelMes } from "./calculosBoletas.js";

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const GOLD = "#C9A24B";
const INK = "#332E22";
const VERDE = "#2F6A46";
const VERDE_BG = "#D8ECDE";
const RUST = "#A85C3B";
const RUST_BG = "#F1DCD2";
const GRIS = "#9A9179";
const GRIS_BG = "#F1EEE4";

const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];
const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaKeyMes(anio, mesIdx, dia) {
  return `${anio}-${String(mesIdx + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// "disponible"/"bloqueado"/"pasado"/"sin-datos" — el padre decide cuál le
// corresponde a cada día (estadoDia).
const ESTILOS_ESTADO = {
  disponible: { background: VERDE_BG, border: `1.5px solid ${VERDE}`, color: VERDE, cursor: "pointer" },
  bloqueado: { background: RUST_BG, border: `1px solid ${RUST}`, color: RUST, cursor: "not-allowed" },
  pasado: { background: GRIS_BG, border: "1px solid #E4DBC3", color: GRIS, cursor: "not-allowed" },
  "sin-datos": { background: "#FFFFFF", border: "1px solid #E4DBC3", color: INK, cursor: "pointer" },
};

export function CalendarioMes({ anio, mesIdx, estadoDia, onClickDia, onCambiarMes, minMes, maxMes, seleccionado, soloDisponibleClickeable = false }) {
  const total = diasDelMes(mesIdx, anio);
  const primerDia = new Date(anio, mesIdx, 1).getDay();
  const offset = (primerDia + 6) % 7;
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(d);

  const puedeRetroceder = !minMes || anio > minMes.anio || (anio === minMes.anio && mesIdx > minMes.mesIdx);
  const puedeAvanzar = !maxMes || anio < maxMes.anio || (anio === maxMes.anio && mesIdx < maxMes.mesIdx);
  // Modo editor (soloDisponibleClickeable=false): cualquier día que no sea
  // pasado se puede tocar, para poder abrir/cerrar tanto los "sin-datos"
  // como los ya marcados "bloqueado". Modo público: solo los "disponible"
  // se pueden elegir — un cliente no puede reservar un día bloqueado o sin
  // marcar.
  const clickeables = soloDisponibleClickeable ? new Set(["disponible"]) : new Set(["disponible", "bloqueado", "sin-datos"]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button type="button" onClick={() => onCambiarMes(-1)} disabled={!puedeRetroceder}
          style={{ border: "none", background: "none", cursor: puedeRetroceder ? "pointer" : "default", opacity: puedeRetroceder ? 1 : 0.3, fontSize: 18, color: NAVY, padding: "4px 10px" }}>
          ‹
        </button>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY, textTransform: "capitalize" }}>{MESES_LARGO[mesIdx]} {anio}</p>
        <button type="button" onClick={() => onCambiarMes(1)} disabled={!puedeAvanzar}
          style={{ border: "none", background: "none", cursor: puedeAvanzar ? "pointer" : "default", opacity: puedeAvanzar ? 1 : 0.3, fontSize: 18, color: NAVY, padding: "4px 10px" }}>
          ›
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: GRIS, fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {celdas.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = fechaKeyMes(anio, mesIdx, d);
          const estado = estadoDia(key);
          const estilo = ESTILOS_ESTADO[estado] || ESTILOS_ESTADO["sin-datos"];
          const clickeable = clickeables.has(estado);
          const activo = seleccionado === key;
          return (
            <button key={i} type="button" onClick={() => clickeable && onClickDia(key)} disabled={!clickeable}
              style={{
                aspectRatio: "1", borderRadius: 6, fontSize: 13, fontWeight: activo ? 700 : 500,
                display: "flex", alignItems: "center", justifyContent: "center",
                ...estilo,
                ...(activo ? { background: NAVY, color: CREAM, border: `1.5px solid ${GOLD}` } : {}),
              }}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}
