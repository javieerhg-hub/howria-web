// Página pública a la que llega el cliente desde el correo cuando le
// agendamos una clase: /confirmar-cita?t=TOKEN
//
// Existe en vez de confirmar directo desde el enlace del correo porque
// muchos clientes de correo y antivirus abren los enlaces para
// revisarlos — un enlace que confirmara al abrirse dejaría citas
// confirmadas sin que la persona las haya visto. Acá primero se le
// muestra qué está confirmando y recién su clic confirma.
//
// Misma paleta que Home/Cachorros/PagoResultado (la marca pública), no
// la del panel interno.
import { useState, useEffect, useMemo } from "react";

const NAVY = "#14213D";
const CREAM = "#F5EFE0";
const CREAM_SOFT = "#F1EAD5";
const GOLD = "#C9962F";
const INK = "#211E1B";
const MUTED = "#6B6248";
const VERDE = "#2F6A46";
const RUST = "#A85C3B";

const WHATSAPP = "56992471504";

function Marco({ children }) {
  return (
    <div style={{
      minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center",
      justifyContent: "center", padding: "32px 20px", fontFamily: "'Inter', sans-serif", color: INK,
    }}>
      <style>{`
        .howria-cita-cta:hover { filter: brightness(1.06); }
        .howria-cita-cta:active { transform: scale(0.98); }
        @media (max-width: 560px) { .howria-cita-titulo { font-size: 24px !important; } }
        @media (prefers-reduced-motion: reduce) { .howria-cita-cta { transition: none !important; } }
      `}</style>
      <div style={{ width: "100%", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 26 }}>
          <img src="/logo-howria.png" alt="Howria" style={{ height: 66 }} />
        </div>
        <div style={{ background: CREAM, borderRadius: 16, padding: "36px 30px", boxShadow: "0 24px 60px rgba(0,0,0,0.32)", textAlign: "center" }}>
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
      width: 66, height: 66, borderRadius: "50%", background: fondo, color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 30, margin: "0 auto 20px",
    }} aria-hidden="true">{children}</div>
  );
}

function Boton({ onClick, href, children, primario = true, disabled }) {
  const estilo = {
    display: "block", width: "100%", textDecoration: "none", textAlign: "center", borderRadius: 999,
    padding: "15px 28px", fontSize: 16, fontWeight: 700, cursor: disabled ? "default" : "pointer",
    background: primario ? GOLD : "transparent",
    color: NAVY,
    border: primario ? "none" : `1.5px solid ${NAVY}`,
    boxShadow: primario ? "0 8px 24px rgba(201,150,47,0.3)" : "none",
    transition: "filter .15s ease, transform .1s ease",
    opacity: disabled ? 0.5 : 1,
    font: "inherit", fontFamily: "'Inter', sans-serif",
  };
  if (href) {
    return <a className="howria-cita-cta" href={href} target="_blank" rel="noopener noreferrer" style={estilo}>{children}</a>;
  }
  return <button className="howria-cita-cta" onClick={onClick} disabled={disabled} style={estilo}>{children}</button>;
}

function Dato({ etiqueta, valor }) {
  if (!valor) return null;
  return (
    <div style={{ marginBottom: 12 }}>
      <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.6 }}>{etiqueta}</p>
      <p style={{ margin: 0, fontSize: 15.5, color: NAVY, fontWeight: 600 }}>{valor}</p>
    </div>
  );
}

