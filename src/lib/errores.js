// Anota en la base los errores que revientan en la app (ver
// database/126_errores_app.sql).
//
// El problema que resuelve: no había ninguna forma de enterarse de que algo
// se rompió. El límite de error evitaba la pantalla en blanco y escribía en
// la consola del navegador — una consola que nadie abre, en el celular de
// un paseador, en la calle. Si esa persona no escribía por WhatsApp, el
// error no existía.
//
// Tres reglas que este archivo no rompe nunca:
//
//  1. NO SE CAE. Si falla el insert, se traga el fallo. Un reportador de
//     errores que tira errores es peor que ninguno.
//  2. NO SE REPITE. Un error dentro de un render se dispara en bucle: sin
//     freno, una sola pantalla rota llena la tabla en segundos.
//  3. NO SE PONE EN EL CAMINO. Todo es "dispara y olvida": nada de esto
//     hace esperar a la persona que está usando la app.
import { supabase } from "./supabaseClient.js";

// Tope por sesión. Con más de esto ya no se aprende nada nuevo: si algo
// falla veinte veces seguidas, las primeras cinco ya lo dicen.
export const MAX_POR_SESION = 5;

// Un error largo no aporta más que uno corto, y la tabla se descarga
// entera para mostrarla.
export const LARGO_MENSAJE = 300;
export const LARGO_DETALLE = 2000;

export function recortar(texto, max) {
  const s = String(texto ?? "").trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

// Dos errores son "el mismo" si dicen lo mismo en el mismo lugar. El stack
// queda fuera a propósito: cambia entre navegadores y con los números de
// línea del build, así que incluirlo haría que el mismo error se reportara
// como nuevo en cada deploy.
export function firmaDeError(mensaje, donde) {
  return `${recortar(mensaje, LARGO_MENSAJE)}@@${donde || ""}`;
}

// Qué se sabe de quién está usando la app. Se fija desde App() cuando hay
// sesión y cuando cambia de pestaña — los handlers globales se instalan
// antes de eso y no tienen forma de saberlo por su cuenta.
let contexto = { usuarioEmail: null, rol: null, donde: null, versionApp: null };

export function fijarContextoDeErrores(datos) {
  contexto = { ...contexto, ...datos };
}

const yaReportados = new Set();
let enviados = 0;

// Solo para los tests: cada uno arranca de cero.
export function reiniciarReporteDeErrores() {
  yaReportados.clear();
  enviados = 0;
  contexto = { usuarioEmail: null, rol: null, donde: null, versionApp: null };
}

// ¿Vale la pena mandar este error? Separado del envío para poder probar
// el freno sin tocar la red.
export function debeReportarse(mensaje, donde) {
  if (!String(mensaje ?? "").trim()) return false;
  if (enviados >= MAX_POR_SESION) return false;
  return !yaReportados.has(firmaDeError(mensaje, donde));
}

export function registrarError(mensaje, detalle, donde) {
  try {
    const lugar = donde || contexto.donde || null;
    if (!debeReportarse(mensaje, lugar)) return;
    yaReportados.add(firmaDeError(mensaje, lugar));
    enviados += 1;

    // Sin await: que nadie espere por esto. Y con .then vacío en el error,
    // porque una promesa rechazada acá dispararía el handler de
    // "unhandledrejection" de más abajo — o sea, el reportador de errores
    // reportándose a sí mismo, en bucle.
    supabase.from("errores_app").insert({
      mensaje: recortar(mensaje, LARGO_MENSAJE),
      detalle: detalle ? recortar(detalle, LARGO_DETALLE) : null,
      donde: lugar,
      usuario_email: contexto.usuarioEmail,
      rol: contexto.rol,
      navegador: recortar(typeof navigator !== "undefined" ? navigator.userAgent : "", 300),
      version_app: contexto.versionApp,
    }).then(() => {}, () => {});
  } catch {
    // A propósito en silencio: ver la regla 1 arriba.
  }
}

// Los dos agujeros que el límite de error de React NO tapa: lo que revienta
// fuera de un render (un onClick, un setTimeout, una respuesta que llega
// tarde) y las promesas que nadie atrapó. Justo donde viven los errores que
// dejan la app "rara" sin romper la pantalla.
export function instalarCapturaDeErrores() {
  if (typeof window === "undefined") return;
  // La versión desplegada no es una constante del build: vive en
  // /version.json y la genera scripts/generar-version.mjs (ver
  // AvisoNuevaVersion). Se busca una vez y se guarda — sin ella, un error
  // que solo pasa en un deploy viejo es imposible de ubicar.
  fetch("/version.json", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => { if (d?.version) fijarContextoDeErrores({ versionApp: String(d.version).slice(0, 60) }); })
    .catch(() => {});
  window.addEventListener("error", (e) => {
    registrarError(e?.message || "Error sin mensaje", e?.error?.stack || `${e?.filename || ""}:${e?.lineno || ""}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e?.reason;
    registrarError(r?.message || String(r || "Promesa rechazada sin motivo"), r?.stack || null);
  });
}
