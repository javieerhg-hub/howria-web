// Las dos páginas de servicio: /paseos y /adiestramiento.
//
// Por qué existen: hasta ahora el sitio tenía una sola página pública con una
// sección "Servicios" de tres párrafos. Eso alcanza para alguien que ya conoce
// Howria y entra por el link de Instagram, pero no para alguien que busca
// "paseador de perros en Ñuñoa" en Google: no había ninguna página que hablara
// de paseos, ni ninguna que hablara de adiestramiento.
//
// Las dos comparten estructura a propósito, siguiendo el marco que usa el
// equipo para explicar cualquier servicio: primero el problema que vive el
// tutor, después la solución concreta, después el resultado. El contenido de
// cada una vive en CONTENIDOS, al final del archivo; el componente solo lo
// dibuja.

import {
  NAVY, NAVY_LOGO, CREAM, CREAM_SOFT, GOLD, GOLD_DARK, INK, MUTED,
  COMUNAS, WHATSAPP, estilosPublicos, Foto, Navegacion, PieDePagina, BotonWhatsAppFlotante,
} from "./lib/publico.jsx";

const ENLACES = [
  { href: "/paseos", texto: "Paseos" },
  { href: "/adiestramiento", texto: "Adiestramiento" },
  { href: "/nosotros", texto: "Nosotros" },
  { href: "/#galeria", texto: "Galería" },
  { href: "#contacto", texto: "Contacto" },
];

const rotulo = (color) => ({
  color, fontSize: 12.5, letterSpacing: 1.5, textTransform: "uppercase",
  fontWeight: 700, marginBottom: 10,
});

