// Embudo de ventas para tutores de cachorros — página pública, pensada
// para compartirse por Instagram/WhatsApp. Una sola conversión al final:
// el botón que abre WhatsApp con el mensaje escrito.
//
// Misma paleta y tipografías que Home.jsx (la landing), no las del panel
// interno: son marcas visuales distintas a propósito. Archivo aparte y
// cargado con React.lazy desde main.jsx, así quien entra acá no baja el
// código del panel ni de la landing.
//
// El contenido sale de lo que Howria de verdad hace: los temas son los de
// TEMARIO_ADIESTRAMIENTO (grupo "Formación de cachorros" y los de
// conducta que aplican a esa edad) y el flujo evaluación → plan de clases
// es el que ya existe en la app. Sin precios, sin testimonios inventados
// y sin cifras de resultados.
import { useEffect, useRef, useState } from "react";

const NAVY = "#14213D";
const CREAM = "#F5EFE0";
const CREAM_SOFT = "#F1EAD5";
const GOLD = "#C9962F";
const GOLD_DARK = "#7C5D1A";
const INK = "#211E1B";
const MUTED = "#6B6248";

// El video se sirve desde el propio sitio, no desde Drive: el original
// era un .MOV de 94 MB, formato que varios navegadores no reproducen (por
// eso no cargaba). Convertido con ffmpeg a MP4 (H.264 720x1280, CRF 27,
// faststart) queda en 7,4 MB — 13 veces más liviano, sin diferencia
// visible. Es vertical (grabado con teléfono, con subtítulos incrustados),
// así que el recuadro va en 9:16.
const WHATSAPP = "56992471504";
const MENSAJE = "Hola Howria 🐾 Vi la página de cachorros y quiero agendar la evaluación para mi perro.";
const LINK_WHATSAPP = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(MENSAJE)}`;

// Las molestias concretas del día a día con un cachorro. Cada una calza
// con un tema real del temario (evacuaciones inadecuadas, tirones de
// correa, mordidas de la etapa de cachorro, llamado).
const DOLORES = [
  { emoji: "🚽", texto: "Hace pipí adentro aunque acabe de salir" },
  { emoji: "🦷", texto: "Muerde manos, muebles y todo lo que encuentra" },
  { emoji: "🦮", texto: "Tira de la correa y el paseo se hace pelea" },
  { emoji: "📣", texto: "Lo llamas y te ignora por completo" },
  { emoji: "😰", texto: "Llora o destroza cuando lo dejas solo" },
  { emoji: "🐕", texto: "Se sobresalta o ladra con otros perros y ruidos" },
];

const PASOS = [
  {
    n: "1",
    titulo: "Evaluación",
    texto: "Vamos a tu casa, conocemos a tu cachorro en su ambiente y vemos qué está pasando de verdad — no por teléfono.",
  },
  {
    n: "2",
    titulo: "Un plan a su medida",
    texto: "Armamos un plan de clases según su edad, su carácter y lo que a ti te urge resolver. No hay receta única.",
  },
  {
    n: "3",
    titulo: "Clases y seguimiento",
    texto: "Clase a clase trabajamos los temas del plan y te enseñamos a ti a sostenerlo. Queda registrado qué se trabajó cada día.",
  },
];

const TEMAS = [
  "Formación de cachorros",
  "Obediencia básica",
  "Evacuaciones inadecuadas",
  "Tirones de correa",
  "Ansiedad por separación",
  "Fobias y miedos",
];

function Seccion({ children, fondo = CREAM, style }) {
  return (
    <section style={{ background: fondo, padding: "72px 24px", ...style }}>
      <div style={{ maxWidth: 940, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function Titulo({ children, color = NAVY, style }) {
  return (
    <h2 className="howria-emb-titulo" style={{ fontFamily: "'Fraunces', serif", fontSize: 32, lineHeight: 1.25, color, margin: "0 0 16px", textWrap: "balance", ...style }}>
      {children}
    </h2>
  );
}

export default function Cachorros() {
  // El video parte en silencio (obligado por los navegadores). Este botón
  // desaparece apenas el visitante activa el sonido, o si lo activa desde
  // los controles nativos — de ahí el listener de volumechange.
  const videoRef = useRef(null);
  const [sinSonido, setSinSonido] = useState(true);
  function activarSonido() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    v.play?.().catch(() => {});
  }
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    function alCambiarVolumen() { setSinSonido(v.muted || v.volume === 0); }
    v.addEventListener("volumechange", alCambiarVolumen);
    return () => v.removeEventListener("volumechange", alCambiarVolumen);
  }, []);

  // El botón fijo aparece recién cuando el visitante pasó del hero: antes
  // de eso todavía no tiene contexto para decidir, y tapaba la portada.
  const [mostrarFijo, setMostrarFijo] = useState(false);
  useEffect(() => {
    function alScroll() { setMostrarFijo(window.scrollY > 560); }
    window.addEventListener("scroll", alScroll, { passive: true });
    alScroll();
    return () => window.removeEventListener("scroll", alScroll);
  }, []);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: INK, background: CREAM }}>
      <style>{`
        .howria-emb-cta:hover { filter: brightness(1.06); }
        .howria-emb-cta:active { transform: scale(0.98); }
        @media (max-width: 700px) {
          .howria-emb-hero-titulo { font-size: 30px !important; }
          .howria-emb-titulo { font-size: 25px !important; }
          .howria-emb-grid { grid-template-columns: 1fr !important; }
          .howria-emb-pasos { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .howria-emb-cta { transition: none !important; }
        }
      `}</style>

      {/* ---------- Portada ---------- */}
      <header style={{
        background: `linear-gradient(rgba(20,33,61,0.82), rgba(20,33,61,0.88)), url('/images/cachorros.jpg') center/cover`,
        padding: "64px 24px 76px", textAlign: "center",
      }}>
        <img src="/logo-howria.png" alt="Howria" style={{ height: 74, marginBottom: 34 }} />
        <p style={{ margin: "0 0 14px", fontSize: 12.5, letterSpacing: 2, textTransform: "uppercase", color: GOLD, fontWeight: 600 }}>
          Adiestramiento de cachorros · Santiago
        </p>
        <h1 className="howria-emb-hero-titulo" style={{ fontFamily: "'Fraunces', serif", fontSize: 44, lineHeight: 1.18, color: CREAM, margin: "0 auto 20px", maxWidth: 700, textWrap: "balance" }}>
          Tu cachorro no nació sabiendo. Tú tampoco tienes por qué adivinar.
        </h1>
        <p style={{ fontSize: 17, lineHeight: 1.6, color: "#D8CDB4", maxWidth: 580, margin: "0 auto 32px" }}>
          Las primeras semanas en casa marcan cómo va a comportarse el resto de su vida.
          Te acompañamos a aprovecharlas, en vez de corregir después lo que se hizo costumbre.
        </p>
        <a href="#como" style={{ color: CREAM, fontSize: 14, textDecoration: "none", borderBottom: `1px solid ${GOLD}`, paddingBottom: 3 }}>
          Ver cómo funciona ↓
        </a>
      </header>

      {/* ---------- Video ---------- */}
      {/* Va justo después de la portada: es el punto de más atención de
          la página, y un video hace el trabajo de convencer mucho más
          rápido que el texto. Se puede mover a otra sección si Javier
          prefiere. */}
      <Seccion fondo={CREAM_SOFT} style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 15.5, color: MUTED, margin: "0 0 22px", lineHeight: 1.6 }}>
            Así trabajamos con los cachorros:
          </p>
          {/* Arranca solo, en silencio y en bucle. Lo de "en silencio" no
              es una preferencia: NINGÚN navegador deja reproducir solo con
              audio (Chrome/Safari/Firefox lo bloquean), así que con sonido
              el video simplemente no partiría. Funciona igual porque el
              video trae los subtítulos incrustados; abajo hay un botón
              para activar el audio con un toque. */}
          <div style={{ position: "relative", width: "100%", maxWidth: 340, margin: "0 auto" }}>
            <video
              ref={videoRef}
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster="/videos-cachorro-portada.jpg"
              style={{
                width: "100%", aspectRatio: "9 / 16", display: "block",
                borderRadius: 14, background: NAVY,
                boxShadow: "0 14px 40px rgba(20,33,61,0.22)",
              }}>
              <source src="/videos-cachorro.mp4" type="video/mp4" />
              Tu navegador no puede reproducir este video.
            </video>
            {sinSonido && (
              <button onClick={activarSonido} className="howria-emb-cta"
                style={{
                  position: "absolute", left: "50%", transform: "translateX(-50%)", bottom: 52,
                  background: "rgba(20,33,61,0.92)", color: CREAM, border: `1px solid ${GOLD}`,
                  borderRadius: 999, padding: "9px 18px", fontSize: 13.5, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap", transition: "filter .15s ease",
                }}>
                🔇 Activar sonido
              </button>
            )}
          </div>
        </div>
      </Seccion>

      {/* ---------- Identificación con el problema ---------- */}
      <Seccion>
        <Titulo style={{ textAlign: "center" }}>¿Te suena alguna de estas?</Titulo>
        <p style={{ textAlign: "center", fontSize: 16, color: MUTED, maxWidth: 620, margin: "0 auto 40px", lineHeight: 1.6 }}>
          No es que tu cachorro sea "malo" ni que tú lo estés haciendo mal. Son conductas normales de su edad
          que, sin guía, se vuelven costumbre.
        </p>
        <div className="howria-emb-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {DOLORES.map((d) => (
            <div key={d.texto} style={{ display: "flex", alignItems: "center", gap: 14, background: "#FFFFFF", border: `1px solid ${CREAM_SOFT}`, borderRadius: 12, padding: "16px 18px" }}>
              <span style={{ fontSize: 24, flex: "none" }} aria-hidden="true">{d.emoji}</span>
              <span style={{ fontSize: 15, lineHeight: 1.45 }}>{d.texto}</span>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ---------- Por qué ahora ---------- */}
      <Seccion fondo={NAVY}>
        <div style={{ textAlign: "center" }}>
          <Titulo color={CREAM}>Con un cachorro, el tiempo juega a favor o en contra</Titulo>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "#D8CDB4", maxWidth: 660, margin: "0 auto" }}>
            Un cachorro aprende de todo lo que le pasa, lo enseñes o no. Cada semana que pasa está
            formando hábitos: cómo saluda, cómo camina contigo, qué hace cuando se queda solo, cómo
            reacciona ante otro perro.
          </p>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: CREAM, maxWidth: 660, margin: "18px auto 0", fontWeight: 500 }}>
            Empezar temprano no es apurarse: es enseñarle bien la primera vez, en vez de tener que
            corregirlo cuando ya pesa 30 kilos.
          </p>
        </div>
      </Seccion>

      {/* ---------- Cómo funciona ---------- */}
      <Seccion>
        <div id="como" style={{ scrollMarginTop: 20 }} />
        <Titulo style={{ textAlign: "center" }}>Cómo trabajamos</Titulo>
        <p style={{ textAlign: "center", fontSize: 16, color: MUTED, maxWidth: 600, margin: "0 auto 44px", lineHeight: 1.6 }}>
          Sin paquetes cerrados ni promesas de un día para otro.
        </p>
        <div className="howria-emb-pasos" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {PASOS.map((p) => (
            <div key={p.n} style={{ background: "#FFFFFF", border: `1px solid ${CREAM_SOFT}`, borderRadius: 14, padding: 26 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                width: 38, height: 38, borderRadius: "50%", background: NAVY, color: GOLD,
                fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, marginBottom: 16,
              }}>{p.n}</span>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: NAVY, margin: "0 0 10px" }}>{p.titulo}</h3>
              <p style={{ fontSize: 14.5, lineHeight: 1.6, color: MUTED, margin: 0 }}>{p.texto}</p>
            </div>
          ))}
        </div>
      </Seccion>

      {/* ---------- Qué se trabaja ---------- */}
      <Seccion fondo={CREAM_SOFT}>
        <Titulo style={{ textAlign: "center" }}>Lo que trabajamos con un cachorro</Titulo>
        <p style={{ textAlign: "center", fontSize: 16, color: MUTED, maxWidth: 600, margin: "0 auto 36px", lineHeight: 1.6 }}>
          Elegimos contigo según lo que tu perro necesita — no todos hacen lo mismo.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {TEMAS.map((t) => (
            <span key={t} style={{
              background: "#FFFFFF", border: `1px solid ${GOLD}`, color: NAVY,
              borderRadius: 999, padding: "10px 20px", fontSize: 14.5, fontWeight: 500,
            }}>{t}</span>
          ))}
        </div>
      </Seccion>

      {/* ---------- Cierre + única conversión ---------- */}
      <Seccion fondo={NAVY} style={{ paddingBottom: 92 }}>
        <div style={{ textAlign: "center" }}>
          <Titulo color={CREAM}>Empecemos por conocerlo</Titulo>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: "#D8CDB4", maxWidth: 560, margin: "0 auto 36px" }}>
            Escríbenos y coordinamos la evaluación. Nos cuentas qué te tiene complicado y te decimos
            con qué partiríamos.
          </p>
          <a href={LINK_WHATSAPP} target="_blank" rel="noopener noreferrer" className="howria-emb-cta"
            style={{
              display: "inline-block", background: GOLD, color: NAVY, textDecoration: "none",
              fontWeight: 700, fontSize: 18, padding: "18px 52px", borderRadius: 999,
              boxShadow: "0 10px 30px rgba(201,150,47,0.32)", transition: "filter .15s ease, transform .1s ease",
            }}>
            Agenda aquí
          </a>
          <p style={{ fontSize: 13, color: "#9BAAB8", marginTop: 18 }}>Te responde una persona del equipo, por WhatsApp.</p>
        </div>
      </Seccion>

      <footer style={{ background: NAVY, borderTop: "1px solid rgba(245,239,224,0.12)", padding: "26px 24px", textAlign: "center" }}>
        <p style={{ margin: 0, fontSize: 13, color: "#8A93A5" }}>
          Howria · Paseos y adiestramiento canino en Santiago
        </p>
      </footer>

      {/* Botón fijo: la misma conversión, siempre a mano una vez que ya
          leyó de qué se trata. No es un segundo destino, es el mismo. */}
      {mostrarFijo && (
        <a href={LINK_WHATSAPP} target="_blank" rel="noopener noreferrer" className="howria-emb-cta"
          style={{
            position: "fixed", left: 16, right: 16, bottom: "calc(16px + env(safe-area-inset-bottom))",
            maxWidth: 420, margin: "0 auto", zIndex: 50,
            display: "block", textAlign: "center", background: GOLD, color: NAVY, textDecoration: "none",
            fontWeight: 700, fontSize: 16.5, padding: "16px 24px", borderRadius: 999,
            boxShadow: "0 8px 26px rgba(20,33,61,0.35)", transition: "filter .15s ease, transform .1s ease",
          }}>
          Agenda aquí
        </a>
      )}
      {/* Espacio para que el botón fijo no tape el pie de página */}
      {mostrarFijo && <div style={{ height: 76 }} aria-hidden="true" />}
    </div>
  );
}
