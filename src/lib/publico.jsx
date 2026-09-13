// Piezas compartidas por las páginas públicas: la portada (Home.jsx), Paseos y
// Adiestramiento.
//
// Se extrajeron de Home.jsx cuando aparecieron las páginas de servicio. Antes
// vivían ahí adentro y estaba bien porque había una sola página; con tres, la
// alternativa era copiar el mismo header y el mismo footer tres veces y que se
// fueran separando solos con cada cambio.
//
// Ojo: esto es solo para las páginas públicas. El panel (/admin) tiene su
// propio layout y no comparte nada de acá.

import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { FOTOS } from "./fotosLanding.js";

export const NAVY = "#14213D";
export const NAVY_LOGO = "#102A41";
export const CREAM = "#F5EFE0";
export const CREAM_SOFT = "#F1EAD5";
export const GOLD = "#C9962F";
// Versión de GOLD con suficiente contraste sobre fondos claros (CREAM/blanco).
export const GOLD_DARK = "#7C5D1A";
export const INK = "#211E1B";
export const MUTED = "#6B6248";

export const WHATSAPP = "https://wa.me/56992471504";
export const INSTAGRAM = "https://instagram.com/HowriaDogs";

// Las comunas donde Howria hace paseos. Van en las páginas de servicio porque
// es lo que busca la gente ("paseador de perros Ñuñoa") y lo que le dice a
// Google en qué parte de Santiago opera el negocio.
export const COMUNAS = ["Las Condes", "La Reina", "Providencia", "Ñuñoa", "Peñalolén", "La Florida"];

export const navLink = { color: "#C9CEDA", textDecoration: "none", fontSize: 14, fontWeight: 500 };
const navLinkMovil = { ...navLink, padding: "11px 0", display: "block" };

export const estilosPublicos = `
  .howria-nav-links { display: flex; gap: 28px; align-items: center; }
  .howria-menu-mobile { display: none; }
  a, button { transition: filter .15s ease, transform .15s ease, opacity .15s ease; }
  a:hover, button:not(:disabled):hover { filter: brightness(0.93); }
  .howria-navlink:hover { filter: none; opacity: 0.75; }
  .howria-whatsapp-float:hover { transform: scale(1.06); }
  .howria-gallery-img { transition: transform .25s ease; }
  .howria-gallery-img:hover { transform: scale(1.04); }
  /* Anillo de foco propio: el del navegador es azul oscuro y sobre el azul
  marino del header prácticamente no se ve. Va con :focus-visible y no con
  :focus para que no aparezca al hacer clic con el mouse, solo al navegar con
  teclado, que es cuando hace falta. */
  a:focus-visible, button:focus-visible {
    outline: 3px solid #E0B457;
    outline-offset: 3px;
    border-radius: 4px;
  }
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
`;

// Cada foto de la landing se sirve en AVIF o WebP —lo que soporte el
// navegador— y en el ancho más chico que alcance para la pantalla del
// visitante. El <img> de adentro conserva el JPEG original como src: un
// navegador moderno nunca lo baja, pero deja el sitio funcionando en uno viejo
// que no entienda ninguno de los dos formatos.
//
// `sizes` es el dato que hace que todo esto sirva: le dice al navegador qué tan
// grande se va a ver la foto ANTES de haber calculado el layout. Si se omite,
// el navegador asume 100vw y baja la versión más grande de todas — que es
// exactamente el problema que este componente vino a resolver. Cada vez que se
// cambie el ancho de una grilla hay que revisar el `sizes` que la acompaña.
//
// Los anchos disponibles salen de fotosLanding.js, que genera
// scripts/optimizar-imagenes.mjs. No están escritos a mano a propósito: no
// todas las fotos originales miden lo mismo, así que cada una tiene su propio
// juego de anchos y una lista fija apuntaría a archivos inexistentes.
export function Foto({ nombre, alt, sizes, className, style, prioridad = false }) {
  const { anchos, proporcion } = FOTOS[nombre];
  const srcSet = (ext) =>
    anchos.map((w) => `/images-home/opt/${nombre}-${w}.${ext} ${w}w`).join(", ");
  const mayor = anchos[anchos.length - 1];

  return (
    // El <picture> es display:inline por defecto, y eso rompe cualquier grilla:
    // el hijo de la grilla pasa a ser el <picture>, no el <img>, así que un
    // `width: 100%` en el <img> se mide contra una caja inline sin ancho
    // definido y la foto se estira. Con display:block ocupa la celda completa y
    // el <img> vuelve a medir lo que corresponde. min-width:0 es lo que evita
    // que una foto ancha empuje y desarme la columna.
    <picture style={{ display: "block", width: "100%", minWidth: 0 }}>
      <source type="image/avif" srcSet={srcSet("avif")} sizes={sizes} />
      <source type="image/webp" srcSet={srcSet("webp")} sizes={sizes} />
      <img
        src={`/images-home/${nombre}.jpg`}
        alt={alt}
        className={className}
        // `height: auto` no es decorativo: los atributos width/height de abajo
        // se traducen a un `height: 960px` real, y mientras el alto no sea auto
        // el navegador ignora el `aspect-ratio` del style. Sin esta línea las
        // fotos de las grillas salen estiradas como tiras verticales. Va antes
        // del style de quien llama para que el hero pueda pedir height: 100%.
        style={{ height: "auto", ...style }}
        width={mayor}
        height={Math.round(mayor / proporcion)}
        decoding="async"
        // La foto del hero es la que define el LCP: se pide de inmediato y con
        // prioridad alta. Todas las demás están bajo el pliegue y se cargan
        // recién cuando el visitante se acerca scrolleando.
        {...(prioridad ? { fetchpriority: "high" } : { loading: "lazy" })}
      />
    </picture>
  );
}

