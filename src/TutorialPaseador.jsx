// Tutorial inicial de Mis Paseos — su propio chunk, cargado con
// React.lazy() desde HowriaAdmin.jsx (ver import ahí), mismo criterio que
// RutaGuiada: solo lo abre el rol paseador, no vale la pena que los demás
// roles paguen su peso en el bundle de Core.
import { useState } from "react";
import { X, MapPin, PlayCircle, CheckCircle2, XCircle, CalendarX2, Wallet, Home, PartyPopper } from "lucide-react";
import { NAVY, CREAM, CREAM_SOFT, GOLD, RUST } from "./HowriaAdmin.jsx";

const VERDE = "#2F6A46";

const PASOS = [
  {
    Icono: PartyPopper,
    titulo: "Bienvenido/a a Howria",
    texto: "Esta es la app que vas a usar todos los días de trabajo: acá marcas tus paseos, avisas si no puedes ir, y revisas tu pago del mes. Te la mostramos en 8 pasos cortos.",
  },
  {
    Icono: MapPin,
    titulo: "Tu pantalla principal: Mis Paseos",
    texto: "Al entrar, siempre caes acá. Arriba de todo está la tarjeta \"Mi ruta de hoy\" — te dice cuántos perros te tocan y es tu punto de partida cada día.",
    mockup: (
      <div style={{ background: NAVY, borderRadius: 12, padding: "16px 18px", color: CREAM }}>
        <p style={{ margin: 0, fontWeight: 700, fontFamily: "Georgia, serif" }}>Mi ruta de hoy</p>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: "#9BAAB8" }}>Hoy tienes 4 perros para pasear.</p>
      </div>
    ),
  },
  {
    Icono: PlayCircle,
    titulo: "Iniciar ruta",
    texto: "Toca \"Iniciar ruta\" y se abre un modo especial, a pantalla completa, con tus perros en fila — el orden ya viene armado según el horario de cada cliente. Si necesitas cambiar el orden, usa las flechas de cada fila.",
    mockup: (
      <div style={{ background: NAVY, borderRadius: 12, padding: "16px 18px" }}>
        <span style={{ display: "inline-block", background: GOLD, color: NAVY, fontWeight: 700, fontSize: 13.5, padding: "10px 22px", borderRadius: 8 }}>
          Iniciar ruta
        </span>
      </div>
    ),
  },
  {
    Icono: CheckCircle2,
    titulo: "Marca cada paseo apenas termine",
    texto: "Esta es la parte más importante de tu trabajo con la app. Por cada perro, elige una de las dos opciones no bien termines — no lo dejes para más tarde.",
    enfasis: true,
    mockup: (
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px", background: "#D8ECDE", border: `1.5px solid ${VERDE}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <CheckCircle2 size={16} color={VERDE} />
          <span style={{ fontSize: 13, fontWeight: 600, color: VERDE }}>Completar paseo</span>
        </div>
        <div style={{ flex: "1 1 140px", background: "#F1DCD2", border: `1.5px solid ${RUST}`, borderRadius: 10, padding: "12px 14px", display: "flex", alignItems: "center", gap: 8 }}>
          <XCircle size={16} color={RUST} />
          <span style={{ fontSize: 13, fontWeight: 600, color: RUST }}>Cancelar paseo</span>
        </div>
      </div>
    ),
    notas: [
      "Completar paseo: lo hiciste — se suma a tu pago del mes.",
      "Cancelar paseo: el cliente avisó que hoy no sale — no cuenta en tu contra.",
      "De esto sale tu pago y es lo que ve tu coordinador en el momento — un paseo sin marcar es un paseo que, para la app, nunca pasó.",
    ],
  },
  {
    Icono: CalendarX2,
    titulo: "Si no puedes ir un día",
    texto: "Antes de iniciar la ruta, toca \"Justificar ausencia\" en la misma tarjeta y escribe el motivo. Avísalo con la mayor anticipación que puedas — tu coordinador lo ve al instante.",
  },
  {
    Icono: Wallet,
    titulo: "Tu pago",
    texto: "Más abajo en Mis Paseos vas a encontrar tu resumen del mes: paseos realizados, avance, y el monto estimado que vas a recibir. Se actualiza solo, cada vez que marcas un paseo.",
  },
  {
    Icono: Home,
    titulo: "La otra pestaña: Inicio",
    texto: "Es tu resumen rápido del día — cuántos paseos te quedan, avisos de seguridad del equipo, y un acceso directo para volver a tu ruta si la dejaste a medio camino. Mis Paseos es donde trabajas; Inicio es para mirar rápido y seguir.",
  },
  {
    Icono: PartyPopper,
    titulo: "Listo para empezar",
    texto: "Eso es todo lo que necesitas para tu día a día. Si te queda alguna duda sobre cómo trabajamos con la app, pregúntale directamente a tu coordinador — mejor preguntar de más que adivinar de menos.",
    cierre: true,
  },
];

