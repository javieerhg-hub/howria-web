import React, { useState } from "react";
import { Footprints, GraduationCap, ClipboardCheck, MessageCircle } from "lucide-react";

const NAVY = "#14213D";
const NAVY_LOGO = "#102A41";
const CREAM = "#F5EFE0";
const CREAM_SOFT = "#F1EAD5";
const GOLD = "#C9962F";
const GOLD_DARK = "#7C5D1A"; // versión de GOLD con suficiente contraste sobre fondos claros (CREAM/blanco)
const INK = "#211E1B";
const MUTED = "#6B6248";


export default function Home() {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: INK, background: CREAM }}>
      <style>{`
        .howria-nav-links { display: flex; gap: 28px; align-items: center; }
        .howria-menu-mobile { display: none; }
        a, button { transition: filter .15s ease, transform .15s ease, opacity .15s ease; }
        a:hover, button:not(:disabled):hover { filter: brightness(0.93); }
        .howria-navlink:hover { filter: none; opacity: 0.75; }
        .howria-whatsapp-float:hover { transform: scale(1.06); }
        .howria-gallery-img { transition: transform .25s ease; }
        .howria-gallery-img:hover { transform: scale(1.04); }
        html { scroll-behavior: smooth; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          a, button, .howria-gallery-img { transition: none !important; }
        }
        @media (max-width: 760px) {
          .howria-nav-links { display: none; }
          .howria-menu-mobile { display: flex !important; }
          .howria-hero-title { font-size: 34px !important; }
          .howria-grid-3 { grid-template-columns: 1fr !important; }
          .howria-grid-2 { grid-template-columns: 1fr !important; }
        }
      `}</style>

      {/* ---------- NAV ---------- */}
      <header style={{ background: NAVY_LOGO, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: CREAM, fontWeight: 700 }}>Howria</span>
          </a>
          <nav className="howria-nav-links">
            <a href="#servicios" className="howria-navlink" style={navLink}>Servicios</a>
            <a href="#nosotros" className="howria-navlink" style={navLink}>Nosotros</a>
            <a href="#galeria" className="howria-navlink" style={navLink}>Galería</a>
            <a href="#contacto" className="howria-navlink" style={navLink}>Contacto</a>
            <a href="/admin" style={{ background: GOLD, color: NAVY_LOGO, padding: "9px 18px", borderRadius: 20, fontSize: 13.5, fontWeight: 700, textDecoration: "none" }}>
              Iniciar sesión
            </a>
          </nav>
          <button className="howria-menu-mobile" onClick={() => setMenuAbierto(!menuAbierto)}
            aria-label={menuAbierto ? "Cerrar menú" : "Abrir menú"} aria-expanded={menuAbierto}
            style={{ display: "none", background: "none", border: "none", color: CREAM, fontSize: 22, cursor: "pointer" }}>
            ☰
          </button>
        </div>
        {menuAbierto && (
          <div style={{ background: NAVY_LOGO, padding: "8px 24px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
            <a href="#servicios" className="howria-navlink" style={navLink} onClick={() => setMenuAbierto(false)}>Servicios</a>
            <a href="#nosotros" className="howria-navlink" style={navLink} onClick={() => setMenuAbierto(false)}>Nosotros</a>
            <a href="#galeria" className="howria-navlink" style={navLink} onClick={() => setMenuAbierto(false)}>Galería</a>
            <a href="#contacto" className="howria-navlink" style={navLink} onClick={() => setMenuAbierto(false)}>Contacto</a>
            <a href="/admin" style={{ background: GOLD, color: NAVY_LOGO, padding: "10px 18px", borderRadius: 20, fontSize: 13.5, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
              Iniciar sesión
            </a>
          </div>
        )}
      </header>

      {/* ---------- HERO ---------- */}
      <section style={{ position: "relative", padding: "88px 24px 100px", textAlign: "center", overflow: "hidden" }}>
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: `linear-gradient(180deg, rgba(16,42,65,0.82) 0%, rgba(20,33,61,0.92) 100%), url(/images-home/hero-tres-perros.jpg)`,
          backgroundSize: "cover", backgroundPosition: "center 30%",
        }} />
        <div style={{ position: "relative" }}>
          <img src="/logo-howria.png" alt="Howria" style={{ height: 110, display: "block", margin: "0 auto 24px" }} />
          <p style={{ color: GOLD, fontSize: 13, letterSpacing: 2, textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>
            Paseos & Adiestramiento Canino · Santiago
          </p>
          <h1 className="howria-hero-title" style={{ fontFamily: "'Fraunces', serif", color: CREAM, fontSize: 44, lineHeight: 1.18, maxWidth: 700, margin: "0 auto 20px" }}>
            Cuidamos y educamos a tu perro, para que tu familia viva más tranquila
          </h1>
          <p style={{ color: "#C7D0DA", fontSize: 16, maxWidth: 560, margin: "0 auto 34px", lineHeight: 1.6 }}>
            Paseos y adiestramiento profesional para perros con poco tiempo en casa o comportamientos difíciles de
            manejar solos — con método real y cariño genuino, nunca una fórmula estándar.
          </p>
          <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
            <a href="#contacto" style={{ background: GOLD, color: NAVY_LOGO, padding: "13px 28px", borderRadius: 8, fontWeight: 700, fontSize: 14.5, textDecoration: "none" }}>
              Contáctanos
            </a>
            <a href="#servicios" style={{ background: "transparent", color: CREAM, padding: "13px 28px", borderRadius: 8, fontWeight: 700, fontSize: 14.5, textDecoration: "none", border: "1.5px solid rgba(255,255,255,0.35)" }}>
              Ver servicios
            </a>
          </div>
        </div>
      </section>

      {/* ---------- SERVICIOS ---------- */}
      <section id="servicios" style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px" }}>
        <p style={{ color: GOLD_DARK, fontSize: 12.5, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>Lo que hacemos</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, color: NAVY, textAlign: "center", marginBottom: 44 }}>Nuestros servicios</h2>
        <div className="howria-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            { titulo: "Paseos diarios", texto: "Rutinas de paseo con seguimiento real y personalizado — no una fórmula genérica, sino un plan pensado para tu perro.", Icono: Footprints },
            { titulo: "Adiestramiento", texto: "Clases individuales o grupales con método profesional y trato humano, sin miedo ni castigo — solo respeto y resultados reales.", Icono: GraduationCap },
            { titulo: "Evaluaciones", texto: "Evaluación presencial u online para entender qué necesita tu perro y armar un plan a su medida desde el primer día.", Icono: ClipboardCheck },
          ].map((s) => (
            <div key={s.titulo} style={{ background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 14, padding: 28, boxShadow: "0 1px 3px rgba(20,33,61,0.05)" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: CREAM_SOFT, marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <s.Icono size={22} color={GOLD} strokeWidth={2} aria-hidden="true" />
              </div>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: NAVY, marginBottom: 10 }}>{s.titulo}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.6, margin: 0 }}>{s.texto}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- NOSOTROS (preview) ---------- */}
      <section id="nosotros" style={{ background: "#FFFFFF", borderTop: "1px solid #EDE4CE", borderBottom: "1px solid #EDE4CE" }}>
        <div className="howria-grid-2" style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { src: "nosotros-pastor.jpg", alt: "Perro grande y cocker spaniel juntos en un paseo con Howria" },
              { src: "intro-pastor-aleman.jpg", alt: "Pastor alemán atento durante un paseo con Howria" },
              { src: "intro-border-collie.jpg", alt: "Border collie sonriente en el pasto durante un paseo" },
              { src: "intro-paseo-calle.jpg", alt: "Perro paseando por una calle de Santiago con Howria" },
            ].map((foto) => (
              <img key={foto.src} className="howria-gallery-img" src={`/images-home/${foto.src}`} alt={foto.alt} loading="lazy"
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 12, display: "block" }} />
            ))}
          </div>
          <div>
            <p style={{ color: GOLD_DARK, fontSize: 12.5, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Quiénes somos</p>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: NAVY, marginBottom: 16 }}>
              Cercanía real, método profesional
            </h2>
            <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.7, marginBottom: 16 }}>
              En Howria creemos que un perro puede tener cariño y disciplina a la vez. Nuestro nombre viene del
              aullido que une a la manada — porque cada perro que trabajamos pasa a ser parte de algo más grande que
              un servicio de paseo.
            </p>
            <p style={{ fontSize: 14.5, color: MUTED, lineHeight: 1.7, marginBottom: 22 }}>
              Trabajamos con respeto animal, honestidad con cada familia y disciplina profesional — jamás con miedo
              ni maltrato. El bienestar del perro siempre va primero.
            </p>
            <a href="https://instagram.com/HowriaDogs" target="_blank" rel="noopener" style={{ color: NAVY, fontWeight: 700, fontSize: 14, textDecoration: "none", borderBottom: `2px solid ${GOLD}`, paddingBottom: 2 }}>
              Conoce más sobre nosotros →
            </a>
          </div>
        </div>
      </section>

      {/* ---------- MISIÓN Y VISIÓN ---------- */}
      <section style={{ background: NAVY_LOGO }}>
        <div className="howria-grid-2" style={{ maxWidth: 1100, margin: "0 auto", padding: "60px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 30 }}>
          <div>
            <p style={{ color: GOLD, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Misión</p>
            <p style={{ color: "#D8DCE6", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              Cuidar y educar perros con cariño y disciplina, ayudando a que cada familia viva una relación más sana
              con su mejor amigo.
            </p>
          </div>
          <div>
            <p style={{ color: GOLD, fontSize: 12, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, marginBottom: 10 }}>Visión</p>
            <p style={{ color: "#D8DCE6", fontSize: 15, lineHeight: 1.7, margin: 0 }}>
              Ser la manada de referencia en Chile cuando alguien piensa en paseo y adiestramiento profesional.
            </p>
          </div>
        </div>
      </section>

      {/* ---------- GALERÍA ---------- */}
      <section id="galeria" style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px" }}>
        <p style={{ color: GOLD_DARK, fontSize: 12.5, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700, textAlign: "center", marginBottom: 10 }}>Galería</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, color: NAVY, textAlign: "center", marginBottom: 44 }}>Nuestros paseos y clases</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 }}>
          {["galeria-1.jpg", "galeria-2.jpg", "galeria-3.jpg", "galeria-4.jpg", "galeria-5.jpg", "galeria-6.jpg"].map((img) => (
            <img key={img} className="howria-gallery-img" src={`/images-home/${img}`} alt="Perro en paseo con Howria" loading="lazy"
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, display: "block" }} />
          ))}
        </div>
      </section>

      {/* ---------- CONTACTO / FOOTER ---------- */}
      <footer id="contacto" style={{ background: NAVY_LOGO, color: CREAM, padding: "60px 24px 30px" }}>
        <div className="howria-grid-2" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40 }}>
          <div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, marginBottom: 14 }}>¿Hablamos de tu perro?</h2>
            <p style={{ color: "#9BAAB8", fontSize: 14, lineHeight: 1.7, marginBottom: 22, maxWidth: 420 }}>
              Escríbenos y te contamos, sin vueltas, cómo podemos ayudarte a ti y a tu perro.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="https://wa.me/56992471504" target="_blank" rel="noopener" style={{ background: GOLD, color: NAVY_LOGO, padding: "12px 22px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Escríbenos por WhatsApp
              </a>
              <a href="https://instagram.com/HowriaDogs" target="_blank" rel="noopener" style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", color: CREAM, padding: "12px 22px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
                Síguenos en Instagram
              </a>
            </div>
          </div>
          <div style={{ fontSize: 13.5, color: "#9BAAB8", lineHeight: 2.1 }}>
            <p style={{ margin: 0, color: CREAM, fontWeight: 600, fontFamily: "'Fraunces', serif", fontSize: 16, marginBottom: 6 }}>Howria</p>
            <p style={{ margin: 0 }}>Santiago, Chile</p>
            <p style={{ margin: 0 }}>javieer.hg@gmail.com</p>
            <p style={{ margin: 0 }}>+56 9 9247 1504</p>
          </div>
        </div>
        <div style={{ maxWidth: 1100, margin: "40px auto 0", paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.12)", textAlign: "center", fontSize: 12, color: "#7C8598" }}>
          © {new Date().getFullYear()} Howria — Paseos y adiestramiento canino
        </div>
      </footer>

      <a href="https://wa.me/56992471504" target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp"
        className="howria-whatsapp-float"
        style={{
          position: "fixed", bottom: 24, right: 24, zIndex: 60,
          width: 56, height: 56, borderRadius: "50%", background: "#25D366",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)", textDecoration: "none",
        }}>
        <MessageCircle size={28} color="#FFFFFF" strokeWidth={2} aria-hidden="true" />
      </a>
    </div>
  );
}

const navLink = { color: "#C9CEDA", textDecoration: "none", fontSize: 14, fontWeight: 500 };
