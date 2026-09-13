// El aviso de promoción que sale al entrar a howria.cl: un cupón de 10%
// en el plan mensual de paseos, a cambio del correo. Lo monta Home.jsx.
//
// Quien deja su correo recibe el código por mail (api/cupon.js lo genera,
// lo guarda en `cupones_promocion` y crea el prospecto en Seguimiento).
// El código además se muestra acá mismo apenas responde: si el correo se
// demora o cae en spam, la persona igual se queda con su cupón.
import { useEffect, useRef, useState } from "react";
import { X, Tag } from "lucide-react";

const NAVY = "#14213D";
const NAVY_LOGO = "#102A41";
const CREAM = "#F5EFE0";
const CREAM_SOFT = "#F1EAD5";
const GOLD = "#C9962F";
const GOLD_DARK = "#7C5D1A";
const INK = "#211E1B";
const MUTED = "#6B6248";

// LO QUE PROMETE EL CUPÓN. Está también en api/cupon.js (el correo que
// sale) — los dos textos tienen que decir lo mismo. Si cambia el
// porcentaje o la condición, hay que tocar los dos lugares.
const PROMO_TITULO = "10% de descuento";
const PROMO_BAJADA = "en tu plan mensual de paseos";

// Cuánto espera antes de aparecer. No es a los 0 segundos a propósito:
// un modal encima de una página que todavía no terminó de pintar se
// siente como un error, y la persona lo cierra sin leerlo. Seis segundos
// alcanzan para ver el hero y entender de qué se trata el sitio.
const DEMORA_MS = 6000;

// Se guarda en el navegador para no volver a mostrarlo. La versión en la
// clave es la forma de volver a mostrárselo a TODOS: al subir a _v2, el
// aviso reaparece para quien ya lo había cerrado (sirve cuando cambie la
// promoción). Quien cierra el aviso no lo ve nunca más con esta versión
// — un popup que vuelve en cada visita espanta más de lo que convierte.
const CLAVE_LOCAL = "howria_cupon_paseo10_v1";

function yaLoVio() {
  try {
    return !!localStorage.getItem(CLAVE_LOCAL);
  } catch {
    // Navegación privada o cookies bloqueadas: se muestra igual. Peor es
    // que el aviso no aparezca nunca en ese navegador.
    return false;
  }
}

function recordar(valor) {
  try {
    localStorage.setItem(CLAVE_LOCAL, valor);
  } catch {}
}

