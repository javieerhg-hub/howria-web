import { useState, useEffect } from "react";
import { PawPrint, Moon, Calendar, Wallet, ClipboardCheck, CalendarClock, TrendingUp, LogOut, ChevronRight, Check, X } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

async function supaFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.method === "PATCH" ? "return=representation" : undefined,
      ...options.headers,
    },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const NAVY = "#14213D";
const CREAM = "#F5EFE0";
const GOLD = "#C9962F";
const FOREST = "#3F5D4E";
const CHARCOAL = "#211E1B";

const clientesDemo = [
  { id: 1, nombre: "Remo", dueno: "Joaquín Pérez", servicio: "Adiestramiento", proximaFecha: "Lun 3 ago, 17:00" },
];

const historialPaseos = [
  { fecha: "28 jul", tipo: "Paseo", estado: "Realizado" },
  { fecha: "26 jul", tipo: "Paseo", estado: "Realizado" },
  { fecha: "24 jul", tipo: "Clase de adiestramiento", estado: "Realizado" },
  { fecha: "21 jul", tipo: "Paseo", estado: "No realizado" },
];

const pagosDemo = [
  { concepto: "Pack 4 clases adiestramiento", monto: 200000, estado: "Pendiente" },
  { concepto: "Paseos julio", monto: 45000, estado: "Pagado" },
];

const clientesTrabajador = [
  { nombre: "Remo", horario: "Lun-Mié-Vie 09:00", tarifa: 8000, marcadoHoy: null },
  { nombre: "Toby", horario: "Mar-Jue 10:30", tarifa: 7500, marcadoHoy: null },
  { nombre: "Luna", horario: "Todos los días 08:00", tarifa: 9000, marcadoHoy: null },
  { nombre: "Kira", horario: "Lun a vie 16:00", tarifa: 8500, marcadoHoy: null },
];

function MoonBadge({ filled = 0.6, size = 18 }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: GOLD, position: "relative", overflow: "hidden", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 0, right: 0, width: `${(1 - filled) * 100}%`, height: "100%", background: NAVY }} />
    </div>
  );
}

function LoginScreen({ onLogin }) {
  const [tipo, setTipo] = useState("cliente");
  const [estadoConexion, setEstadoConexion] = useState("Conectando con la base de datos…");

  useEffect(() => {
    supaFetch("trabajadores?select=nombre")
      .then((data) => setEstadoConexion(`Conectado — ${data.length} trabajador(es) registrado(s)`))
      .catch(() => setEstadoConexion("No se pudo conectar a la base de datos"));
  }, []);

  return (
    <div style={{ minHeight: 560, background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", padding: "2rem 1rem" }}>
      <div style={{ width: "100%", maxWidth: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6, justifyContent: "center" }}>
          <Moon size={22} color={GOLD} strokeWidth={1.5} />
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: CREAM, letterSpacing: 0.5 }}>Howria</span>
        </div>
        <p style={{ textAlign: "center", color: "#9AA3B5", fontSize: 13.5, marginBottom: 32, letterSpacing: 0.3 }}>
          Paseos y adiestramiento canino
        </p>

        <div style={{ display: "flex", background: "rgba(255,255,255,0.06)", borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {["cliente", "trabajador"].map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 7, border: "none", cursor: "pointer",
                background: tipo === t ? GOLD : "transparent",
                color: tipo === t ? NAVY : "#C9CEDA",
                fontWeight: 500, fontSize: 13.5, textTransform: "capitalize", transition: "all .15s"
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input placeholder={tipo === "cliente" ? "correo@ejemplo.com" : "usuario"} style={inputStyle} />
          <input placeholder="contraseña" type="password" style={inputStyle} />
          <button
            onClick={() => onLogin(tipo)}
            style={{
              marginTop: 8, padding: "12px 0", borderRadius: 8, border: "none", cursor: "pointer",
              background: GOLD, color: NAVY, fontWeight: 500, fontSize: 14.5,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6
            }}
          >
            Entrar <ChevronRight size={16} />
          </button>
        </div>
        <p style={{ textAlign: "center", color: "#6B7488", fontSize: 12, marginTop: 20 }}>
          {estadoConexion}
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  padding: "11px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
  background: "rgba(255,255,255,0.05)", color: CREAM, fontSize: 14, outline: "none"
};

function TopBar({ nombre, rol, onLogout }) {
  return (
    <div style={{ background: NAVY, color: CREAM, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Moon size={18} color={GOLD} strokeWidth={1.5} />
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 18 }}>Howria</span>
        <span style={{ color: "#7C8598", fontSize: 12.5, marginLeft: 6 }}>· {rol}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ fontSize: 13.5, color: "#C9CEDA" }}>{nombre}</span>
        <button onClick={onLogout} style={{ background: "none", border: "none", color: "#9AA3B5", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}>
          <LogOut size={14} /> Salir
        </button>
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6E1D3", padding: "18px 20px", ...style }}>
      {children}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <Icon size={16} color={FOREST} strokeWidth={2} />
      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16.5, color: CHARCOAL }}>{children}</span>
    </div>
  );
}

function ClientePanel({ onLogout }) {
  const perro = clientesDemo[0];
  return (
    <div style={{ background: CREAM, minHeight: 560, fontFamily: "'Inter', sans-serif" }}>
      <TopBar nombre={perro.dueno} rol="portal cliente" onLogout={onLogout} />
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 640, margin: "0 auto" }}>

        <Card style={{ background: FOREST, border: "none" }}>
          <p style={{ color: "#CFE0D6", fontSize: 12.5, margin: 0, letterSpacing: 0.3 }}>Próxima sesión de {perro.nombre}</p>
          <p style={{ color: "#fff", fontSize: 20, fontFamily: "'Fraunces', serif", margin: "4px 0 0" }}>{perro.proximaFecha}</p>
          <p style={{ color: "#CFE0D6", fontSize: 13, margin: "2px 0 0" }}>{perro.servicio}</p>
        </Card>

        <Card>
          <SectionLabel icon={Calendar}>Historial de {perro.nombre}</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {historialPaseos.map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < historialPaseos.length - 1 ? "1px solid #EFEBE0" : "none" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: CHARCOAL }}>{h.tipo}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#8C8676" }}>{h.fecha}</p>
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 500, padding: "3px 10px", borderRadius: 20,
                  background: h.estado === "Realizado" ? "#E7F0EA" : "#F5E4E0",
                  color: h.estado === "Realizado" ? "#2E5C41" : "#9C4B34"
                }}>
                  {h.estado}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel icon={Wallet}>Pagos</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {pagosDemo.map((p, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: i < pagosDemo.length - 1 ? "1px solid #EFEBE0" : "none" }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, color: CHARCOAL }}>{p.concepto}</p>
                  <p style={{ margin: 0, fontSize: 12.5, color: "#8C8676" }}>${p.monto.toLocaleString("es-CL")}</p>
                </div>
                {p.estado === "Pendiente" ? (
                  <button style={{ background: GOLD, color: NAVY, border: "none", borderRadius: 7, padding: "7px 14px", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>
                    Pagar
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: "#2E5C41", fontWeight: 500 }}>Pagado</span>
                )}
              </div>
            ))}
          </div>
        </Card>

        <button style={{
          background: "none", border: `1.5px solid ${FOREST}`, color: FOREST, borderRadius: 8,
          padding: "12px 0", fontSize: 14, fontWeight: 500, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6
        }}>
          <CalendarClock size={16} /> Solicitar nuevo servicio
        </button>
      </div>
    </div>
  );
}