export function TutorialPaseador({ onCerrar }) {
  const [paso, setPaso] = useState(0);
  const actual = PASOS[paso];
  const esUltimo = paso === PASOS.length - 1;
  const { Icono } = actual;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 10030,
      background: CREAM, display: "flex", flexDirection: "column",
      fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
    }}>
      <button onClick={onCerrar} aria-label="Saltar tutorial"
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 1, display: "flex", alignItems: "center", gap: 6,
          border: "none", borderRadius: 20, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer",
          background: "rgba(18,42,64,0.08)", color: NAVY,
        }}>
        Saltar <X size={14} />
      </button>

      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", alignItems: "center", padding: "70px 20px 24px" }}>
        <div style={{ width: "100%", maxWidth: 440 }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", margin: "0 auto 20px",
            background: actual.enfasis ? GOLD : CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Icono size={28} color={NAVY} />
          </div>

          <h1 style={{ margin: 0, textAlign: "center", fontFamily: "'Fraunces', Georgia, serif", fontSize: 23, fontWeight: 700, color: NAVY }}>
            {actual.titulo}
          </h1>
          <p style={{ margin: "12px 0 0", textAlign: "center", fontSize: 14.5, lineHeight: 1.6, color: "#5C5442" }}>
            {actual.texto}
          </p>

          {actual.mockup && <div style={{ marginTop: 20 }}>{actual.mockup}</div>}

          {actual.notas && (
            <ul style={{ marginTop: 16, paddingLeft: 20, fontSize: 13.5, lineHeight: 1.6, color: "#5C5442" }}>
              {actual.notas.map((n, i) => <li key={i} style={{ marginBottom: 6 }}>{n}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div style={{ flex: "none", padding: "16px 20px 22px", borderTop: "1px solid #E4DBC3", background: "#FFFFFF" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 16 }}>
          {PASOS.map((_, i) => (
            <span key={i} style={{
              width: i === paso ? 18 : 6, height: 6, borderRadius: 4,
              background: i === paso ? GOLD : "#E4DBC3", transition: "width .15s",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, maxWidth: 440, margin: "0 auto" }}>
          {paso > 0 && (
            <button onClick={() => setPaso((p) => p - 1)} style={{ flex: 1, padding: "13px", borderRadius: 8, border: `1.5px solid ${NAVY}`, background: "transparent", color: NAVY, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
              Atrás
            </button>
          )}
          <button
            onClick={() => (esUltimo ? onCerrar() : setPaso((p) => p + 1))}
            style={{ flex: 2, padding: "13px", borderRadius: 8, border: "none", background: GOLD, color: NAVY, fontSize: 14.5, fontWeight: 700, cursor: "pointer" }}>
            {esUltimo ? "Entendido, empezar" : "Siguiente"}
          </button>
        </div>
      </div>
    </div>
  );
}
