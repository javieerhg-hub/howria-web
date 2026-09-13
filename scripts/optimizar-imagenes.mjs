// Genera las versiones optimizadas de las fotos de la landing.
//
// Por qué existe: las fotos originales son JPEG de 1100-1600px y hasta 1 MB
// cada una, pero en pantalla se muestran a 165-310px. Es decir, el visitante
// que entra desde Instagram con datos móviles bajaba ~2 MB de fotos en la
// portada y otros ~2 MB en /nosotros para ver imágenes del tamaño de una
// estampilla.
//
// Este script genera, para cada foto, versiones en AVIF y WebP en varios
// anchos. El navegador elige solo la más chica que le sirve, gracias al
// srcset/sizes de Home.jsx.
//
// NO corre en cada build de Vercel a propósito: codificar AVIF es lento y las
// fotos casi nunca cambian. Se corre a mano cuando agregas o cambias fotos:
//
//     npm run imagenes
//
// y después se commitea lo que quedó en las carpetas opt/.

import sharp from "sharp";
import { readdir, mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

// Dos carpetas de fotos, con destinos distintos:
//  - images-home: las de la portada y las páginas de servicio, que renderiza
//    React. Estas además dejan un manifiesto en src/lib/fotosLanding.js.
//  - images: las de /nosotros, que es HTML estático y arma su srcset a mano.
const CARPETAS = [
  { origen: "public/images-home", manifiesto: "src/lib/fotosLanding.js" },
  { origen: "public/images", manifiesto: null },
];

// Los anchos que puede pedir el navegador. El más chico (320) cubre la galería
// en celular; el más grande (1600) cubre el hero en pantallas grandes retina.
// Los pasos intermedios están apretados a propósito: si solo hubiera 320 y 640,
// un celular que necesita 360px terminaría bajando el de 640 — casi cuatro
// veces el peso que necesitaba.
// No se generan anchos mayores al original: agrandar una foto no agrega
// detalle, solo peso.
const ANCHOS = [320, 480, 640, 960, 1280, 1600];

// El hero va detrás de un degradado azul marino casi opaco (0.82-0.92), así que
// se nota muchísimo menos la compresión que en las fotos de la galería, que se
// ven limpias. Por eso va con calidad más baja.
const CALIDAD = {
  hero: { avif: 42, webp: 62 },
  normal: { avif: 52, webp: 74 },
};

// Solo AVIF y WebP. El respaldo para navegadores que no soporten ninguno de los
// dos es el JPEG original, que sigue estando en su carpeta y es el src del
// <img> dentro del <picture>. Generar además JPEG en cada ancho sumaba
// ~2 MB al repositorio para un caso que en la práctica ya no existe (WebP es
// estándar desde 2020 y AVIF desde 2024).

const kb = (n) => Math.round(n / 1024);

async function generar(ORIGEN, DESTINO, archivo) {
  const nombre = path.parse(archivo).name;
  const esHero = nombre.startsWith("hero-");
  const q = esHero ? CALIDAD.hero : CALIDAD.normal;

  const entrada = path.join(ORIGEN, archivo);
  const original = await sharp(entrada).metadata();
  const anchos = ANCHOS.filter((w) => w <= original.width);
  // Si la foto original fuera más chica que 320px igual hay que generar algo.
  if (anchos.length === 0) anchos.push(original.width);

  let pesoTotal = 0;
  for (const ancho of anchos) {
    const base = sharp(entrada).resize({ width: ancho, withoutEnlargement: true });
    const salidas = [
      [`${nombre}-${ancho}.avif`, base.clone().avif({ quality: q.avif, effort: 6 })],
      [`${nombre}-${ancho}.webp`, base.clone().webp({ quality: q.webp })],
    ];
    for (const [salida, pipeline] of salidas) {
      const info = await pipeline.toFile(path.join(DESTINO, salida));
      pesoTotal += info.size;
    }
  }

  const pesoOriginal = (await stat(entrada)).size;
  const masChico = Math.min(...anchos);
  const proporcion = original.width / original.height;
  const avifChico = (await stat(path.join(DESTINO, `${nombre}-${masChico}.avif`))).size;
  console.log(
    `  ${archivo.padEnd(26)} ${String(kb(pesoOriginal)).padStart(4)} KB  ->  ` +
      `${String(kb(avifChico)).padStart(3)} KB en celular (AVIF ${masChico}px)`,
  );
  return { nombre, anchos, proporcion, pesoOriginal, pesoTotal, avifChico };
}

async function procesarCarpeta({ origen, manifiesto }) {
  const destino = path.join(origen, "opt");
  await mkdir(destino, { recursive: true });

  const archivos = (await readdir(origen))
    .filter((f) => /\.(jpe?g|png)$/i.test(f))
    .sort();

  if (archivos.length === 0) {
    console.error(`No hay imágenes en ${origen}`);
    return { original: 0, celular: 0 };
  }

  console.log(`\n${origen} — ${archivos.length} fotos:\n`);

  let original = 0;
  let celular = 0;
  const fotos = {};
  for (const archivo of archivos) {
    const r = await generar(origen, destino, archivo);
    original += r.pesoOriginal;
    celular += r.avifChico;
    fotos[r.nombre] = { anchos: r.anchos, proporcion: Number(r.proporcion.toFixed(4)) };
  }

  // El manifiesto es lo que evita el bug silencioso más probable de todo esto:
  // no todas las fotos originales miden lo mismo (el hero mide 1100px de ancho,
  // las de intro 1600px), así que cada una tiene un juego distinto de anchos
  // generados. Si Home.jsx armara el srcset con una lista fija, el navegador
  // podría pedir un archivo que nunca se generó y la foto saldría rota.
  // Escribiendo acá lo que realmente existe, el srcset nunca miente.
  //
  // /nosotros no lleva manifiesto porque es HTML estático: su srcset está
  // escrito a mano en el archivo y no hay código que lo arme solo.
  if (manifiesto) {
    const modulo =
      `// ARCHIVO GENERADO por scripts/optimizar-imagenes.mjs — no editar a mano.\n` +
      `// Se regenera con: npm run imagenes\n` +
      `//\n` +
      `// Para cada foto: los anchos que existen en ${destino}/ y la proporción\n` +
      `// del original (ancho/alto), que se usa para reservar el espacio y evitar\n` +
      `// que el texto salte mientras la foto carga.\n` +
      `export const FOTOS = ${JSON.stringify(fotos, null, 2)};\n`;
    await writeFile(manifiesto, modulo, "utf8");
  }

  return { original, celular };
}

async function main() {
  let original = 0;
  let celular = 0;

  for (const carpeta of CARPETAS) {
    const r = await procesarCarpeta(carpeta);
    original += r.original;
    celular += r.celular;
  }

  // El logo va aparte: es PNG con transparencia (crema sobre fondo
  // transparente, ver el comentario en index.html), así que se mide por alto
  // —que es como lo usa el hero— y nunca se convierte a JPEG, que no tiene
  // canal alfa.
  const logoEntrada = "public/logo-howria.png";
  const logoOriginal = (await stat(logoEntrada)).size;
  let logoNuevo = 0;
  for (const alto of [110, 220, 330]) {
    const base = sharp(logoEntrada).resize({ height: alto, withoutEnlargement: true });
    for (const [ext, pipeline] of [
      ["avif", base.clone().avif({ quality: 60, effort: 6 })],
      ["webp", base.clone().webp({ quality: 80 })],
    ]) {
      const info = await pipeline.toFile(path.join("public/images-home/opt", `logo-howria-${alto}h.${ext}`));
      if (alto === 110 && ext === "avif") logoNuevo = info.size;
    }
  }
  console.log(
    `\n  ${"logo-howria.png".padEnd(26)} ${String(kb(logoOriginal)).padStart(4)} KB  ->  ` +
      `${String(kb(logoNuevo)).padStart(3)} KB en celular (AVIF 110h)`,
  );

  console.log(
    `\nListo. Las fotos del sitio público pasan de ${kb(original + logoOriginal)} KB ` +
      `a ~${kb(celular + logoNuevo)} KB en celular.\n` +
      `Acuérdate de commitear las carpetas opt/ y el manifiesto.\n`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
