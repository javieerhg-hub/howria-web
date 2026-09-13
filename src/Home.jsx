import React, { Suspense } from "react";
import { Footprints, GraduationCap, ClipboardCheck } from "lucide-react";
import {
  NAVY, NAVY_LOGO, CREAM, CREAM_SOFT, GOLD, GOLD_DARK, INK, MUTED,
  estilosPublicos, Foto, Navegacion, PieDePagina, BotonWhatsAppFlotante,
} from "./lib/publico.jsx";

// El aviso del cupón de 10% que sale a los pocos segundos de entrar. Va
// aparte y perezoso porque no se ve en el primer pintado: así el visitante
// que solo mira la landing no baja el formulario ni su lógica de envío.
const PromoCupon = React.lazy(() => import("./PromoCupon.jsx"));

const ENLACES = [
  { href: "/paseos", texto: "Paseos" },
  { href: "/adiestramiento", texto: "Adiestramiento" },
  { href: "/nosotros", texto: "Nosotros" },
  { href: "#galeria", texto: "Galería" },
  { href: "#contacto", texto: "Contacto" },
];

export default function Home() {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: INK, background: CREAM }}>
      <style>{estilosPublicos}</style>

      <Navegacion enlaces={ENLACES} />

      {/* ---------- HERO ---------- */}
      <section style={{ position: "relative", padding: "88px 24px 100px", textAlign: "center", overflow: "hidden" }}>
        {/* La foto del hero era un background-image de CSS. El problema de eso
        es que el navegador no la descubre al leer el HTML —el preload scanner
        no mira dentro del CSS— y encima estaba declarada dentro de un
        componente de React, así que recién empezaba a bajarse después de
        descargar y ejecutar todo el bundle. Es lo que arruinaba el LCP.
        Ahora es un <img> de verdad con fetchpriority="high", y además va
        preloadeada desde index.html para que arranque antes que el JavaScript.
        El alt va vacío a propósito: es decorativa, lo que dice la foto ya lo
        dice el <h1> que va encima. */}
        <Foto nombre="hero-tres-perros" alt="" prioridad sizes="100vw"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 30%" }} />
        {/* El degradado azul marino que antes compartía la propiedad CSS con la
        foto, ahora como capa propia encima de ella. */}
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(16,42,65,0.82) 0%, rgba(20,33,61,0.92) 100%)",
        }} />
        <div style={{ position: "relative" }}>
          {/* El logo pesaba 69 KB en PNG para verse a 93px de ancho. Se sirve
          por densidad de pantalla (1x/2x/3x) porque su tamaño en pantalla es
          fijo, no depende del ancho del viewport. */}
          <picture>
            <source type="image/avif" srcSet="/images-home/opt/logo-howria-110h.avif 1x, /images-home/opt/logo-howria-220h.avif 2x, /images-home/opt/logo-howria-330h.avif 3x" />
            <source type="image/webp" srcSet="/images-home/opt/logo-howria-110h.webp 1x, /images-home/opt/logo-howria-220h.webp 2x, /images-home/opt/logo-howria-330h.webp 3x" />
            <img src="/logo-howria.png" alt="Howria" width={93} height={110} style={{ height: 110, width: "auto", display: "block", margin: "0 auto 24px" }} />
          </picture>
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
              { src: "nosotros-pastor", alt: "Perro grande y cocker spaniel juntos en un paseo con Howria" },
              { src: "intro-pastor-aleman", alt: "Pastor alemán atento durante un paseo con Howria" },
              { src: "intro-border-collie", alt: "Border collie sonriente en el pasto durante un paseo" },
              { src: "intro-paseo-calle", alt: "Perro paseando por una calle de Santiago con Howria" },
            ].map((foto) => (
              // Grilla de 2x2 dentro de media pantalla: en escritorio cada foto
              // mide ~245px; en celular la grilla exterior pasa a una columna y
              // cada foto queda en ~46vw.
              <Foto key={foto.src} nombre={foto.src} alt={foto.alt} className="howria-gallery-img"
                sizes="(max-width: 760px) 46vw, 245px"
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
            <a href="/nosotros" style={{ color: NAVY, fontWeight: 700, fontSize: 14, textDecoration: "none", borderBottom: `2px solid ${GOLD}`, paddingBottom: 2 }}>
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
          {[
            { img: "galeria-1", alt: "Cachorro con collar rosado sentado junto a un jardín en su paseo con Howria" },
            { img: "galeria-2", alt: "Cuatro perros de distintas razas juntos en un parque durante un paseo grupal de Howria" },
            { img: "galeria-3", alt: "Perro mestizo con arnés sentado en el pasto junto a una calle" },
            { img: "galeria-4", alt: "Un salchicha y un chihuahua con suéter parados sobre un muro de piedra" },
            { img: "galeria-5", alt: "Yorkshire terrier peludo parado en una vereda soleada" },
            { img: "galeria-6", alt: "Un San Bernardo, un labrador negro y un beagle sentados juntos en el pasto" },
          ].map(({ img, alt }) => (
            // La grilla es auto-fit con columnas de mínimo 150px, así que la
            // cantidad de columnas cambia sola con el ancho. Las fotos terminan
            // midiendo entre 150 y 220px en todo el rango; el caso más grande
            // (~210px) se da alrededor de los 500px de viewport, con dos
            // columnas.
            <Foto key={img} nombre={img} alt={alt} className="howria-gallery-img"
              sizes="(max-width: 520px) 50vw, 220px"
              style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, display: "block" }} />
          ))}
        </div>
      </section>

      <PieDePagina />

      <BotonWhatsAppFlotante />

      {/* Sin fallback: mientras baja no tiene que mostrar nada — el aviso
          aparece solo cuando está listo, y si nunca llegara, la landing
          queda igual de completa. */}
      <Suspense fallback={null}>
        <PromoCupon />
      </Suspense>
    </div>
  );
}