function PaginaServicio({ c }) {
  return (
    <div style={{ fontFamily: "'Inter', sans-serif", color: INK, background: CREAM }}>
      <style>{estilosPublicos}</style>

      {/* Los datos estructurados de la página: le dicen a Google que esto es un
      servicio concreto, prestado en estas comunas de Santiago. Es lo que
      conecta la página con las búsquedas de intención local. */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(c.datosEstructurados) }} />

      <Navegacion enlaces={ENLACES} />

      {/* ---------- HERO ---------- */}
      {/* Usa la misma foto de fondo que la portada, y no una propia por página,
      por una razón concreta: el <link rel="preload"> del hero vive en
      index.html, que es el mismo archivo para todas las rutas. Si cada página
      tuviera su foto, el navegador bajaría igual la de la portada sin usarla
      —44 KB al codo— y encima la propia sin adelanto. Compartiéndola, el
      preload sirve para las tres y la foto aparece al instante. A efectos
      visuales casi no se nota: el degradado azul marino que va encima tapa
      entre el 84% y el 93% de la imagen. */}
      <section style={{ position: "relative", padding: "76px 24px 80px", textAlign: "center", overflow: "hidden" }}>
        <Foto nombre="hero-tres-perros" alt="" prioridad sizes="100vw"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center 35%" }} />
        <div style={{
          position: "absolute", inset: 0,
          background: "linear-gradient(180deg, rgba(16,42,65,0.84) 0%, rgba(20,33,61,0.93) 100%)",
        }} />
        <div style={{ position: "relative" }}>
          <p style={{ ...rotulo(GOLD), fontSize: 13, letterSpacing: 2, marginBottom: 14 }}>{c.rotulo}</p>
          <h1 className="howria-hero-title" style={{ fontFamily: "'Fraunces', serif", color: CREAM, fontSize: 42, lineHeight: 1.18, maxWidth: 720, margin: "0 auto 20px" }}>
            {c.titulo}
          </h1>
          <p style={{ color: "#C7D0DA", fontSize: 16, maxWidth: 580, margin: "0 auto 34px", lineHeight: 1.6 }}>
            {c.bajada}
          </p>
          <a href={WHATSAPP} target="_blank" rel="noopener"
            style={{ background: GOLD, color: NAVY_LOGO, padding: "13px 28px", borderRadius: 8, fontWeight: 700, fontSize: 14.5, textDecoration: "none", display: "inline-block" }}>
            Cuéntanos tu caso por WhatsApp
          </a>
        </div>
      </section>

      {/* ---------- EL PROBLEMA ---------- */}
      <section style={{ background: "#FFFFFF", borderBottom: "1px solid #EDE4CE" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "64px 24px" }}>
          <p style={rotulo(GOLD_DARK)}>El problema</p>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: NAVY, marginBottom: 18, lineHeight: 1.3 }}>
            {c.problema.titulo}
          </h2>
          {c.problema.parrafos.map((p) => (
            <p key={p} style={{ fontSize: 15.5, color: MUTED, lineHeight: 1.75, marginBottom: 14 }}>{p}</p>
          ))}
        </div>
      </section>

      {/* ---------- LA SOLUCIÓN ---------- */}
      <section id="opciones" style={{ maxWidth: 1100, margin: "0 auto", padding: "70px 24px" }}>
        <p style={{ ...rotulo(GOLD_DARK), textAlign: "center" }}>La solución</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, color: NAVY, textAlign: "center", marginBottom: 16 }}>
          {c.solucion.titulo}
        </h2>
        <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.7, textAlign: "center", maxWidth: 640, margin: "0 auto 44px" }}>
          {c.solucion.bajada}
        </p>
        <div className="howria-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {c.solucion.opciones.map((o) => (
            <div key={o.titulo} style={{ background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 14, padding: 28, boxShadow: "0 1px 3px rgba(20,33,61,0.05)" }}>
              <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: NAVY, marginBottom: 10 }}>{o.titulo}</h3>
              <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.65, margin: 0 }}>{o.texto}</p>
            </div>
          ))}
        </div>

        {c.solucion.lista && (
          <div style={{ background: CREAM_SOFT, border: "1px solid #E6DBC0", borderRadius: 14, padding: "30px 28px", marginTop: 28 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 19, color: NAVY, marginBottom: 8 }}>{c.solucion.lista.titulo}</h3>
            <p style={{ fontSize: 14, color: MUTED, lineHeight: 1.65, marginTop: 0, marginBottom: 18 }}>{c.solucion.lista.bajada}</p>
            <ul style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: "10px 24px", margin: 0, paddingLeft: 20 }}>
              {c.solucion.lista.items.map((i) => (
                <li key={i} style={{ fontSize: 14.5, color: INK, lineHeight: 1.55 }}>{i}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ---------- CÓMO FUNCIONA ---------- */}
      <section style={{ background: NAVY_LOGO }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "62px 24px" }}>
          <p style={{ ...rotulo(GOLD), textAlign: "center" }}>Cómo funciona</p>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: CREAM, textAlign: "center", marginBottom: 44 }}>
            {c.pasos.titulo}
          </h2>
          <ol className="howria-grid-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 30, listStyle: "none", padding: 0, margin: 0, counterReset: "paso" }}>
            {c.pasos.items.map((p, i) => (
              <li key={p.titulo}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", border: `2px solid ${GOLD}`, color: GOLD, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 15, marginBottom: 14 }}>
                  {i + 1}
                </div>
                <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: CREAM, marginBottom: 8 }}>{p.titulo}</h3>
                <p style={{ fontSize: 14, color: "#B8C2D0", lineHeight: 1.7, margin: 0 }}>{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- EL RESULTADO ---------- */}
      <section style={{ background: "#FFFFFF", borderTop: "1px solid #EDE4CE", borderBottom: "1px solid #EDE4CE" }}>
        <div className="howria-grid-2" style={{ maxWidth: 1100, margin: "0 auto", padding: "66px 24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48, alignItems: "center" }}>
          <div>
            <p style={rotulo(GOLD_DARK)}>El resultado</p>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, color: NAVY, marginBottom: 18, lineHeight: 1.3 }}>
              {c.resultado.titulo}
            </h2>
            <p style={{ fontSize: 15.5, color: MUTED, lineHeight: 1.75, marginBottom: 20 }}>{c.resultado.texto}</p>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 10 }}>
              {c.resultado.items.map((i) => (
                <li key={i} style={{ fontSize: 14.5, color: INK, lineHeight: 1.55 }}>{i}</li>
              ))}
            </ul>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {c.fotosResultado.map((f) => (
              // Misma grilla de 2x2 que usa la portada, así que el mismo `sizes`.
              <Foto key={f.nombre} nombre={f.nombre} alt={f.alt} className="howria-gallery-img"
                sizes="(max-width: 760px) 46vw, 245px"
                style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 12, display: "block" }} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------- DÓNDE ---------- */}
      <section style={{ maxWidth: 760, margin: "0 auto", padding: "60px 24px", textAlign: "center" }}>
        <p style={rotulo(GOLD_DARK)}>Dónde trabajamos</p>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, color: NAVY, marginBottom: 16 }}>
          {c.zonas.titulo}
        </h2>
        <p style={{ fontSize: 15, color: MUTED, lineHeight: 1.7, marginBottom: 24 }}>{c.zonas.texto}</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
          {COMUNAS.map((comuna) => (
            <span key={comuna} style={{ background: "#FFFFFF", border: "1px solid #E6DBC0", borderRadius: 20, padding: "8px 16px", fontSize: 14, color: NAVY, fontWeight: 600 }}>
              {comuna}
            </span>
          ))}
        </div>
      </section>

      <PieDePagina titulo={c.cierre.titulo} texto={c.cierre.texto} />
      <BotonWhatsAppFlotante />
    </div>
  );
}

