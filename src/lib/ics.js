// Generación de archivos .ics (RFC 5545) para exportar un horario a un
// calendario externo (ej. Calendario de iPhone). Cada cliente se exporta
// como UN evento recurrente semanal (RRULE) en vez de un evento por fecha,
// porque lo que tiene el paseador es un patrón fijo de días, no un listado
// de fechas puntuales.

const DIA_ICS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]; // mismo orden que DIAS_SEMANA (lun..dom)

function escaparTextoICS(texto) {
  return String(texto || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

// Pliega líneas largas a 75 octetos con continuación indentada (obligatorio en RFC 5545).
function plegarLinea(linea) {
  if (linea.length <= 75) return linea;
  let resultado = "";
  let resto = linea;
  while (resto.length > 75) {
    resultado += resto.slice(0, 75) + "\r\n ";
    resto = resto.slice(75);
  }
  return resultado + resto;
}

function formatearFechaHoraICS(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}T${p(date.getHours())}${p(date.getMinutes())}00`;
}

function formatearFechaICS(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

// La fecha más próxima (desde hoy, hoy incluido) entre varios días de la semana —
// para que DTSTART caiga en uno de los días del propio RRULE, como espera la mayoría
// de los calendarios (Apple Calendar incluido).
function proximaFechaEntreDias(diasSemana, horaHabitual, desde = new Date()) {
  const [h, m] = horaHabitual ? horaHabitual.split(":").map(Number) : [9, 0];
  const dowHoy = (desde.getDay() + 6) % 7;
  const diffMinimo = Math.min(...diasSemana.map((d) => (d - dowHoy + 7) % 7));
  return new Date(desde.getFullYear(), desde.getMonth(), desde.getDate() + diffMinimo, h, m, 0);
}

/**
 * eventos: [{ uid, titulo, descripcion, ubicacion, diasSemana: [0..6] (lun..dom), horaHabitual: "HH:MM"|null, duracionMin }]
 * Sin horaHabitual, el evento queda como "todo el día" (no inventa una hora).
 */
export function construirICS(eventos, nombreCalendario = "Howria") {
  const ahora = formatearFechaHoraICS(new Date());
  const lineas = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Howria//Paseos//ES", "CALSCALE:GREGORIAN",
    plegarLinea(`X-WR-CALNAME:${escaparTextoICS(nombreCalendario)}`),
  ];

  eventos.forEach((ev) => {
    if (!ev.diasSemana?.length) return;
    const diasRRule = [...ev.diasSemana].sort((a, b) => a - b).map((d) => DIA_ICS[d]).join(",");
    const inicio = proximaFechaEntreDias(ev.diasSemana, ev.horaHabitual);
    const conHora = !!ev.horaHabitual;
    lineas.push("BEGIN:VEVENT");
    lineas.push(`UID:${ev.uid}`);
    lineas.push(`DTSTAMP:${ahora}`);
    if (conHora) {
      lineas.push(`DTSTART:${formatearFechaHoraICS(inicio)}`);
      const fin = new Date(inicio.getTime() + (ev.duracionMin || 45) * 60000);
      lineas.push(`DTEND:${formatearFechaHoraICS(fin)}`);
    } else {
      lineas.push(`DTSTART;VALUE=DATE:${formatearFechaICS(inicio)}`);
      lineas.push(`DTEND;VALUE=DATE:${formatearFechaICS(inicio)}`);
    }
    lineas.push(`RRULE:FREQ=WEEKLY;BYDAY=${diasRRule}`);
    lineas.push(plegarLinea(`SUMMARY:${escaparTextoICS(ev.titulo)}`));
    if (ev.ubicacion) lineas.push(plegarLinea(`LOCATION:${escaparTextoICS(ev.ubicacion)}`));
    if (ev.descripcion) lineas.push(plegarLinea(`DESCRIPTION:${escaparTextoICS(ev.descripcion)}`));
    lineas.push("END:VEVENT");
  });

  lineas.push("END:VCALENDAR");
  return lineas.join("\r\n");
}

// Probado en iPhone, dos intentos fallidos antes de este:
// 1) location.href a una data: URI — no pasa nada (WebKit moderno bloquea en
//    silencio la navegación de nivel superior a data: iniciada desde JS).
// 2) <a download> con un blob: URL — sí descarga el archivo, pero el atributo
//    download le dice al navegador "guárdalo", así que nunca llega a mirar el
//    Content-Type y ofrecer el flujo de Calendario; solo queda en Archivos.
// Lo que falta: navegar directo al blob: URL (sin download) para que Safari
// mire el tipo text/calendar y ofrezca agregarlo a Calendario él mismo.
export function abrirICS(contenidoICS) {
  const blob = new Blob([contenidoICS], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