function TrabajadorPanel({ onLogout }) {
  const [clientes, setClientes] = useState(clientesTrabajador);
  const marcar = (idx, hecho) => {
    setClientes((prev) => prev.map((c, i) => (i === idx ? { ...c, marcadoHoy: hecho } : c)));
  };
  const ganadoHoy = clientes.filter((c) => c.marcadoHoy === true).reduce((s, c) => s + c.tarifa, 0);
  const ganadoMes = 612000 + ganadoHoy;

  return (
    <div style={{ background: CREAM, minHeight: 560, fontFamily: "'Inter', sans-serif" }}>
      <TopBar nombre="Javier" rol="portal trabajador" onLogout={onLogout} />
      <div style={{ padding: "24px", display: "flex", flexDirection: "column", gap: 20, maxWidth: 640, margin: "0 auto" }}>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Card style={{ background: NAVY, border: "none" }}>
            <p style={{ color: "#9AA3B5", fontSize: 12.5, margin: 0 }}>Ganado hoy</p>
            <p style={{ color: CREAM, fontSize: 22, fontFamily: "'Fraunces', serif", margin: "4px 0 0" }}>
              ${ganadoHoy.toLocaleString("es-CL")}
            </p>
          </Card>
          <Card>
            <p style={{ color: "#8C8676", fontSize: 12.5, margin: 0 }}>Ganado este mes</p>
            <p style={{ color: CHARCOAL, fontSize: 22, fontFamily: "'Fraunces', serif", margin: "4px 0 0" }}>
              ${ganadoMes.toLocaleString("es-CL")}
            </p>
          </Card>
        </div>

        <Card>
          <SectionLabel icon={ClipboardCheck}>Paseos de hoy</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {clientes.map((c, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < clientes.length - 1 ? "1px solid #EFEBE0" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <MoonBadge filled={c.marcadoHoy === true ? 1 : c.marcadoHoy === false ? 0.15 : 0.5} />
                  <div>
                    <p style={{ margin: 0, fontSize: 14, color: CHARCOAL }}>{c.nombre}</p>
                    <p style={{ margin: 0, fontSize: 12, color: "#8C8676" }}>{c.horario}</p>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => marcar(i, true)} style={{
                    width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer",
                    background: c.marcadoHoy === true ? FOREST : "#EFEBE0",
                    color: c.marcadoHoy === true ? "#fff" : "#8C8676",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <Check size={15} />
                  </button>
                  <button onClick={() => marcar(i, false)} style={{
                    width: 30, height: 30, borderRadius: 7, border: "none", cursor: "pointer",
                    background: c.marcadoHoy === false ? "#9C4B34" : "#EFEBE0",
                    color: c.marcadoHoy === false ? "#fff" : "#8C8676",
                    display: "flex", alignItems: "center", justifyContent: "center"
                  }}>
                    <X size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <SectionLabel icon={TrendingUp}>Resumen de la semana</SectionLabel>
          <div style={{ display: "flex", gap: 8 }}>
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center" }}>
                <div style={{ height: 40, background: i < 4 ? FOREST : "#EFEBE0", borderRadius: 6, marginBottom: 4 }} />
                <span style={{ fontSize: 11, color: "#8C8676" }}>{d}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function App() {
  const [sesion, setSesion] = useState(null);

  return (
    <div style={{ borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500&family=Inter:wght@400;500&display=swap');
      `}</style>
      {!sesion && <LoginScreen onLogin={setSesion} />}
      {sesion === "cliente" && <ClientePanel onLogout={() => setSesion(null)} />}
      {sesion === "trabajador" && <TrabajadorPanel onLogout={() => setSesion(null)} />}
    </div>
  );
}
