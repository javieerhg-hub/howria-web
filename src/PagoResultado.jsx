// Páginas de vuelta del pago de un pack de clases. Son las dos URLs a las
// que la pasarela redirige al cliente cuando termina el intento de pago:
//   howria.cl/pago-exitoso  → se pagó
//   howria.cl/pago-fallido  → no se pudo cobrar
//
// Son páginas de CIERRE, no de trámite: la pasarela ya decidió el
// resultado antes de mandar aquí al cliente. No consultan nada ni cambian
// estado — mostrar "pagado" acá no significa que el pago esté confirmado
// del lado de Howria; eso lo confirma la pasarela por su cuenta.
//
// Misma paleta y tipografías que Home.jsx y Cachorros.jsx (la marca
// pública), no las del panel interno.
import { useMemo } from "react";

const NAVY = "#14213D";
const CREAM = "#F5EFE0";
const CREAM_SOFT = "#F1EAD5";
const GOLD = "#C9962F";
const INK = "#211E1B";
const MUTED = "#6B6248";
const VERDE = "#2F6A46";
const RUST = "#A85C3B";

const WHATSAPP = "56992471504";

function linkWhatsapp(mensaje) {
  return `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
}

// La pasarela suele devolver algún identificador en la URL. Se muestra si
// viene, para que el cliente pueda citarlo al escribir — pero la página
// funciona igual si no viene ninguno, porque cada pasarela usa nombres
// distintos y no se puede depender de eso.
function useReferencia() {
  return useMemo(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      for (const clave of ["orden", "order", "buy_order", "commerce_order", "token_ws", "id", "payment_id"]) {
        const v = p.get(clave);
        if (v) return v;
      }
    } catch { /* URL rara: se muestra la página sin referencia */ }
    return null;
  }, []);
}

function Marco({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center",
      justifyContent: "center", padding: "32px 20px", fontFamily: "'Inter', sans-serif", color: INK,
    }}>
      <style>{`
        .howria-pago-cta:hover { filter: brightness(1.06); }
        .howria-pago-cta:active { transform: scale(0.98); }
        @media (max-width: 560px) { .howria-pago-titulo { font-size: 25px !important; } }
        @media (prefers-reduced-motion: reduce) { .howria-pago-cta { transition: none !important; } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
          <img src="/logo-howria.png" alt="Howria" style={{ height: 66 }} />
        </div>
        <div style={{ background: CREAM, borderRadius: 16, padding: "38px 30px", boxShadow: "0 24px 60px rgba(0,0,0,0.32)", textAlign: "center" }}>
          {children}
        </div>
        <p style={{ textAlign: "center", margin: "22px 0 0", fontSize: 12.5, color: "#8A93A5" }}>
          Howria · Paseos y adiestramiento canino en Santiago
        </p>
      </div>
    </div>
  );
}

function Insignia({ color, fondo, children }) {
  return (
    <div style={{
      width: 68, height: 68, borderRadius: "50%", background: fondo, color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 32, margin: "0 auto 22px",
    }} aria-hidden="true">{children}</div>
  );
}

function Titulo({ children }) {
  return (
    <h1 className="howria-pago-titulo" style={{
      fontFamily: "'Fraunces', serif", fontSize: 29, lineHeight: 1.25, color: NAVY,
      margin: "0 0 14px", textWrap: "balance",
    }}>{children}</h1>
  );
}

function Boton({ href, children, primario = true }) {
  return (
    <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="howria-pago-cta"
      style={{
        display: "block", textDecoration: "none", textAlign: "center", borderRadius: 999,
        padding: "15px 28px", fontSize: 16, fontWeight: 700,
        background: primario ? GOLD : "transparent",
        color: primario ? NAVY : NAVY,
        border: primario ? "none" : `1.5px solid ${NAVY}`,
        boxShadow: primario ? "0 8px 24px rgba(201,150,47,0.3)" : "none",
        transition: "filter .15s ease, transform .1s ease",
      }}>
      {children}
    </a>
  );
}

function Referencia({ valor }) {
  if (!valor) return null;
  return (
    <p style={{ margin: "20px 0 0", fontSize: 12.5, color: MUTED }}>
      N° de operación: <b style={{ color: NAVY, fontFamily: "monospace" }}>{valor}</b>
    </p>
  );
}

export function PagoExitoso() {
  const ref = useReferencia();
  return (
    <Marco>
      <Insignia color={VERDE} fondo="#D8ECDE">✓</Insignia>
      <Titulo>¡Listo! Tu pack quedó pagado</Titulo>
      <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: "0 0 26px" }}>
        Recibimos tu pago. Te vamos a escribir para coordinar la primera clase y ver los horarios que
        te acomodan.
      </p>
      <div style={{ background: CREAM_SOFT, borderRadius: 12, padding: "18px 20px", textAlign: "left", marginBottom: 26 }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Qué sigue
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, lineHeight: 1.7, color: INK }}>
          <li>Te llega el comprobante al correo que registraste.</li>
          <li>Te contactamos para agendar la primera clase.</li>
          <li>Si prefieres adelantar, escríbenos por WhatsApp.</li>
        </ul>
      </div>
      <Boton href={linkWhatsapp(`Hola Howria 🐾 Acabo de pagar mi pack de clases${ref ? ` (operación ${ref})` : ""} y quiero coordinar la primera.`)}>
        Coordinar mi primera clase
      </Boton>
      <Referencia valor={ref} />
    </Marco>
  );
}

export function PagoFallido() {
  const ref = useReferencia();
  return (
    <Marco>
      <Insignia color={RUST} fondo="#F1DCD2">!</Insignia>
      <Titulo>No pudimos procesar el pago</Titulo>
      <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: "0 0 26px" }}>
        El pago no se completó, así que <b style={{ color: INK }}>tu pack todavía no está tomado</b>.
        Puede pasar por muchas razones: la tarjeta rechazó el cobro, se cortó la conexión o se cerró
        la ventana antes de terminar.
      </p>
      <div style={{ background: CREAM_SOFT, borderRadius: 12, padding: "18px 20px", textAlign: "left", marginBottom: 26 }}>
        <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: NAVY, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Qué puedes hacer
        </p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14.5, lineHeight: 1.7, color: INK }}>
          <li>Intentarlo de nuevo, con la misma tarjeta u otra.</li>
          <li>Escribirnos y coordinamos otra forma de pago.</li>
          <li>Si te apareció un cobro pese al error, avísanos y lo revisamos.</li>
        </ul>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Boton href={linkWhatsapp(`Hola Howria 🐾 Tuve un problema al pagar mi pack de clases${ref ? ` (operación ${ref})` : ""} y necesito ayuda.`)}>
          Escríbenos y lo resolvemos
        </Boton>
        <Boton href="/cachorros" primario={false}>Volver</Boton>
      </div>
      <Referencia valor={ref} />
    </Marco>
  );
}