export default function PromoCupon() {
  const [abierto, setAbierto] = useState(false);
  const [email, setEmail] = useState("");
  const [nombre, setNombre] = useState("");
  // Campo trampa para bots (ver api/cupon.js): está escondido, una
  // persona nunca lo llena.
  const [sitioWeb, setSitioWeb] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);

  const dialogoRef = useRef(null);
  const emailRef = useRef(null);
  // A dónde devolver el foco al cerrar: lo que la persona estuviera
  // usando antes de que el aviso le robara el teclado.
  const focoPrevioRef = useRef(null);

  useEffect(() => {
    if (yaLoVio()) return;
    const t = setTimeout(() => {
      focoPrevioRef.current = document.activeElement;
      setAbierto(true);
    }, DEMORA_MS);
    return () => clearTimeout(t);
  }, []);

  // El efecto de abajo se engancha una sola vez (depende solo de
  // `abierto`), así que la función `cerrar` que ve por dentro sería la del
  // primer render — y esa todavía no sabe si la persona alcanzó a pedir
  // el cupón. Con la ref siempre llama a la versión de ahora.
  const cerrarRef = useRef(null);
  cerrarRef.current = cerrar;

  // Mientras está abierto: Esc cierra, el foco arranca en el correo y no
  // se sale del cuadro con Tab, y la página de atrás no hace scroll.
  useEffect(() => {
    if (!abierto) return;

    emailRef.current?.focus();
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function alTeclado(e) {
      if (e.key === "Escape") {
        cerrarRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = dialogoRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables?.length) return;
      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclado);
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  function cerrar() {
    // Si alcanzó a pedir el cupón se recuerda como "reclamado", para
    // poder distinguir después quién lo cerró sin más.
    recordar(resultado ? "reclamado" : "cerrado");
    setAbierto(false);
    focoPrevioRef.current?.focus?.();
  }

  async function pedirCupon(e) {
    e.preventDefault();
    if (enviando) return;
    setError("");
    setEnviando(true);
    try {
      const resp = await fetch("/api/cupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, nombre, sitioWeb }),
      });
      const datos = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setError(datos.error || "No pudimos generar tu cupón. Intenta de nuevo.");
        return;
      }
      setResultado(datos);
      recordar("reclamado");
    } catch {
      setError("No pudimos conectarnos. Revisa tu conexión e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!abierto) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) cerrar(); }}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(16,42,65,0.72)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20, overflowY: "auto",
      }}
    >
      <style>{`
        @keyframes howria-cupon-entra {
          from { opacity: 0; transform: translateY(14px) scale(0.98); }
          to   { opacity: 1; transform: none; }
        }
        .howria-cupon { animation: howria-cupon-entra .28s ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .howria-cupon { animation: none; }
        }
      `}</style>

      <div
        ref={dialogoRef}
        className="howria-cupon"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howria-cupon-titulo"
        style={{
          position: "relative", width: "100%", maxWidth: 420,
          background: CREAM, borderRadius: 16, overflow: "hidden",
          boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
          fontFamily: "'Inter', sans-serif", color: INK,
        }}
      >
        <button
          onClick={cerrar}
          aria-label="Cerrar el aviso"
          style={{
            position: "absolute", top: 12, right: 12, zIndex: 2,
            width: 32, height: 32, borderRadius: "50%", border: "none",
            background: "rgba(255,255,255,0.16)", color: CREAM,
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <X size={17} strokeWidth={2.2} aria-hidden="true" />
        </button>

        {/* ---------- CABECERA: el cupón ---------- */}
        <div style={{ background: NAVY_LOGO, padding: "30px 26px 26px", textAlign: "center" }}>
          <p style={{ color: GOLD, fontSize: 11.5, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, margin: "0 0 12px" }}>
            Promoción
          </p>
          {/* El borde punteado y la muesca de los costados son lo que lo
              hace leerse como un cupón recortable y no como un aviso más. */}
          <div style={{
            position: "relative", border: `2px dashed ${GOLD}`, borderRadius: 12,
            padding: "20px 18px", background: "rgba(201,150,47,0.08)",
          }}>
            <span style={{ position: "absolute", left: -11, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: NAVY_LOGO }} aria-hidden="true" />
            <span style={{ position: "absolute", right: -11, top: "50%", transform: "translateY(-50%)", width: 20, height: 20, borderRadius: "50%", background: NAVY_LOGO }} aria-hidden="true" />
            <h2 id="howria-cupon-titulo" style={{ fontFamily: "'Fraunces', serif", color: CREAM, fontSize: 34, lineHeight: 1.1, margin: "0 0 6px" }}>
              {PROMO_TITULO}
            </h2>
            <p style={{ color: "#C7D0DA", fontSize: 14.5, margin: 0 }}>{PROMO_BAJADA}</p>
          </div>
        </div>

        {/* ---------- CUERPO: pedir el correo, o mostrar el código ---------- */}
        <div style={{ padding: "24px 26px 28px" }}>
          {resultado ? (
            <div style={{ textAlign: "center" }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: NAVY, margin: "0 0 8px" }}>
                ¡Listo! Tu cupón es tuyo 🐾
              </h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: "0 0 18px" }}>
                {resultado.correoEnviado === false
                  ? "Anótalo antes de cerrar: no pudimos enviarte el correo, pero el cupón ya está reservado a tu nombre."
                  : resultado.yaEnviado
                    ? "Ya te lo habíamos enviado antes — es el mismo cupón de siempre."
                    : `Te lo enviamos a ${email}. Si no lo ves, revisa tu carpeta de spam.`}
              </p>
              <div style={{
                border: `2px dashed ${GOLD_DARK}`, borderRadius: 10, padding: "16px 12px",
                background: CREAM_SOFT, marginBottom: 18,
              }}>
                <p style={{ fontSize: 11, letterSpacing: 1.4, textTransform: "uppercase", fontWeight: 700, color: GOLD_DARK, margin: "0 0 6px" }}>
                  Tu código
                </p>
                <p style={{ fontFamily: "'Courier New', monospace", fontSize: 23, fontWeight: 700, letterSpacing: 2, color: NAVY, margin: 0 }}>
                  {resultado.codigo}
                </p>
              </div>
              <a
                href="https://wa.me/56992471504"
                target="_blank"
                rel="noopener"
                style={{
                  display: "block", background: GOLD, color: NAVY_LOGO, padding: "13px 22px",
                  borderRadius: 8, fontWeight: 700, fontSize: 14.5, textDecoration: "none",
                }}
              >
                Usarlo ahora por WhatsApp
              </a>
            </div>
          ) : (
            <form onSubmit={pedirCupon}>
              <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.6, margin: "0 0 18px", textAlign: "center" }}>
                Déjanos tu correo y te enviamos el cupón para que lo uses cuando quieras partir.
              </p>

              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre (opcional)"
                autoComplete="given-name"
                style={campo}
              />
              <input
                ref={emailRef}
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.cl"
                autoComplete="email"
                aria-label="Tu correo"
                style={{ ...campo, marginTop: 10 }}
              />

              {/* Trampa para bots: invisible y fuera del orden de tabulación,
                  y marcada para que un lector de pantalla tampoco la anuncie. */}
              <div aria-hidden="true" style={{ position: "absolute", left: "-9999px" }}>
                <label>
                  No llenar este campo
                  <input type="text" tabIndex={-1} autoComplete="off" value={sitioWeb} onChange={(e) => setSitioWeb(e.target.value)} />
                </label>
              </div>

              {error && (
                <p role="alert" style={{ fontSize: 13, color: "#A85C3B", margin: "10px 0 0", textAlign: "center" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={enviando}
                style={{
                  width: "100%", marginTop: 14, background: GOLD, color: NAVY_LOGO,
                  padding: "13px 22px", borderRadius: 8, border: "none",
                  fontWeight: 700, fontSize: 14.5, cursor: enviando ? "default" : "pointer",
                  opacity: enviando ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                <Tag size={16} strokeWidth={2.2} aria-hidden="true" />
                {enviando ? "Generando tu cupón..." : "Enviarme el cupón"}
              </button>

              <button
                type="button"
                onClick={cerrar}
                style={{
                  width: "100%", marginTop: 8, background: "none", border: "none",
                  color: MUTED, fontSize: 13, cursor: "pointer", padding: 8,
                }}
              >
                Ahora no
              </button>

              <p style={{ fontSize: 11.5, color: MUTED, lineHeight: 1.5, margin: "8px 0 0", textAlign: "center" }}>
                Usamos tu correo solo para enviarte el cupón y contarte de Howria. Nada de spam.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

const campo = {
  width: "100%", boxSizing: "border-box", padding: "12px 14px",
  borderRadius: 8, border: "1px solid #DCD2B8", background: "#FFFFFF",
  fontSize: 14.5, fontFamily: "'Inter', sans-serif", color: INK,
};
