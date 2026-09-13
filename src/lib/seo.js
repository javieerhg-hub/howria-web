// Título, descripción y URL canónica de cada página pública.
//
// Por qué existe: el sitio es una SPA, así que /admin, /cachorros, /paseos y
// la landing comparten un mismo index.html. Si el <title>, la descripción y el
// canonical estuvieran escritos fijos en ese archivo, Google vería todas las
// rutas como copias de la portada — que es peor que no tener canonical.
// Acá cada ruta declara lo suyo y main.jsx lo aplica al cargar.
//
// El dominio va con www porque es el que responde: howria.cl redirige a
// www.howria.cl. Si algún día se invierte la redirección, hay que cambiarlo
// acá y en public/sitemap.xml.

export const DOMINIO = "https://www.howria.cl";

export const PAGINAS = {
  "/": {
    titulo: "Howria — Paseos y adiestramiento canino en Santiago",
    descripcion:
      "Paseos y adiestramiento canino profesional en Santiago. Cuidamos y educamos a tu perro con método real y cariño genuino — nunca una fórmula estándar.",
  },
  "/paseos": {
    titulo: "Paseos y paseador de perros en Santiago | Howria",
    descripcion:
      "Paseos individuales, en manada y personalizados en Santiago. Tu perro sale acompañado por un paseador que conoce su ritmo, y tú recibes el reporte de cada salida.",
  },
  "/adiestramiento": {
    titulo: "Adiestramiento canino en Santiago | Howria",
    descripcion:
      "Obediencia básica, media y avanzada, formación de cachorros y modificación de conducta: reactividad, ansiedad por separación, tirones de correa y más. Sin miedo ni castigo.",
  },
};

// Las rutas que no son páginas públicas: el panel interno, los formularios de
// reserva y las pantallas de vuelta de la pasarela de pago. No aportan nada en
// buscadores y algunas llevan datos de clientes, así que se marcan noindex.
const PRIVADAS = ["/admin", "/agendar", "/agendaadiestrador", "/confirmar-cita", "/pago-exitoso", "/pago-fallido"];

export function esRutaPrivada(pathname) {
  return PRIVADAS.some((p) => pathname.startsWith(p));
}

function ponerMeta(selector, attrs) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement(attrs.tag || "meta");
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k !== "tag") el.setAttribute(k, v);
  }
  return el;
}

// Aplica el SEO de la ruta actual. Se llama una sola vez al arrancar: la app no
// hace navegación entre rutas sin recargar, así que no hace falta reaccionar a
// cambios de URL.
export function aplicarSeo(pathname) {
  // Se normaliza la barra final para que /paseos y /paseos/ no terminen
  // declarándose como dos páginas distintas.
  const ruta = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (esRutaPrivada(ruta)) {
    ponerMeta('meta[name="robots"]', { name: "robots", content: "noindex, nofollow" });
    return;
  }

  const pagina = PAGINAS[ruta];
  if (!pagina) return; // Ruta desconocida: se deja lo que trae index.html.

  document.title = pagina.titulo;
  ponerMeta('meta[name="description"]', { name: "description", content: pagina.descripcion });
  ponerMeta('link[rel="canonical"]', { tag: "link", rel: "canonical", href: DOMINIO + (ruta === "/" ? "/" : ruta) });
  ponerMeta('meta[property="og:title"]', { property: "og:title", content: pagina.titulo });
  ponerMeta('meta[property="og:description"]', { property: "og:description", content: pagina.descripcion });
  ponerMeta('meta[property="og:url"]', { property: "og:url", content: DOMINIO + (ruta === "/" ? "/" : ruta) });
}