const DOMINIO = "https://www.howria.cl";

// Mismo negocio en las dos páginas: el @id apunta al LocalBusiness que se
// declara una sola vez en index.html, para que Google entienda que es el mismo
// Howria y no tres negocios distintos.
const PROVEEDOR = { "@id": `${DOMINIO}/#negocio` };
const AREA_SERVIDA = COMUNAS.map((name) => ({ "@type": "City", name, addressCountry: "CL" }));

export function Paseos() {
  return <PaginaServicio c={CONTENIDO_PASEOS} />;
}

export function Adiestramiento() {
  return <PaginaServicio c={CONTENIDO_ADIESTRAMIENTO} />;
}

const CONTENIDO_PASEOS = {
  rotulo: "Paseos caninos · Santiago",
  titulo: "Paseos de perros que se arman alrededor de tu perro",
  bajada:
    "Tu perro sale con alguien que conoce su ritmo, sus miedos y con qué perros se lleva bien. Y tú te enteras de cómo le fue, no te quedas adivinando.",

  problema: {
    titulo: "Un perro que no sale lo suficiente no se aburre: acumula",
    parrafos: [
      "Un perro que pasa ocho o diez horas solo en la casa junta energía que tiene que salir por algún lado. Sale en forma de muebles mordidos, ladridos que terminan en un reclamo del vecino, tirones cada vez que asoma a la calle y una casa que se pone tensa a la hora en que todos llegan cansados.",
      "El problema casi nunca es el perro. Es que no tiene cómo gastar lo que tiene adentro, y que la media hora que le queda al tutor al final del día no alcanza para eso.",
      "Y la salida fácil —contratar al primero que aparezca— suele empeorarlo: un perro reactivo metido en un grupo que no le corresponde vuelve más nervioso de lo que salió.",
    ],
  },

  solucion: {
    titulo: "Tres formas de pasear, según lo que tu perro necesita",
    bajada:
      "No es el mismo paseo para un cachorro que recién aprende a caminar en la calle que para un perro adulto que necesita convivencia. Por eso primero miramos al perro y después elegimos el paseo.",
    opciones: [
      {
        titulo: "Paseo individual",
        texto:
          "Tu perro sale solo con su paseador, sin otros perros alrededor. Es lo que corresponde cuando hay reactividad, miedo, una recuperación en curso, un cachorro que todavía está aprendiendo, o simplemente un perro al que el grupo le incomoda.",
      },
      {
        titulo: "Paseo en manada",
        texto:
          "Sale en grupo con perros compatibles con él, elegidos uno por uno. Además del gasto físico gana lo que ningún paseo individual le da: convivir, leer señales de otros perros, esperar su turno. Es también lo que más nos piden.",
      },
      {
        titulo: "Paseo personalizado",
        texto:
          "Cuando la rutina no calza con las dos anteriores: horarios particulares, una ruta específica, varios perros de la misma casa, o aplicar durante el paseo los ejercicios del plan de adiestramiento que ya está en curso.",
      },
    ],
  },

  pasos: {
    titulo: "Del primer mensaje a la rutina andando",
    items: [
      {
        titulo: "Nos cuentas el caso",
        texto:
          "Por WhatsApp, con lo que sepas: la raza, la edad, cuántas veces sale hoy, qué te preocupa. Con eso ya sabemos si corresponde individual, manada o personalizado.",
      },
      {
        titulo: "Asignamos paseador",
        texto:
          "Tu perro queda con un paseador asignado, no con quien esté disponible ese día. Se arma el grupo de WhatsApp con la familia y se define la frecuencia y el horario.",
      },
      {
        titulo: "Sale y tú te enteras",
        texto:
          "Cada paseo queda registrado en nuestro sistema, y tú recibes cómo le fue. Si un día algo cambia, te avisamos antes — no después.",
      },
    ],
  },

  resultado: {
    titulo: "Un perro cansado de la forma correcta llega a la casa y descansa",
    texto:
      "No es magia ni es inmediato, pero es constante: cuando la salida deja de ser algo que pasa cuando alguien tiene tiempo y pasa a ser una rutina fija, el perro cambia. Y la casa también.",
    items: [
      "Menos destrozos y menos ladridos por energía acumulada",
      "Un perro que camina mejor en la correa, porque sale todos los días",
      "Convivencia con otros perros, si va en manada",
      "Saber cada día cómo le fue, sin tener que preguntar",
      "Tu tiempo de vuelta: dejas de deberle el paseo",
    ],
  },

  fotosResultado: [
    { nombre: "galeria-6", alt: "Un San Bernardo, un labrador negro y un beagle sentados juntos en el pasto durante un paseo en manada" },
    { nombre: "intro-paseo-calle", alt: "Perro paseando por una calle de Santiago con su paseador de Howria" },
    { nombre: "galeria-3", alt: "Perro mestizo con arnés sentado tranquilo en el pasto durante su paseo" },
    { nombre: "galeria-4", alt: "Un salchicha y un chihuahua con suéter parados sobre un muro de piedra en su paseo" },
  ],

  zonas: {
    titulo: "Paseamos en el sector oriente y sur oriente de Santiago",
    texto:
      "Si tu comuna no está en la lista, escríbenos igual: a veces podemos coordinar según el sector exacto y el horario.",
  },

  cierre: {
    titulo: "¿Empezamos con tu perro?",
    texto:
      "Cuéntanos su nombre, su edad y qué te preocupa. Te decimos derecho qué tipo de paseo le corresponde, sin venderte de más.",
  },

  datosEstructurados: {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${DOMINIO}/paseos#servicio`,
    name: "Paseos caninos en Santiago",
    serviceType: "Paseo de perros",
    description:
      "Paseos individuales, en manada y personalizados para perros en Santiago, con paseador asignado, rutina fija y registro de cada salida.",
    url: `${DOMINIO}/paseos`,
    provider: PROVEEDOR,
    areaServed: AREA_SERVIDA,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Tipos de paseo",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Paseo individual" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Paseo en manada" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Paseo personalizado" } },
      ],
    },
  },
};