export default function ConfirmarCita() {
  const token = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get("t"); } catch { return null; }
  }, []);

  const [cita, setCita] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [confirmada, setConfirmada] = useState(false);

  useEffect(() => {
    if (!token) { setError("El enlace está incompleto."); setCargando(false); return; }
    let activo = true;
    fetch(`/api/confirmar-cita?t=${encodeURIComponent(token)}`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!activo) return;
        if (!ok) setError(d.error || "No encontramos esta cita.");
        else { setCita(d.cita); setConfirmada(!!d.cita.yaConfirmada); }
        setCargando(false);
      })
      .catch(() => { if (activo) { setError("No pudimos conectar. Revisa tu conexión."); setCargando(false); } });
    return () => { activo = false; };
  }, [token]);

  async function confirmar() {
    if (confirmando) return;
    setConfirmando(true);
    try {
      const resp = await fetch("/api/confirmar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await resp.json().catch(() => ({}));
      if (!resp.ok) { setError(d.error || "No pudimos guardar tu confirmación."); return; }
      setCita(d.cita);
      setConfirmada(true);
    } catch {
      setError("No pudimos conectar. Revisa tu conexión.");
    } finally {
      setConfirmando(false);
    }
  }

  const linkWsp = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(
    cita ? `Hola Howria 🐾 Sobre mi ${String(cita.tipo).toLowerCase()} del ${cita.fechaTexto}: ` : "Hola Howria 🐾 ")}`;

  if (cargando) {
    return <Marco><p style={{ margin: 0, fontSize: 15, color: MUTED }}>Cargando tu cita…</p></Marco>;
  }

  if (error) {
    return (
      <Marco>
        <Insignia color={RUST} fondo="#F1DCD2">!</Insignia>
        <h1 className="howria-cita-titulo" style={{ fontFamily: "'Fraunces', serif", fontSize: 27, lineHeight: 1.25, color: NAVY, margin: "0 0 14px", textWrap: "balance" }}>
          No pudimos abrir tu cita
        </h1>
        <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: "0 0 26px" }}>{error}</p>
        <Boton href={linkWsp}>Escríbenos por WhatsApp</Boton>
      </Marco>
    );
  }

  return (
    <Marco>
      <Insignia color={confirmada ? VERDE : GOLD} fondo={confirmada ? "#D8ECDE" : "#F6E7C6"}>
        {confirmada ? "✓" : "🐾"}
      </Insignia>
      <h1 className="howria-cita-titulo" style={{ fontFamily: "'Fraunces', serif", fontSize: 27, lineHeight: 1.25, color: NAVY, margin: "0 0 14px", textWrap: "balance" }}>
        {confirmada ? "¡Confirmada! Te esperamos" : `Confirma tu ${String(cita.tipo || "cita").toLowerCase().startsWith("evaluaci") ? "evaluación" : "clase"}`}
      </h1>
      <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: "0 0 24px" }}>
        {confirmada
          ? `Ya avisamos a ${cita.adiestrador}. Nos vemos con ${cita.perro || "tu perrito"}.`
          : `Hola ${String(cita.clienteNombre || "").split(" ")[0]}, te agendamos esta hora. Confírmanos que puedes.`}
      </p>

      <div style={{ background: CREAM_SOFT, borderRadius: 12, padding: "18px 20px", textAlign: "left", marginBottom: 26 }}>
        <Dato etiqueta="Cuándo" valor={cita.fechaTexto} />
        <Dato etiqueta="Qué" valor={cita.tipo} />
        <Dato etiqueta="Tema" valor={cita.tema} />
        <Dato etiqueta="Con" valor={cita.adiestrador} />
        <div style={{ marginBottom: 0 }}>
          <p style={{ margin: "0 0 3px", fontSize: 11, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.6 }}>Perro</p>
          <p style={{ margin: 0, fontSize: 15.5, color: NAVY, fontWeight: 600 }}>🐾 {cita.perro || "—"}</p>
        </div>
      </div>

      {!confirmada && (
        <div style={{ marginBottom: 12 }}>
          <Boton onClick={confirmar} disabled={confirmando}>
            {confirmando ? "Confirmando…" : "Sí, ahí estaré"}
          </Boton>
        </div>
      )}
      <Boton href={linkWsp} primario={false}>
        {confirmada ? "Escribirnos" : "No puedo a esa hora"}
      </Boton>
    </Marco>
  );
}
