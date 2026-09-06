// Abrir la dirección de un cliente en Google Maps.
//
// Para el paseador es lo más útil de todo: está en la calle, con el
// teléfono en una mano y la correa en la otra, y hasta ahora la dirección
// era texto que había que copiar a mano y pegar en otra app. Peor: la ruta
// guiada, que es LA pantalla que se usa caminando, no mostraba la
// dirección en ninguna parte.

// Se le agrega la comuna y el país por la misma razón que el mapa de rutas
// al geocodificar (ver geocodificarDireccion en MapaRutas.jsx): "Los Leones
// 100" existe en media docena de ciudades. Cuando no hay comuna guardada se
// asume Santiago, igual que allá, para que las dos pantallas lleven al
// mismo punto.
export function consultaDeDireccion(direccion, comuna) {
  const calle = String(direccion || "").trim();
  if (!calle) return null;
  return `${calle}, ${comuna?.trim() || "Santiago"}, Chile`;
}

// El formato universal de Google Maps: en el computador abre el sitio, y en
// un teléfono con la app instalada abre la app directo en esa dirección.
// Un solo enlace sirve para los tres casos, así que no hay que detectar el
// sistema ni mantener una URL por plataforma.
export function urlGoogleMaps(direccion, comuna) {
  const q = consultaDeDireccion(direccion, comuna);
  return q ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` : null;
}
