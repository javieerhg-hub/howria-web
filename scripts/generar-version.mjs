// Se corre antes de cada `vite build` (ver package.json) — deja un
// public/version.json con un valor distinto por build, nunca a mano.
// El panel (ver AvisoNuevaVersion en HowriaAdmin.jsx) lo consulta cada
// tanto y, si cambió respecto al que tenía cuando cargó, avisa que hay una
// versión nueva — sobre todo pensado para el PWA instalado, que no se
// recarga solo como una pestaña de navegador normal.
//
// En Vercel, VERCEL_GIT_COMMIT_SHA ya identifica exactamente qué commit
// se está desplegando — se usa esa si existe. En un build local (donde no
// hay deploy real) se cae a un timestamp, que igual sirve para notar que
// "esto es distinto a lo que ya tenías cargado".
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const carpetaPublic = join(__dirname, "..", "public");
mkdirSync(carpetaPublic, { recursive: true });

const version = process.env.VERCEL_GIT_COMMIT_SHA || String(Date.now());
writeFileSync(join(carpetaPublic, "version.json"), JSON.stringify({ version }));