// `enlaces` permite que cada página apunte a sus propias secciones: en la
// portada "Galería" y "Contacto" son anclas de la misma página, pero desde
// /paseos tienen que volver a la portada.
export function Navegacion({ enlaces }) {
  const [menuAbierto, setMenuAbierto] = useState(false);

  return (
    <header style={{ background: NAVY_LOGO, position: "sticky", top: 0, zIndex: 50, boxShadow: "0 2px 10px rgba(0,0,0,0.12)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, color: CREAM, fontWeight: 700 }}>Howria</span>
        </a>
        <nav className="howria-nav-links">
          {enlaces.map((e) => (
            <a key={e.href} href={e.href} className="howria-navlink" style={navLink}>{e.texto}</a>
          ))}
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
        // navLinkMovil agrega alto tocable: los enlaces del menú de celular
        // medían unos 20px de alto y quedaban por debajo de los 44px que
        // recomienda WCAG para algo que se toca con el dedo.
        <div style={{ background: NAVY_LOGO, padding: "8px 24px 20px", display: "flex", flexDirection: "column", gap: 6 }}>
          {enlaces.map((e) => (
            <a key={e.href} href={e.href} className="howria-navlink" style={navLinkMovil} onClick={() => setMenuAbierto(false)}>{e.texto}</a>
          ))}
          <a href="/admin" style={{ background: GOLD, color: NAVY_LOGO, padding: "10px 18px", borderRadius: 20, fontSize: 13.5, fontWeight: 700, textDecoration: "none", textAlign: "center" }}>
            Iniciar sesión
          </a>
        </div>
      )}
    </header>
  );
}

export function PieDePagina({ titulo = "¿Hablamos de tu perro?", texto = "Escríbenos y te contamos, sin vueltas, cómo podemos ayudarte a ti y a tu perro." }) {
  return (
    <footer id="contacto" style={{ background: NAVY_LOGO, color: CREAM, padding: "60px 24px 30px" }}>
      <div className="howria-grid-2" style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40 }}>
        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, marginBottom: 14 }}>{titulo}</h2>
          <p style={{ color: "#9BAAB8", fontSize: 14, lineHeight: 1.7, marginBottom: 22, maxWidth: 420 }}>{texto}</p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href={WHATSAPP} target="_blank" rel="noopener" style={{ background: GOLD, color: NAVY_LOGO, padding: "12px 22px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
              Escríbenos por WhatsApp
            </a>
            <a href={INSTAGRAM} target="_blank" rel="noopener" style={{ background: "transparent", border: "1.5px solid rgba(255,255,255,0.3)", color: CREAM, padding: "12px 22px", borderRadius: 8, fontWeight: 700, fontSize: 14, textDecoration: "none" }}>
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
      {/* #7C8598 daba 3.96:1 sobre el azul marino y no llegaba al mínimo AA de
      4.5:1 que exige un texto de 12px. #8B94A6 da 4.82:1 y a ojo es el mismo
      gris. */}
      <div style={{ maxWidth: 1100, margin: "40px auto 0", paddingTop: 22, borderTop: "1px solid rgba(255,255,255,0.12)", textAlign: "center", fontSize: 12, color: "#8B94A6" }}>
        © {new Date().getFullYear()} Howria — Paseos y adiestramiento canino
      </div>
    </footer>
  );
}

export function BotonWhatsAppFlotante() {
  return (
    <a href={WHATSAPP} target="_blank" rel="noopener" aria-label="Escríbenos por WhatsApp"
      className="howria-whatsapp-float"
      style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 60,
        width: 56, height: 56, borderRadius: "50%", background: "#25D366",
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 14px rgba(0,0,0,0.3)", textDecoration: "none",
      }}>
      <MessageCircle size={28} color="#FFFFFF" strokeWidth={2} aria-hidden="true" />
    </a>
  );
}