const CONTENIDO_ADIESTRAMIENTO = {
  rotulo: "Adiestramiento canino · Santiago",
  titulo: "Adiestramiento canino con método, sin miedo ni castigo",
  bajada:
    "Desde obediencia básica hasta casos de reactividad y ansiedad por separación. Primero evaluamos a tu perro; recién después armamos el plan.",

  problema: {
    titulo: "Las conductas no se pasan solas con el tiempo",
    parrafos: [
      "Un cachorro que tira de la correa a los cuatro meses no tira menos a los dos años: tira más fuerte. Un perro que ladra a otro perro en la calle no se acostumbra de tanto verlo — cada episodio que pasa sin manejo refuerza lo que ya hace.",
      "Mientras tanto el paseo deja de ser un momento lindo y se convierte en algo que se evita: se sale a las horas en que no hay nadie, se cambia de vereda, se deja de salir. El perro pierde mundo y la familia pierde paciencia.",
      "Y la mayoría de los consejos que circulan por internet tratan el síntoma —que deje de ladrar— sin preguntar de dónde viene. Por eso funcionan una semana y después no.",
    ],
  },

  solucion: {
    titulo: "Un plan armado sobre tu perro, no sobre un manual",
    bajada:
      "Todo parte con una evaluación, presencial u online. Sin saber qué gatilla la conducta y en qué contexto aparece, cualquier plan es adivinanza.",
    opciones: [
      {
        titulo: "Obediencia",
        texto:
          "Básica, media y avanzada. Desde los llamados y el caminar en correa hasta control a distancia y en ambientes con distracciones reales. Se avanza por etapas: nadie salta a la avanzada sin tener la base.",
      },
      {
        titulo: "Formación de cachorros",
        texto:
          "La ventana en que más rinde el trabajo. Socialización, manejo de la mordida, hábitos de casa y las primeras salidas a la calle hechas bien desde el principio — que es mucho más fácil que corregirlas después.",
      },
      {
        titulo: "Modificación de conducta",
        texto:
          "Los casos que no se resuelven con obediencia sola. Acá el trabajo es con el perro y con la familia, porque buena parte de lo que sostiene la conducta pasa dentro de la casa.",
      },
    ],
    lista: {
      titulo: "Casos que trabajamos en modificación de conducta",
      bajada: "Si lo que te pasa está en esta lista, no es un caso raro: es lo que vemos todas las semanas.",
      items: [
        "Reactividad a perros, personas o vehículos",
        "Fobias y miedos (ruidos, calle, personas)",
        "Ansiedad por separación",
        "Evacuaciones inadecuadas dentro de la casa",
        "Tirones de correa",
        "Estereotipias y conductas repetitivas",
      ],
    },
  },

  pasos: {
    titulo: "Cómo trabajamos un caso",
    items: [
      {
        titulo: "Evaluación",
        texto:
          "Presencial u online. Vemos al perro, escuchamos a la familia y entendemos cuándo aparece la conducta y qué la sostiene. De ahí sale el plan, no antes.",
      },
      {
        titulo: "Plan y clases",
        texto:
          "Clases individuales o grupales según el caso. El entrenador deja un informe de cada clase, con lo que se trabajó y lo que le toca practicar a la familia hasta la siguiente.",
      },
      {
        titulo: "Seguimiento",
        texto:
          "El avance se revisa clase a clase y el plan se ajusta. Si corresponde, los ejercicios se llevan también al paseo diario, que es donde el perro pasa la prueba de verdad.",
      },
    ],
  },

  resultado: {
    titulo: "Que volver a salir a la calle deje de dar susto",
    texto:
      "El objetivo no es un perro que obedezca por miedo. Es una familia que entiende a su perro y un perro que sabe qué se espera de él — que es lo que hace que el cambio se sostenga cuando el entrenador ya no está.",
    items: [
      "Un paseo que se puede hacer a cualquier hora, sin cambiar de vereda",
      "Órdenes que funcionan también fuera de la casa, con distracciones",
      "Una familia que sabe qué hacer cuando aparece la conducta",
      "Un cachorro que llega a adulto sin arrastrar problemas evitables",
      "Informe de cada clase, para saber exactamente en qué se avanzó",
    ],
  },

  fotosResultado: [
    { nombre: "intro-border-collie", alt: "Border collie atento durante una clase de adiestramiento con Howria" },
    { nombre: "nosotros-pastor", alt: "Perro grande y cocker spaniel trabajando juntos con su entrenador" },
    { nombre: "galeria-5", alt: "Yorkshire terrier parado y atento en una vereda soleada" },
    { nombre: "galeria-1", alt: "Cachorro con collar rosado sentado junto a un jardín durante su formación" },
  ],

  zonas: {
    titulo: "Clases en el sector oriente y sur oriente de Santiago",
    texto:
      "Las evaluaciones también se pueden hacer online, así que si estás fuera de estas comunas igual podemos partir por ahí y ver cómo seguimos.",
  },

  cierre: {
    titulo: "Cuéntanos qué está pasando con tu perro",
    texto:
      "Mientras más concreto, mejor: qué hace, cuándo lo hace y desde cuándo. Con eso te decimos si corresponde una evaluación y qué esperaríamos lograr.",
  },

  datosEstructurados: {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${DOMINIO}/adiestramiento#servicio`,
    name: "Adiestramiento canino en Santiago",
    serviceType: "Adiestramiento canino",
    description:
      "Obediencia básica, media y avanzada, formación de cachorros y modificación de conducta (reactividad, fobias, ansiedad por separación, tirones de correa, estereotipias) en Santiago.",
    url: `${DOMINIO}/adiestramiento`,
    provider: PROVEEDOR,
    areaServed: AREA_SERVIDA,
    hasOfferCatalog: {
      "@type": "OfferCatalog",
      name: "Programas de adiestramiento",
      itemListElement: [
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Evaluación conductual" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Obediencia básica, media y avanzada" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Formación de cachorros" } },
        { "@type": "Offer", itemOffered: { "@type": "Service", name: "Modificación de conducta" } },
      ],
    },
  },
};
