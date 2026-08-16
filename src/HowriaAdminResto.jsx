// Pestañas de uso menos frecuente en el día a día (todo menos Inicio y Mis
// paseos) — separadas de HowriaAdmin.jsx y cargadas con React.lazy() desde
// ahí, para que un paseador (que solo ve esas dos pestañas + Finanzas) no
// tenga que bajar el código de las otras 14 pestañas que nunca usa. Ver
// audit agosto 2026, hallazgo "code-splitting". Todo lo compartido
// (colores, estilos, componentes chicos, hooks de mapeo a Supabase) se
// importa de HowriaAdmin.jsx, que lo exporta para este archivo.
import { useState, useRef, useMemo, useEffect, Fragment } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Search, ArrowUpDown, Dog, Users, Banknote, GripVertical, Receipt, GraduationCap, Link2, Check } from "lucide-react";
import { DndContext, useDraggable, useDroppable, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { supabase, crearCuentaAcceso } from "./lib/supabaseClient.js";
import {
  diasDelMes, esFinDeSemanaOFeriado, valorConRecargo, diasSegunPlan,
  calcularBoletaPaseos, calcularBoletaAdiestramiento, calcularTotales,
  esVenta, esPorCobrar, montoParaResponsable,
} from "./lib/calculosBoletas.js";
import { CalendarioMes, fechaKeyMes } from "./lib/CalendarioMes.jsx";
import { jsPDF } from "jspdf";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, PANEL_BG, NAVY_LOGO,
  PLANES, MESES, DIAS_SEMANA, DIAS_SEMANA_LARGO, TIPOS_SERVICIO, ESTADOS_CLIENTE,
  NIVELES_ENERGIA, TAGS_TEMPERAMENTO, FASES_PASEADOR, TEMARIO_ADIESTRAMIENTO,
  ESTADOS_FACTURA, ESTADOS_PROSPECTO, ORIGENES_PROSPECTO, ROLES_APP, TODOS_LOS_TABS,
  PASOS_CAPACITACION, LOGO_B64, HUELLA_B64,
  tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario,
  Spinner, FilaLista, BotonEliminar, BotonConfirmable, ModalConfirmacion,
  fmtCLP, fechaKey, esBoletaDeCliente, rangoPeriodo, inicioSemana, slugEmailUsuario,
  showToast, comprimirImagen,
  boletaToDb, dbToBoleta, boletaAdiestramientoToDb, dbToBoletaAdiestramiento, dbToCorreo,
} from "./HowriaAdmin.jsx";

const EVENTOS_NOTIFICACION = [
  { id: "cita", label: "Nueva solicitud de cita" },
  { id: "correo", label: "Nuevo correo entrante" },
];

// ---------- Utilidades de mapa (OpenStreetMap, sin API key) ----------
const SANTIAGO_CENTRO = { lat: -33.4489, lng: -70.6693 };

async function geocodificarDireccion(direccion) {
  const q = encodeURIComponent(`${direccion}, Santiago, Chile`);
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${q}`);
  const datos = await resp.json();
  if (!datos?.length) return null;
  return { lat: Number(datos[0].lat), lng: Number(datos[0].lon) };
}

function distanciaKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function ordenarRutaCercanoMasProximo(puntos) {
  if (puntos.length <= 1) return puntos;
  const restantes = [...puntos];
  const ruta = [restantes.shift()];
  while (restantes.length) {
    const ultimo = ruta[ruta.length - 1];
    let mejorIdx = 0, mejorDist = Infinity;
    restantes.forEach((p, i) => {
      const d = distanciaKm(ultimo, p);
      if (d < mejorDist) { mejorDist = d; mejorIdx = i; }
    });
    ruta.push(restantes.splice(mejorIdx, 1)[0]);
  }
  return ruta;
}

// ---------- Calendario ----------
function Calendario({ anio, mesIdx, seleccionados, onToggle }) {
  const total = diasDelMes(mesIdx, anio);
  const primerDia = new Date(anio, mesIdx, 1).getDay();
  const offset = (primerDia + 6) % 7;
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(d);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 6 }}>
        {DIAS_SEMANA.map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "#9A9179", fontWeight: 600 }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
        {celdas.map((d, i) => {
          if (d === null) return <div key={i} />;
          const activo = seleccionados.includes(d);
          const recargo = esFinDeSemanaOFeriado(new Date(anio, mesIdx, d));
          return (
            <button key={i} onClick={() => onToggle(d)} type="button"
              style={{
                aspectRatio: "1",
                border: activo ? (recargo ? `2px solid ${RUST}` : `1.5px solid ${GOLD}`) : (recargo ? `1.5px solid ${RUST}` : "1px solid #E4DBC3"),
                background: activo ? (recargo ? RUST : NAVY) : (recargo ? "#F1DCD2" : "#FFFFFF"), borderRadius: 6, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 13, color: activo ? CREAM : (recargo ? RUST : INK), fontWeight: activo || recargo ? 600 : 400,
              }}>
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Dibujo de la boleta en canvas (para exportar PNG / imprimir PDF) ----------
function dibujarBoleta(canvas, emitida, logoImg, huellaImg) {
  const ctx = canvas.getContext("2d");
  const W = 560, H = 1050;
  const M = 34; // margen lateral
  canvas.width = W;
  canvas.height = H;

  // fondo
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  // marca de agua: huellitas en rastro decorativo, solo en los márgenes
  // laterales — nunca detrás del texto, para no estorbar la lectura
  if (huellaImg) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    const hW = 20, hH = 20 * (huellaImg.height / huellaImg.width);
    let i = 0;
    for (let wy = 160; wy < H - 40; wy += 62) {
      const izquierda = i % 2 === 0;
      const cx = izquierda ? 16 : W - 16;
      ctx.save();
      ctx.translate(cx, wy);
      ctx.rotate(izquierda ? -0.3 : 0.3);
      ctx.drawImage(huellaImg, -hW / 2, -hH / 2, hW, hH);
      ctx.restore();
      i++;
    }
    ctx.restore();
  }

  // encabezado — mismo color de fondo que el logo, para que se unifiquen
  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(0, 0, W, 130);
  if (logoImg) {
    const logoH = 92, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, M, 14, logoW, logoH);
  }
  ctx.fillStyle = CREAM;
  ctx.font = "600 19px 'Fraunces', Georgia";
  ctx.textAlign = "right";
  ctx.fillText(`Boleta N°${String(emitida.numero).padStart(3, "0")}`, W - M, 55);
  ctx.font = "12.5px 'Inter', Helvetica";
  ctx.fillText(`Emitida el ${emitida.fecha}`, W - M, 76);

  // datos cliente
  let y = 168;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 19px 'Fraunces', Georgia";
  ctx.fillText(emitida.cliente, M, y);
  ctx.font = "500 13.5px 'Inter', Helvetica";
  ctx.fillStyle = "#8A7E5C";
  ctx.fillText(`Perro: ${emitida.perro}`, M, y + 21);
  ctx.fillText(`Servicio: Paseos de ${emitida.mes} ${emitida.anio}`, M, y + 41);
  ctx.fillText(`Plan: ${emitida.planNombre}`, M, y + 61);

  let alturaExtraMensaje = 0;
  if (emitida.mensajePersonalizado) {
    ctx.font = "italic 500 13px 'Inter', Helvetica";
    ctx.fillStyle = GOLD;
    wrapTextInline(ctx, `“${emitida.mensajePersonalizado}”`, M, y + 83, W - M * 2);
    alturaExtraMensaje = 36;
  }

  // tabla detalle
  y += 95 + alturaExtraMensaje;
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillRect(M, y, W - M * 2, 36);
  ctx.fillStyle = "#6B6248";
  ctx.font = "700 12px 'Inter', Helvetica";
  ctx.fillText("DETALLE", M + 12, y + 22);
  ctx.textAlign = "right";
  ctx.fillText("VALOR", W - M - 12, y + 22);
  ctx.textAlign = "left";

  y += 36;
  const mesIdxEmitida = MESES.indexOf(emitida.mes);
  const diasNormalesEmitida = emitida.dias.filter((d) => !esFinDeSemanaOFeriado(new Date(emitida.anio, mesIdxEmitida, d)));
  const diasRecargoEmitida = emitida.dias.filter((d) => esFinDeSemanaOFeriado(new Date(emitida.anio, mesIdxEmitida, d)));
  const filas = [
    { texto: `Paseos día hábil (${diasNormalesEmitida.length} x ${fmtCLP(emitida.valorPaseo)})`, valor: fmtCLP(diasNormalesEmitida.length * emitida.valorPaseo), color: INK },
  ];
  if (diasRecargoEmitida.length > 0) {
    filas.push({ texto: `Fin de semana / feriado +${emitida.recargoPct ?? 30}% (${diasRecargoEmitida.length} x ${fmtCLP(valorConRecargo(emitida.valorPaseo, true, emitida.recargoPct))})`, valor: fmtCLP(diasRecargoEmitida.length * valorConRecargo(emitida.valorPaseo, true, emitida.recargoPct)), color: RUST });
  }
  if (emitida.paseosMesAnterior > 0) {
    filas.push({ texto: `Paseo(s) mes anterior agregado(s) (${emitida.paseosMesAnterior} x ${fmtCLP(emitida.valorPaseo)})`, valor: fmtCLP(emitida.paseosMesAnterior * emitida.valorPaseo), color: INK });
  }
  if (emitida.dogsitter?.precio > 0) {
    filas.push({ texto: `Dogsitter${emitida.dogsitter.dias ? ` (${emitida.dogsitter.dias})` : ""}${emitida.dogsitter.nota ? ` — ${emitida.dogsitter.nota}` : ""}`, valor: fmtCLP(emitida.dogsitter.precio), color: INK });
  }
  if (emitida.paseoLargo?.precio > 0) {
    filas.push({ texto: `Paseo largo${emitida.paseoLargo.tiempo ? ` (${emitida.paseoLargo.tiempo})` : ""}${emitida.paseoLargo.nota ? ` — ${emitida.paseoLargo.nota}` : ""}`, valor: fmtCLP(emitida.paseoLargo.precio), color: INK });
  }
  if (emitida.paseosCancelados > 0) {
    filas.push({ texto: `Descuento paseos cancelados mes anterior (${emitida.paseosCancelados} x ${fmtCLP(emitida.valorPaseo)})`, valor: `- ${fmtCLP(emitida.descuento)}`, color: RUST });
  }
  filas.forEach((fila, idx) => {
    const rowH = 36;
    const fy = y + rowH * idx + 23;
    ctx.strokeStyle = "#EFEAD9";
    ctx.beginPath(); ctx.moveTo(M, y + rowH * idx); ctx.lineTo(W - M, y + rowH * idx); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "500 13.5px 'Inter', Helvetica";
    wrapTextInline(ctx, fila.texto, M + 12, fy, W - M * 2 - 130);
    ctx.textAlign = "right";
    ctx.fillStyle = fila.color;
    ctx.font = "700 14px 'Inter', Helvetica";
    ctx.fillText(fila.valor, W - M - 12, fy);
    ctx.textAlign = "left";
  });
  y += 36 * filas.length + 16;

  // calendario
  ctx.strokeStyle = "#EFEAD9";
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 24;
  const alturaCalendario = dibujarCalendarioBoleta(ctx, M, y, W - M * 2, MESES.indexOf(emitida.mes), emitida.anio, emitida.dias, emitida.recargoPct ?? 30);
  y += alturaCalendario + 22;

  // total
  const altoTotal = emitida.mostrarIva ? 98 : 64;
  ctx.fillStyle = NAVY;
  ctx.fillRect(M, y, W - M * 2, altoTotal);
  if (emitida.mostrarIva) {
    const netoEmitida = Math.round(emitida.total / 1.19);
    const ivaEmitida = emitida.total - netoEmitida;
    ctx.fillStyle = "#9BAAB8";
    ctx.font = "12.5px 'Inter', Helvetica";
    ctx.fillText(`Neto: ${fmtCLP(netoEmitida)}`, M + 16, y + 20);
    ctx.textAlign = "right";
    ctx.fillText(`IVA (19%): ${fmtCLP(ivaEmitida)}`, W - M - 16, y + 20);
    ctx.textAlign = "left";
  }
  ctx.fillStyle = CREAM;
  ctx.font = "600 14px 'Inter', Helvetica";
  ctx.fillText("TOTAL A PAGAR", M + 16, y + altoTotal - 37);
  ctx.font = "700 27px 'Fraunces', Georgia";
  ctx.textAlign = "right";
  ctx.fillText(fmtCLP(emitida.total), W - M - 16, y + altoTotal - 22);
  ctx.textAlign = "left";
  y += altoTotal;

  // pie
  ctx.fillStyle = "#B0A587";
  ctx.font = "11.5px 'Inter', Helvetica";
  ctx.textAlign = "center";
  ctx.fillText("Gracias por confiar en Howria", W / 2, Math.min(y + 34, H - 24));
  ctx.textAlign = "left";
}

function wrapTextInline(ctx, text, x, y, maxWidth) {
  const palabras = text.split(" ");
  let linea = "";
  let ly = y;
  let usada = false;
  for (const palabra of palabras) {
    const prueba = linea ? `${linea} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxWidth && linea && !usada) {
      ctx.fillText(linea, x, ly);
      linea = palabra;
      ly += 14;
      usada = true;
    } else {
      linea = prueba;
    }
  }
  ctx.fillText(linea, x, ly);
}

function dibujarCalendarioBoleta(ctx, x, yTop, width, mesIdx, anio, diasMarcados, recargoPct = 30) {
  const total = diasDelMes(mesIdx, anio);
  const primerDia = new Date(anio, mesIdx, 1).getDay();
  const offset = (primerDia + 6) % 7;
  const celdas = [];
  for (let i = 0; i < offset; i++) celdas.push(null);
  for (let d = 1; d <= total; d++) celdas.push(d);

  const colW = width / 7;
  const rowH = 34;
  let y = yTop;

  // título del mes, simple y centrado
  ctx.textAlign = "center";
  ctx.fillStyle = NAVY;
  ctx.font = "600 14px 'Fraunces', Georgia";
  ctx.fillText(`${MESES[mesIdx]} ${anio}`, x + width / 2, y + 4);
  y += 26;

  // encabezado de días, muy sutil
  ctx.font = "600 9.5px 'Inter', Helvetica";
  ctx.fillStyle = "#B7AF95";
  DIAS_SEMANA.forEach((d, i) => {
    ctx.fillText(d.slice(0, 1), x + i * colW + colW / 2, y);
  });
  y += 20;

  const radio = 13;
  celdas.forEach((d, i) => {
    const col = i % 7;
    const fila = Math.floor(i / 7);
    const cx = x + col * colW + colW / 2;
    const cy = y + fila * rowH;
    if (d === null) return;
    const marcado = diasMarcados.includes(d);
    const recargo = esFinDeSemanaOFeriado(new Date(anio, mesIdx, d));

    if (marcado) {
      ctx.beginPath();
      ctx.arc(cx, cy, radio, 0, Math.PI * 2);
      ctx.fillStyle = recargo ? RUST : NAVY;
      ctx.fill();
      ctx.fillStyle = CREAM;
      ctx.font = "600 12px 'Inter', Helvetica";
    } else {
      ctx.fillStyle = "#A39C86";
      ctx.font = "12px 'Inter', Helvetica";
    }
    ctx.fillText(String(d), cx, cy + 4);
  });
  ctx.textAlign = "left";

  const filasGrid = Math.ceil(celdas.length / 7);
  const leyendaY = y + filasGrid * rowH + 18;
  ctx.font = "11px 'Inter', Helvetica";
  ctx.beginPath(); ctx.arc(x + 6, leyendaY - 4, 5, 0, Math.PI * 2); ctx.fillStyle = NAVY; ctx.fill();
  ctx.fillStyle = "#8A7E5C";
  ctx.fillText("Día de paseo", x + 18, leyendaY);
  ctx.beginPath(); ctx.arc(x + 128, leyendaY - 4, 5, 0, Math.PI * 2); ctx.fillStyle = RUST; ctx.fill();
  ctx.fillStyle = "#8A7E5C";
  ctx.fillText(`Fin de semana / feriado (+${recargoPct}%)`, x + 140, leyendaY);

  return 46 + filasGrid * rowH + 32;
}

// Dibuja una pequeña huella de perro (almohadilla + 4 deditos) centrada en (x, y)
function dibujarHuella(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.35);

  // almohadilla central
  ctx.beginPath();
  ctx.ellipse(0, size * 0.35, size * 0.42, size * 0.34, 0, 0, Math.PI * 2);
  ctx.fill();

  // 4 deditos alrededor
  const dedos = [
    { dx: -size * 0.5, dy: -size * 0.25, r: size * 0.22 },
    { dx: -size * 0.18, dy: -size * 0.48, r: size * 0.23 },
    { dx: size * 0.18, dy: -size * 0.48, r: size * 0.23 },
    { dx: size * 0.5, dy: -size * 0.25, r: size * 0.22 },
  ];
  dedos.forEach((d) => {
    ctx.beginPath();
    ctx.ellipse(d.dx, d.dy, d.r * 0.8, d.r, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(" ");
  let line = "";
  let curY = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + " ";
    if (ctx.measureText(test).width > maxWidth && line !== "") {
      ctx.fillText(line, x, curY);
      line = words[n] + " ";
      curY += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, curY);
}

// ---------- Generador de boletas: formulario de paseos ----------
function FormularioBoletaPaseo({ clientes, boletasEmitidas, onRegistrarBoleta, recargoPct, actualizarRecargoPct }) {
  const hoy = new Date();
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? null);
  const [filtroPaseador, setFiltroPaseador] = useState("todos");

  const paseadoresDeClientes = [...new Set(clientes.map((c) => c.paseadorNombre || "Sin asignar"))].sort();
  const clientesFiltrados = filtroPaseador === "todos"
    ? clientes
    : clientes.filter((c) => (c.paseadorNombre || "Sin asignar") === filtroPaseador);

  function cambiarFiltroPaseador(valor) {
    setFiltroPaseador(valor);
    const disponibles = valor === "todos" ? clientes : clientes.filter((c) => (c.paseadorNombre || "Sin asignar") === valor);
    if (disponibles.length > 0 && !disponibles.some((c) => c.id === clienteId)) {
      seleccionarCliente(disponibles[0].id);
    }
  }
  const [mesIdx, setMesIdx] = useState(hoy.getMonth());
  const [anio] = useState(hoy.getFullYear());
  const [planId, setPlanId] = useState("LV");
  const [dias, setDias] = useState(() => diasSegunPlan(hoy.getMonth(), hoy.getFullYear(), PLANES[0].dias));
  const [valorPaseo, setValorPaseo] = useState(clientes[0]?.valorPaseoRef ?? 0);
  const [paseosCancelados, setPaseosCancelados] = useState(0);
  const [paseosMesAnterior, setPaseosMesAnterior] = useState(0);
  const [dogsitterActivo, setDogsitterActivo] = useState(false);
  const [dogsitterPrecio, setDogsitterPrecio] = useState("");
  const [dogsitterDias, setDogsitterDias] = useState("");
  const [dogsitterNota, setDogsitterNota] = useState("");
  const [paseoLargoActivo, setPaseoLargoActivo] = useState(false);
  const [paseoLargoPrecio, setPaseoLargoPrecio] = useState("");
  const [paseoLargoTiempo, setPaseoLargoTiempo] = useState("");
  const [paseoLargoNota, setPaseoLargoNota] = useState("");
  const [mostrarIva, setMostrarIva] = useState(false);
  const [mensajePersonalizado, setMensajePersonalizado] = useState("");
  const [diasSemanaPersonalizado, setDiasSemanaPersonalizado] = useState([]);
  const [emitida, setEmitida] = useState(null);
  const [paraConfirmar, setParaConfirmar] = useState(null);
  const [generando, setGenerando] = useState(false);
  // Ref, no solo useState: dos clics en el mismo instante (doble clic real)
  // pueden ejecutarse ambos antes de que React vuelva a renderizar con
  // "generando" en true, así que el useState solo no alcanza a bloquear el
  // segundo — la ref cambia de inmediato, en el mismo tick.
  const generandoRef = useRef(false);
  const canvasRef = useRef(null);
  const logoImgRef = useRef(null);
  const huellaImgRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.src = LOGO_B64;
    img.onload = () => { logoImgRef.current = img; };
    const img2 = new Image();
    img2.src = HUELLA_B64;
    img2.onload = () => { huellaImgRef.current = img2; };
  }, []);

  const cliente = clientes.find((c) => c.id === clienteId);

  function ultimaBoletaDe(nombreCliente) {
    const previas = boletasEmitidas.filter((b) => b.cliente === nombreCliente).sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
    return previas[0] || null;
  }

  function aplicarPlan(id, mIdx = mesIdx) {
    setPlanId(id);
    const plan = PLANES.find((p) => p.id === id);
    if (plan.id !== "PERSONALIZADO") setDias(diasSegunPlan(mIdx, anio, plan.dias));
    setEmitida(null);
  }

  function seleccionarCliente(id) {
    const c = clientes.find((x) => x.id === Number(id));
    setClienteId(Number(id));
    const ultima = c ? ultimaBoletaDe(c.nombre) : null;
    if (ultima) {
      setValorPaseo(ultima.valorPaseo);
      const mesUltima = MESES.indexOf(ultima.mes);
      const diasSemanaUltima = [...new Set(ultima.dias.map((dNum) => (new Date(ultima.anio, mesUltima, dNum).getDay() + 6) % 7))];
      setPlanId("PERSONALIZADO");
      setDias(diasSegunPlan(mesIdx, anio, diasSemanaUltima));
    } else {
      setValorPaseo(c?.valorPaseoRef ?? 0);
      if (c?.planHabitual) aplicarPlan(c.planHabitual);
    }
    setEmitida(null);
  }

  function toggleDiaSemanaPersonalizado(dow) {
    const dias = diasSemanaPersonalizado.includes(dow) ? diasSemanaPersonalizado.filter((d) => d !== dow) : [...diasSemanaPersonalizado, dow].sort((a, b) => a - b);
    setDiasSemanaPersonalizado(dias);
    setPlanId("PERSONALIZADO");
    setDias(diasSegunPlan(mesIdx, anio, dias));
    setEmitida(null);
  }

  const clienteTieneHistorial = cliente && ultimaBoletaDe(cliente.nombre);

  function cambiarMes(mIdx) {
    setMesIdx(mIdx);
    if (planId === "PERSONALIZADO" && diasSemanaPersonalizado.length > 0) {
      setDias(diasSegunPlan(mIdx, anio, diasSemanaPersonalizado));
      setEmitida(null);
    } else {
      aplicarPlan(planId, mIdx);
    }
  }

  function toggleDia(d) {
    setDias((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)));
    setPlanId("PERSONALIZADO");
    setEmitida(null);
  }

  const montoDogsitter = dogsitterActivo ? Number(dogsitterPrecio || 0) : 0;
  const montoPaseoLargo = paseoLargoActivo ? Number(paseoLargoPrecio || 0) : 0;
  const { diasConRecargo, diasNormales, subtotal, descuento, total, neto, iva } = calcularBoletaPaseos({
    dias, mesIdx, anio, valorPaseo, recargoPct, paseosMesAnterior, paseosCancelados, montoDogsitter, montoPaseoLargo,
  });
  const planNombre = PLANES.find((p) => p.id === planId)?.nombre ?? "Personalizado";

  function revisar() {
    if (!cliente || dias.length === 0) return;
    // No se inserta todavía — se congela una foto de lo que se ve ahora
    // (incluye subtotal/neto/iva, que no se guardan en la boleta, solo
    // para mostrarlos en el resumen) y se muestra la pantalla de
    // confirmación. Recién al confirmar se crea la boleta de verdad.
    setParaConfirmar({
      clienteId: cliente._dbId,
      cliente: cliente.nombre,
      perro: cliente.perro,
      valorPaseo: Number(valorPaseo),
      cantidad: dias.length,
      dias: [...dias],
      mes: MESES[mesIdx],
      anio,
      planNombre,
      paseosCancelados: Number(paseosCancelados || 0),
      paseosMesAnterior: Number(paseosMesAnterior || 0),
      recargoPct: Number(recargoPct),
      dogsitter: dogsitterActivo ? { precio: Number(dogsitterPrecio || 0), dias: dogsitterDias, nota: dogsitterNota } : null,
      paseoLargo: paseoLargoActivo ? { precio: Number(paseoLargoPrecio || 0), tiempo: paseoLargoTiempo, nota: paseoLargoNota } : null,
      mostrarIva,
      mensajePersonalizado: mensajePersonalizado.trim() || null,
      descuento,
      subtotal,
      neto,
      iva,
      diasConRecargo,
      diasNormales,
      total,
      fecha: hoy.toLocaleDateString("es-CL"),
      fechaISO: hoy.toISOString(),
      estado: "no_enviada",
    });
  }

  function cancelarConfirmacion() {
    setParaConfirmar(null);
  }

  async function confirmarEmision() {
    if (!paraConfirmar || generandoRef.current) return;
    generandoRef.current = true;
    setGenerando(true);
    // El número de boleta lo asigna la base de datos sola (columna
    // "numero" generada siempre por Supabase) — acá no se manda, así que
    // no hay forma de que dos boletas terminen con el mismo número, ni
    // aunque se hagan clic en "Confirmar" dos veces casi al mismo tiempo.
    const { data, error } = await supabase.from("boletas").insert(boletaToDb(paraConfirmar)).select().single();
    generandoRef.current = false;
    setGenerando(false);
    if (error || !data) {
      showToast(`No se pudo generar la boleta: ${error?.message || "error desconocido"}`);
      return;
    }
    const nueva = { ...dbToBoleta(data), id: Date.now(), _dbId: data.id };
    setEmitida(nueva);
    setParaConfirmar(null);
    onRegistrarBoleta?.(nueva);
  }

  useEffect(() => {
    if (emitida && canvasRef.current) {
      const dibujar = () => dibujarBoleta(canvasRef.current, emitida, logoImgRef.current, huellaImgRef.current);
      if (document.fonts?.ready) {
        Promise.all([
          document.fonts.load("700 23px Fraunces"),
          document.fonts.load("600 19px Fraunces"),
          document.fonts.load("600 14px Fraunces"),
          document.fonts.load("13px Inter"),
          document.fonts.load("600 13px Inter"),
        ]).then(() => document.fonts.ready).then(dibujar).catch(dibujar);
      } else {
        dibujar();
      }
    }
  }, [emitida]);

  function descargarPNG() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Boleta-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  function imprimirPDF() {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL("image/png");
    const ventana = window.open("", "_blank");
    ventana.document.write(`
      <html>
        <head>
          <style>
            @page { margin: 0; size: auto; }
            html, body { margin: 0; padding: 0; }
            img { display: block; width: 100%; }
          </style>
        </head>
        <body>
          <img src="${dataUrl}" onload="window.print()" />
        </body>
      </html>
    `);
    ventana.document.close();
  }

  function generarPdfBlob() {
    const canvas = canvasRef.current;
    const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    return doc.output("blob");
  }

  function descargarPDF() {
    if (!canvasRef.current) return;
    const blob = generarPdfBlob();
    const link = document.createElement("a");
    link.download = `Boleta-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.pdf`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }

  async function enviarWhatsapp() {
    if (!emitida || !cliente) return;
    const mensaje = `Hola!! Buenas buenas, adjunto el detalle de los paseos 🐾`;
    const nombreArchivo = `Boleta-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.pdf`;

    // en el celular: comparte el PDF ya adjunto y deja elegir el contacto (WhatsApp u otro)
    if (canvasRef.current && navigator.canShare) {
      try {
        const blob = generarPdfBlob();
        const archivo = new File([blob], nombreArchivo, { type: "application/pdf" });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: mensaje });
          return;
        }
      } catch (e) {
        // si el usuario cancela el compartir, no hacemos nada más
        if (e?.name === "AbortError") return;
      }
    }

    // en computador: WhatsApp no permite adjuntar el archivo automáticamente desde una web,
    // así que descargamos el PDF y abrimos el chat con el mensaje listo para adjuntarlo a mano
    descargarPDF();
    const numero = (cliente.telefono || "").replace(/\D/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje + " (adjunta el PDF que se acaba de descargar)")}`, "_blank");
  }

  if (paraConfirmar) {
    const p = paraConfirmar;
    return (
      <div className="howria-card" style={{ ...tarjeta, maxWidth: 560, margin: "0 auto" }}>
        <h2 style={sectionTitle}>Confirmar antes de emitir</h2>
        <p style={hint}>Revisa que todo esté bien — al confirmar, la boleta queda registrada con su número definitivo y ya no se puede deshacer desde acá.</p>

        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14, fontSize: 14, color: INK, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Cliente</span><b>{p.cliente}{p.perro ? ` · 🐾 ${p.perro}` : ""}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Período</span><b>{p.mes} {p.anio}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Plan</span><b>{p.planNombre} · {p.cantidad} paseo(s)</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Valor por paseo</span><b>{fmtCLP(p.valorPaseo)}</b></div>
          {p.diasConRecargo > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Días con recargo ({p.recargoPct}%)</span><b>{p.diasConRecargo}</b></div>
          )}
          {p.dogsitter && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Dogsitter{p.dogsitter.dias ? ` (${p.dogsitter.dias})` : ""}</span><b>{fmtCLP(p.dogsitter.precio)}</b></div>
          )}
          {p.paseoLargo && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Paseo largo{p.paseoLargo.tiempo ? ` (${p.paseoLargo.tiempo})` : ""}</span><b>{fmtCLP(p.paseoLargo.precio)}</b></div>
          )}
          {p.paseosCancelados > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: RUST }}><span>Descuento por {p.paseosCancelados} paseo(s) cancelado(s)</span><b>- {fmtCLP(p.descuento)}</b></div>
          )}
          {p.mensajePersonalizado && (
            <div style={{ marginTop: 4 }}><span style={{ color: "#8A7E5C" }}>Mensaje: </span><i>{p.mensajePersonalizado}</i></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: NAVY, marginTop: 6, paddingTop: 8, borderTop: "1px solid #DCD2B4" }}>
            <span>Total</span><span>{fmtCLP(p.total)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={confirmarEmision} disabled={generando}
            style={{ ...botonPrincipal, marginTop: 0, opacity: generando ? 0.45 : 1 }}>
            {generando ? "Emitiendo..." : "Confirmar emisión"}
          </button>
          <button onClick={cancelarConfirmacion} disabled={generando} style={botonSecundario}>Volver a editar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="howria-split" style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 28 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ marginBottom: 22, padding: "14px 16px", background: CREAM_SOFT, borderRadius: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6B6248" }}>⚙️ Recargo por fin de semana / feriado:</span>
          <input type="number" min="0" max="100" value={recargoPct}
            onChange={(e) => actualizarRecargoPct(Number(e.target.value) || 0)}
            style={{ width: 70, padding: "6px 8px", border: "1px solid #DCD2B4", borderRadius: 6, fontSize: 14, textAlign: "center" }} />
          <span style={{ fontSize: 13, color: "#6B6248" }}>%</span>
          <span style={{ fontSize: 11.5, color: "#9A9179" }}>(se aplica a las boletas nuevas — las ya generadas no cambian)</span>
        </div>

        <h2 style={sectionTitle}>1. Cliente y mes</h2>
        <p style={label} id="boleta-paseador-label">Paseador</p>
        <div role="group" aria-labelledby="boleta-paseador-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => cambiarFiltroPaseador("todos")} aria-pressed={filtroPaseador === "todos"}
            style={{
              padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: filtroPaseador === "todos" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: filtroPaseador === "todos" ? NAVY : "#FFFFFF",
              color: filtroPaseador === "todos" ? CREAM : INK, fontWeight: filtroPaseador === "todos" ? 600 : 400,
            }}>
            Todos
          </button>
          {paseadoresDeClientes.map((p) => (
            <button key={p} type="button" onClick={() => cambiarFiltroPaseador(p)} aria-pressed={filtroPaseador === p}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: filtroPaseador === p ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: filtroPaseador === p ? NAVY : "#FFFFFF",
                color: filtroPaseador === p ? CREAM : INK, fontWeight: filtroPaseador === p ? 600 : 400,
              }}>
              {p}
            </button>
          ))}
        </div>

        <label style={label} htmlFor="boleta-cliente">Cliente</label>
        <select id="boleta-cliente" value={clienteId ?? ""} onChange={(e) => seleccionarCliente(e.target.value)} style={input}>
          {filtroPaseador === "todos" ? (
            paseadoresDeClientes.map((p) => (
              <optgroup key={p} label={p}>
                {clientes.filter((c) => (c.paseadorNombre || "Sin asignar") === p).map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>
                ))}
              </optgroup>
            ))
          ) : (
            clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>)
          )}
        </select>
        <label style={label} htmlFor="boleta-mes">Mes a facturar</label>
        <select id="boleta-mes" value={mesIdx} onChange={(e) => cambiarMes(Number(e.target.value))} style={input}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        {clienteTieneHistorial && (
          <p style={{ ...hint, marginTop: -10 }}>Se reutilizó el valor y el patrón de días de la última boleta de este cliente — puedes ajustarlos si cambiaron.</p>
        )}

        <div style={{ marginTop: 20, padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8 }}>
          <label style={{ ...label, marginBottom: 8, color: "#8A6A1E" }} htmlFor="boleta-mensaje">💬 Mensaje personalizado para esta boleta</label>
          <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 10px" }}>Cualquier trabajador puede agregar aquí una nota para el tutor — aparece en cursiva dorada dentro de la boleta.</p>
          <input id="boleta-mensaje" type="text" placeholder="ej. ¡Gracias por otro mes con nosotros!" value={mensajePersonalizado} onChange={(e) => { setMensajePersonalizado(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
        </div>

        <h2 style={{ ...sectionTitle, marginTop: 26 }} id="boleta-plan-label">2. Plan de paseos</h2>
        <div role="group" aria-labelledby="boleta-plan-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          {PLANES.filter((p) => p.id !== "PERSONALIZADO").map((p) => (
            <button key={p.id} onClick={() => aplicarPlan(p.id)} type="button" aria-pressed={planId === p.id}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: planId === p.id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: planId === p.id ? NAVY : "#FFFFFF",
                color: planId === p.id ? CREAM : INK, fontWeight: planId === p.id ? 600 : 400,
              }}>
              {p.nombre}
            </button>
          ))}
          <button onClick={() => setPlanId("PERSONALIZADO")} type="button" aria-pressed={planId === "PERSONALIZADO"}
            style={{
              padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: planId === "PERSONALIZADO" ? `1.5px solid ${GOLD}` : "1px solid #DCD2B4",
              background: planId === "PERSONALIZADO" ? GOLD : "#FFFFFF",
              color: planId === "PERSONALIZADO" ? NAVY : INK, fontWeight: planId === "PERSONALIZADO" ? 600 : 400,
            }}>
            Personalizado
          </button>
        </div>
        {planId === "PERSONALIZADO" && (
          <div role="group" aria-label="Días de paseo personalizados" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {DIAS_SEMANA_LARGO.map((d, dow) => (
              <button key={dow} type="button" onClick={() => toggleDiaSemanaPersonalizado(dow)} aria-pressed={diasSemanaPersonalizado.includes(dow)}
                style={{
                  padding: "7px 12px", borderRadius: 8, fontSize: 12.5, cursor: "pointer",
                  border: diasSemanaPersonalizado.includes(dow) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                  background: diasSemanaPersonalizado.includes(dow) ? NAVY : "#FFFFFF",
                  color: diasSemanaPersonalizado.includes(dow) ? CREAM : INK,
                }}>
                {d.slice(0, 3)}
              </button>
            ))}
          </div>
        )}
        <p style={hint}>El plan marca los días automáticamente en el calendario — puedes ajustarlos a mano si algún día cambia. Los días en <b style={{ color: RUST }}>rojo</b> son fin de semana o feriado (+{recargoPct}%).</p>
        <Calendario anio={anio} mesIdx={mesIdx} seleccionados={dias} onToggle={toggleDia} />

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>3. Valor y descuentos</h2>
        <label style={label} htmlFor="boleta-valor-paseo">Valor del paseo este mes</label>
        <input id="boleta-valor-paseo" type="number" value={valorPaseo} onChange={(e) => { setValorPaseo(e.target.value); setEmitida(null); }} style={input} />
        <label style={label} htmlFor="boleta-paseos-cancelados">Paseos cancelados el mes anterior a descontar</label>
        <input id="boleta-paseos-cancelados" type="number" min="0" value={paseosCancelados} onChange={(e) => { setPaseosCancelados(e.target.value); setEmitida(null); }} style={input} />
        <label style={label} htmlFor="boleta-paseos-mes-anterior">Opcional: agregar paseo(s) del mes anterior no facturados</label>
        <input id="boleta-paseos-mes-anterior" type="number" min="0" value={paseosMesAnterior} onChange={(e) => { setPaseosMesAnterior(e.target.value); setEmitida(null); }} style={input} />

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>4. Servicios adicionales (opcional)</h2>

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: dogsitterActivo ? 10 : 16 }}>
          <input type="checkbox" checked={dogsitterActivo} onChange={(e) => { setDogsitterActivo(e.target.checked); setEmitida(null); }} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Dogsitter</span>
        </label>
        {dogsitterActivo && (
          <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, paddingLeft: 24 }}>
            <div>
              <label style={label} htmlFor="boleta-dogsitter-precio">Precio</label>
              <input id="boleta-dogsitter-precio" type="number" min="0" placeholder="$" value={dogsitterPrecio} onChange={(e) => { setDogsitterPrecio(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div>
              <label style={label} htmlFor="boleta-dogsitter-dias">Días</label>
              <input id="boleta-dogsitter-dias" type="text" placeholder="ej. 3 días" value={dogsitterDias} onChange={(e) => { setDogsitterDias(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={label} htmlFor="boleta-dogsitter-nota">Nota breve (opcional)</label>
              <input id="boleta-dogsitter-nota" type="text" placeholder="ej. quedó en casa del cliente" value={dogsitterNota} onChange={(e) => { setDogsitterNota(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: paseoLargoActivo ? 10 : 16 }}>
          <input type="checkbox" checked={paseoLargoActivo} onChange={(e) => { setPaseoLargoActivo(e.target.checked); setEmitida(null); }} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Paseo largo</span>
        </label>
        {paseoLargoActivo && (
          <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16, paddingLeft: 24 }}>
            <div>
              <label style={label} htmlFor="boleta-paseolargo-precio">Precio</label>
              <input id="boleta-paseolargo-precio" type="number" min="0" placeholder="$" value={paseoLargoPrecio} onChange={(e) => { setPaseoLargoPrecio(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div>
              <label style={label} htmlFor="boleta-paseolargo-tiempo">Tiempo</label>
              <input id="boleta-paseolargo-tiempo" type="text" placeholder="ej. 1.5 horas" value={paseoLargoTiempo} onChange={(e) => { setPaseoLargoTiempo(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div style={{ gridColumn: "span 2" }}>
              <label style={label} htmlFor="boleta-paseolargo-nota">Nota breve (opcional)</label>
              <input id="boleta-paseolargo-nota" type="text" placeholder="ej. fue al cerro con otro perro" value={paseoLargoNota} onChange={(e) => { setPaseoLargoNota(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
            </div>
          </div>
        )}

        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 16 }}>
          <input type="checkbox" checked={mostrarIva} onChange={(e) => { setMostrarIva(e.target.checked); setEmitida(null); }} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Mostrar desglose de IVA (19%) en la boleta</span>
        </label>

        <div style={{ marginTop: 8, padding: "18px 20px", background: PANEL_BG, borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK }}>
            <span>{diasNormales.length} paseos día hábil × {fmtCLP(valorPaseo)}</span>
            <span>{fmtCLP(diasNormales.length * Number(valorPaseo || 0))}</span>
          </div>
          {diasConRecargo.length > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: RUST, marginTop: 4 }}>
              <span>{diasConRecargo.length} paseo(s) fin de semana/feriado × {fmtCLP(valorConRecargo(valorPaseo, true, recargoPct))} (+{recargoPct}%)</span>
              <span>{fmtCLP(diasConRecargo.length * valorConRecargo(valorPaseo, true, recargoPct))}</span>
            </div>
          )}
          {paseosMesAnterior > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK, marginTop: 4 }}>
              <span>{paseosMesAnterior} paseo(s) mes anterior agregado(s) × {fmtCLP(valorPaseo)}</span>
              <span>{fmtCLP(Number(paseosMesAnterior || 0) * Number(valorPaseo || 0))}</span>
            </div>
          )}
          {dogsitterActivo && montoDogsitter > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK, marginTop: 4 }}>
              <span>Dogsitter{dogsitterDias ? ` (${dogsitterDias})` : ""}</span>
              <span>{fmtCLP(montoDogsitter)}</span>
            </div>
          )}
          {paseoLargoActivo && montoPaseoLargo > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK, marginTop: 4 }}>
              <span>Paseo largo{paseoLargoTiempo ? ` (${paseoLargoTiempo})` : ""}</span>
              <span>{fmtCLP(montoPaseoLargo)}</span>
            </div>
          )}
          {paseosCancelados > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: RUST, marginTop: 4 }}>
              <span>Descuento por {paseosCancelados} paseo(s) cancelado(s)</span>
              <span>- {fmtCLP(descuento)}</span>
            </div>
          )}
          {mostrarIva && (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px dashed #DCD2B4" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B6248" }}>
                <span>Neto</span>
                <span>{fmtCLP(neto)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6B6248", marginTop: 2 }}>
                <span>IVA (19%)</span>
                <span>{fmtCLP(iva)}</span>
              </div>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: NAVY, marginTop: 8, fontWeight: 700, borderTop: "1px solid #DCD2B4", paddingTop: 8 }}>
            <span>Total</span>
            <span>{fmtCLP(total)}</span>
          </div>
        </div>

        <button onClick={revisar} disabled={!cliente || dias.length === 0}
          style={{ ...botonPrincipal, marginTop: 20, opacity: !cliente || dias.length === 0 ? 0.45 : 1 }}>
          Generar boleta
        </button>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Vista previa de la boleta</h2>
        {!emitida ? (
          <div style={{ border: "1.5px dashed #D8CEB0", borderRadius: 8, padding: 40, textAlign: "center", color: "#9A9179", fontSize: 13, marginTop: 8 }}>
            Genera la boleta para ver aquí la imagen final, lista para descargar.
          </div>
        ) : (
          <div>
            <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, overflow: "hidden" }}>
              <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={descargarPNG} style={{ ...botonPrincipal, marginTop: 0 }}>Descargar PNG</button>
              <button onClick={imprimirPDF} style={{ ...botonSecundario }}>Guardar como PDF</button>
              <button onClick={enviarWhatsapp} style={{ ...botonSecundario, borderColor: "#2F6A46", color: "#2F6A46" }}>Enviar por WhatsApp</button>
            </div>
            <p style={{ ...hint, marginTop: 8 }}>WhatsApp Web no permite adjuntar la imagen automáticamente — se abre el chat con el mensaje listo; descarga el PNG y adjúntalo ahí.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Formulario de registro / edición de cliente ----------
const FORM_VACIO = { nombre: "", perro: "", telefono: "", email: "", valorPaseoRef: "", raza: "", pesoKg: "", fotoUrl: null, diasHabituales: [], horaHabitual: "", planHabitual: "LV", objetivos: "", paseadorNombre: "", tarifaPaseador: "", adiestradorNombre: "", responsableNombre: "", direccion: "", lat: null, lng: null, tipoServicio: ["paseos"], estadoCliente: "activo", fechaInicio: "" };

function FormularioCliente({ inicial, paseadores, entrenadores, responsables, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial ?? FORM_VACIO);
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const formInvalido = !form.nombre.trim() || !form.perro.trim();

  function toggleDiaHabitual(dow) {
    setForm((f) => ({ ...f, diasHabituales: f.diasHabituales.includes(dow) ? f.diasHabituales.filter((d) => d !== dow) : [...f.diasHabituales, dow].sort() }));
  }

  function toggleTipoServicio(tipoId) {
    setForm((f) => ({ ...f, tipoServicio: f.tipoServicio.includes(tipoId) ? f.tipoServicio.filter((t) => t !== tipoId) : [...f.tipoServicio, tipoId] }));
  }

  function elegirPlan(planId) {
    const plan = PLANES.find((p) => p.id === planId);
    setForm((f) => ({ ...f, planHabitual: planId, diasHabituales: plan.id === "PERSONALIZADO" ? f.diasHabituales : plan.dias }));
  }

  async function subirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fotoUrl = await comprimirImagen(file);
    setForm((f) => ({ ...f, fotoUrl }));
  }

  function guardar() {
    setIntentoGuardar(true);
    if (formInvalido) return;
    onGuardar(form);
  }

  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 22, margin: "16px 0" }}>
      <div className="howria-photo-row" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20 }}>
        <div>
          <div style={{ width: 100, height: 100, borderRadius: 10, background: form.fotoUrl ? `url(${form.fotoUrl}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
            {!form.fotoUrl && "Foto del perro"}
          </div>
          <label style={{ ...botonSecundario, display: "inline-block", marginTop: 10, padding: "6px 10px", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
            Subir foto
            <input type="file" accept="image/*" onChange={subirFoto} style={{ display: "none" }} />
          </label>
        </div>

        <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <input placeholder="Nombre cliente" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Teléfono / WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input type="email" placeholder="Correo (para que pueda entrar a su portal)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Nombre del perro" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Raza" value={form.raza} onChange={(e) => setForm({ ...form, raza: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Peso (kg)" type="number" min="0" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Valor paseo referencial" type="number" min="0" value={form.valorPaseoRef} onChange={(e) => setForm({ ...form, valorPaseoRef: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Dirección (para la pestaña Mapa)" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value, lat: null, lng: null })} style={{ ...input, marginBottom: 0, gridColumn: "1 / -1" }} />
        </div>
      </div>

      <p style={{ ...label, marginTop: 18 }} id="cliente-plan-label">Plan que normalmente contrata</p>
      <div role="group" aria-labelledby="cliente-plan-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PLANES.filter((p) => p.id !== "PERSONALIZADO").map((p) => (
          <button key={p.id} type="button" onClick={() => elegirPlan(p.id)} aria-pressed={form.planHabitual === p.id}
            style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: form.planHabitual === p.id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.planHabitual === p.id ? NAVY : "#FFFFFF",
              color: form.planHabitual === p.id ? CREAM : INK }}>
            {p.nombre}
          </button>
        ))}
      </div>

      <p style={label} id="cliente-dias-label">Días de paseo habituales</p>
      <div role="group" aria-labelledby="cliente-dias-label" style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {DIAS_SEMANA.map((d, dow) => (
          <button key={dow} type="button" onClick={() => toggleDiaHabitual(dow)} aria-pressed={form.diasHabituales.includes(dow)}
            style={{ width: 34, height: 34, borderRadius: 8, cursor: "pointer",
              border: form.diasHabituales.includes(dow) ? `1.5px solid ${GOLD}` : "1px solid #DCD2B4",
              background: form.diasHabituales.includes(dow) ? NAVY : "#FFFFFF",
              color: form.diasHabituales.includes(dow) ? CREAM : INK, fontSize: 13 }}>
            {d}
          </button>
        ))}
      </div>

      <label style={label} htmlFor="cliente-hora-habitual">Hora habitual del paseo (opcional)</label>
      <input id="cliente-hora-habitual" type="time" value={form.horaHabitual} onChange={(e) => setForm({ ...form, horaHabitual: e.target.value })} style={{ ...input, maxWidth: 160 }} />

      <p style={label}>Estado del cliente y fecha de inicio</p>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <select value={form.estadoCliente} onChange={(e) => setForm({ ...form, estadoCliente: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          {ESTADOS_CLIENTE.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} style={{ ...input, marginBottom: 0 }} />
      </div>

      <p style={label} id="cliente-tiposervicio-label">Tipo de servicio</p>
      <div role="group" aria-labelledby="cliente-tiposervicio-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {TIPOS_SERVICIO.map((t) => (
          <button key={t.id} type="button" onClick={() => toggleTipoServicio(t.id)} aria-pressed={form.tipoServicio.includes(t.id)}
            style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: form.tipoServicio.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.tipoServicio.includes(t.id) ? NAVY : "#FFFFFF",
              color: form.tipoServicio.includes(t.id) ? CREAM : INK }}>
            {t.nombre}
          </button>
        ))}
      </div>
      {form.tipoServicio.includes("evaluacion") && (
        <p style={{ ...hint, marginTop: -10 }}>Para agendar la evaluación con el adiestrador, guarda la ficha y ve a la pestaña "Agenda".</p>
      )}

      <label style={label} htmlFor="cliente-objetivos">Objetivos a cumplir</label>
      <textarea id="cliente-objetivos" value={form.objetivos} onChange={(e) => setForm({ ...form, objetivos: e.target.value })} placeholder="Ej. socialización, bajar ansiedad, mejorar caminata con correa..."
        style={{ ...input, minHeight: 70, resize: "vertical", fontFamily: "inherit" }} />

      <p style={label}>Paseador asignado</p>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        <select value={form.paseadorNombre} onChange={(e) => setForm({ ...form, paseadorNombre: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          <option value="">Sin asignar</option>
          {paseadores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
        </select>
        <input placeholder="Tarifa a pagar al paseador por paseo" type="number" min="0" value={form.tarifaPaseador} onChange={(e) => setForm({ ...form, tarifaPaseador: e.target.value })} style={{ ...input, marginBottom: 0 }} />
      </div>
      <p style={{ ...hint, marginTop: -10 }}>Esta tarifa es lo que se le paga al paseador por cada paseo de este cliente — puede ser distinta al valor cobrado al cliente. Para reasignar paseadores en bloque, usa la pestaña "Asignaciones".</p>

      <p style={label}>Entrenador asignado (para clases de adiestramiento)</p>
      <select value={form.adiestradorNombre} onChange={(e) => setForm({ ...form, adiestradorNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {entrenadores.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
      </select>
      <p style={{ ...hint, marginTop: -10 }}>Define de quién son "sus" clientes en la Finanzas personal del entrenador.</p>

      <p style={label}>Responsable de la cuenta</p>
      <select value={form.responsableNombre} onChange={(e) => setForm({ ...form, responsableNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {responsables.map((r) => <option key={r.id} value={r.nombre}>{r.nombre}</option>)}
      </select>
      <p style={{ ...hint, marginTop: -10 }}>Quién es el dueño del caso (ej. Javier Arniaz) — define de quién son las ventas de este cliente en la Finanzas personal de esa persona, sin importar su rol en la app.</p>

      {intentoGuardar && formInvalido && (
        <p style={{ color: RUST, fontSize: 12.5, margin: "0 0 10px" }}>Falta el nombre del cliente y/o del perro — son obligatorios para guardar.</p>
      )}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, marginTop: 0, opacity: intentoGuardar && formInvalido ? 0.6 : 1 }}>Guardar ficha</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Mascotas (perfil del perro, separado del tutor) ----------
function FormularioMascota({ inicial, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial ?? { nombre: "", raza: "", pesoKg: "", nivelEnergia: "", temperamento: [], notas: "" });

  function toggleTemperamento(tagId) {
    setForm((f) => ({ ...f, temperamento: f.temperamento.includes(tagId) ? f.temperamento.filter((t) => t !== tagId) : [...f.temperamento, tagId] }));
  }

  function guardar() {
    if (!form.nombre.trim()) return;
    onGuardar({ ...form, pesoKg: Number(form.pesoKg) || 0 });
  }

  return (
    <div style={{ background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: 16, marginBottom: 10 }}>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <input placeholder="Nombre del perro" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <input placeholder="Raza" value={form.raza} onChange={(e) => setForm({ ...form, raza: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <input placeholder="Peso (kg)" type="number" min="0" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        <select value={form.nivelEnergia || ""} onChange={(e) => setForm({ ...form, nivelEnergia: e.target.value })} style={{ ...input, marginBottom: 0 }}>
          <option value="">Nivel de energía...</option>
          {NIVELES_ENERGIA.map((n) => <option key={n.id} value={n.id}>{n.nombre}</option>)}
        </select>
      </div>
      <p style={{ ...label, marginTop: 12 }} id="mascota-temperamento-label">Temperamento</p>
      <div role="group" aria-labelledby="mascota-temperamento-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {TAGS_TEMPERAMENTO.map((t) => (
          <button key={t.id} type="button" onClick={() => toggleTemperamento(t.id)} aria-pressed={form.temperamento.includes(t.id)}
            style={{ padding: "6px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer",
              border: form.temperamento.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: form.temperamento.includes(t.id) ? NAVY : "#FFFFFF",
              color: form.temperamento.includes(t.id) ? CREAM : INK }}>
            {t.nombre}
          </button>
        ))}
      </div>
      <input placeholder="Notas (opcional)" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} style={{ ...input, marginBottom: 12 }} />
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// Cada perro con sus datos y, si ya tiene _dbId, un desplegable para
// marcar con quién no se lleva bien (persiste al toque, sin botón de
// guardar aparte — mismo criterio que el resto de los checkboxes de la app).
function FilaMascota({ mascota, todasLasMascotas, incompatibilidades, setMascotaIncompatibilidades, onEditar, onEliminar }) {
  const [verIncompatibles, setVerIncompatibles] = useState(false);
  const misIncompatibles = incompatibilidades.filter((i) => i.mascotaId1 === mascota._dbId || i.mascotaId2 === mascota._dbId);
  const idsIncompatibles = new Set(misIncompatibles.map((i) => (i.mascotaId1 === mascota._dbId ? i.mascotaId2 : i.mascotaId1)));
  const otrasMascotas = todasLasMascotas.filter((m) => m._dbId && m._dbId !== mascota._dbId);

  function toggleIncompatible(otraId) {
    if (idsIncompatibles.has(otraId)) {
      setMascotaIncompatibilidades((prev) => prev.filter((i) =>
        !((i.mascotaId1 === mascota._dbId && i.mascotaId2 === otraId) || (i.mascotaId1 === otraId && i.mascotaId2 === mascota._dbId))));
    } else {
      setMascotaIncompatibilidades((prev) => [...prev, { id: Date.now(), mascotaId1: mascota._dbId, mascotaId2: otraId }]);
    }
  }

  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 600, color: NAVY, fontSize: 13.5 }}>🐾 {mascota.nombre}</span>
          {mascota.necesitaRevision && (
            <span title="Puede ser más de un perro escrito junto — revisar y separar" style={{ marginLeft: 8, fontSize: 11, color: RUST, fontWeight: 600 }}>⚠️ Revisar</span>
          )}
          <span style={{ marginLeft: 8, fontSize: 12, color: "#8A7E5C" }}>
            {mascota.raza || "raza sin especificar"}{mascota.pesoKg ? ` · ${mascota.pesoKg} kg` : ""}
            {mascota.nivelEnergia ? ` · energía ${NIVELES_ENERGIA.find((n) => n.id === mascota.nivelEnergia)?.nombre?.toLowerCase()}` : ""}
          </span>
          {mascota.temperamento?.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
              {mascota.temperamento.map((t) => (
                <span key={t} style={{ fontSize: 10.5, padding: "2px 8px", borderRadius: 20, background: "#fff", color: "#8A7E5C" }}>
                  {TAGS_TEMPERAMENTO.find((x) => x.id === t)?.nombre || t}
                </span>
              ))}
            </div>
          )}
          {misIncompatibles.length > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: 11.5, color: RUST }}>
              ⚠️ No se lleva bien con: {[...idsIncompatibles].map((id) => todasLasMascotas.find((m) => m._dbId === id)?.nombre || "?").join(", ")}
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {mascota._dbId && (
            <button onClick={() => setVerIncompatibles((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12 }}>
              {verIncompatibles ? "Cerrar" : "Incompatibilidades"}
            </button>
          )}
          <button onClick={onEditar} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Editar</button>
          <BotonEliminar onConfirm={onEliminar} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
        </div>
      </div>
      {verIncompatibles && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #E4DBC3" }}>
          {otrasMascotas.length === 0 ? (
            <p style={{ ...hint, margin: 0 }}>No hay otros perros cargados todavía.</p>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {otrasMascotas.map((m) => (
                <button key={m._dbId} onClick={() => toggleIncompatible(m._dbId)}
                  style={{ padding: "5px 11px", borderRadius: 20, fontSize: 11.5, cursor: "pointer",
                    border: idsIncompatibles.has(m._dbId) ? `1.5px solid ${RUST}` : "1px solid #DCD2B4",
                    background: idsIncompatibles.has(m._dbId) ? RUST : "#FFFFFF",
                    color: idsIncompatibles.has(m._dbId) ? "#FFFFFF" : INK }}>
                  {m.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Perfil de cliente ----------
function PerfilCliente({ cliente, boletasCliente, boletasAdiestramientoCliente, correosCliente = [], citasCliente = [], usuarios = [], citasAgenda = [], setCitas, setClientes, setBoletasEmitidas, setBoletasAdiestramiento, onVolver, onEditar, onEliminar, puedeEliminar, nombreUsuario, mascotas = [], setMascotas, mascotaIncompatibilidades = [], setMascotaIncompatibilidades }) {
  const plan = PLANES.find((p) => p.id === cliente.planHabitual);
  const historialVentas = [
    ...boletasCliente.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramientoCliente.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  const totalHistorico = calcularTotales(historialVentas.filter(esVenta)).ingresos;
  const puedeAgendar = cliente.tipoServicio?.includes("clases") || cliente.tipoServicio?.includes("evaluacion");
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);
  const [mostrarFormMascota, setMostrarFormMascota] = useState(false);
  const [editandoMascotaId, setEditandoMascotaId] = useState(null);
  const mascotasDelCliente = mascotas.filter((m) => m.clienteId === cliente._dbId);

  const adiestradoresDisponibles = usuarios.filter((u) => u.rol === "entrenador");
  const [mostrarAgendar, setMostrarAgendar] = useState(false);
  const [agendarAdiestrador, setAgendarAdiestrador] = useState(cliente.adiestradorNombre || adiestradoresDisponibles[0]?.nombre || "");
  const [agendarTipo, setAgendarTipo] = useState(cliente.tipoServicio?.includes("evaluacion") ? "evaluacion" : "clase");
  const [agendarFechaHora, setAgendarFechaHora] = useState("");

  function agregarAlCalendario() {
    if (!agendarFechaHora || !agendarAdiestrador) return;
    if (new Date(agendarFechaHora).getTime() <= Date.now()) {
      showToast("La fecha y hora deben ser en el futuro.");
      return;
    }
    if (hayChoqueHorario(citasAgenda, agendarAdiestrador, agendarFechaHora)) {
      showToast(`${agendarAdiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => [...prev, {
      id: Date.now(), clienteId: cliente._dbId, clienteNombre: cliente.nombre, perro: cliente.perro,
      email: cliente.email, telefono: cliente.telefono, direccion: cliente.direccion,
      tipo: agendarTipo, adiestrador: agendarAdiestrador, fechaISO: new Date(agendarFechaHora).toISOString(),
      estado: "agendada", origen: "staff", notas: "",
    }]);
    setAgendarFechaHora("");
    setMostrarAgendar(false);
    showToast(`Agregado al calendario de ${agendarAdiestrador}.`);
  }

  function copiarLinkAgenda() {
    const link = `${window.location.origin}/agendaadiestrador?c=${cliente._dbId}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    });
  }

  function guardarMascota(datos) {
    if (editandoMascotaId) {
      setMascotas((prev) => prev.map((m) => (m.id === editandoMascotaId ? { ...datos, id: editandoMascotaId, _dbId: m._dbId, clienteId: cliente._dbId } : m)));
    } else {
      setMascotas((prev) => [...prev, { ...datos, id: Date.now(), clienteId: cliente._dbId }]);
    }
    setMostrarFormMascota(false);
    setEditandoMascotaId(null);
  }

  function eliminarMascota(m) {
    setMascotas((prev) => prev.filter((x) => x.id !== m.id));
    if (m._dbId) {
      setMascotaIncompatibilidades((prev) => prev.filter((i) => i.mascotaId1 !== m._dbId && i.mascotaId2 !== m._dbId));
    }
  }

  function agregarNotaCliente(texto) {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, bitacora: [...(c.bitacora || []), { creadoEn: new Date().toISOString(), texto }] } : c)));
  }

  return (
    <div>
      <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18, flex: "none" }}>← Volver a clientes</button>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 14 }}>
          <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: "#8A7E5C", fontSize: 12, flex: "none", border: `3px solid ${CREAM_SOFT}` }}>
              {!cliente.fotoUrl && "Sin foto"}
            </div>
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 2 }}>{cliente.perro}
                {(() => { const e = ESTADOS_CLIENTE.find((x) => x.id === (cliente.estadoCliente || "activo")); return (
                  <span style={{ marginLeft: 10, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: e.bg, color: e.color, verticalAlign: "middle" }}>{e.nombre}</span>
                ); })()}
                {cliente.tipoServicio?.includes("evaluacion") && (
                  <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: "#D6E6EE", color: "#1E5A7A", verticalAlign: "middle" }}>Evaluación</span>
                )}
              </h2>
              <p style={{ margin: "0 0 4px", color: "#8A7E5C", fontSize: 14 }}>Dueño/a: {cliente.nombre}</p>
              <p style={{ margin: 0, color: "#8A7E5C", fontSize: 14 }}>{cliente.telefono || "sin teléfono"} {cliente.email ? `· ${cliente.email}` : "· sin correo (no puede entrar a su portal)"}</p>
              <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>{cliente.raza || "Raza no especificada"} {cliente.pesoKg ? `· ${cliente.pesoKg} kg` : ""}</p>
              <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>📍 {cliente.direccion || "Sin dirección registrada"}</p>
              {cliente.fechaInicio && <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 14 }}>Cliente desde: {new Date(cliente.fechaInicio + "T00:00:00").toLocaleDateString("es-CL")}</p>}
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {(cliente.tipoServicio || []).map((t) => (
                  <span key={t} style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>
                    {TIPOS_SERVICIO.find((x) => x.id === t)?.nombre || t}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "none", maxWidth: "100%", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {puedeAgendar && cliente._dbId && (
              <button onClick={copiarLinkAgenda} style={botonSecundario}>{linkCopiado ? "¡Copiado!" : "Copiar link de agenda"}</button>
            )}
            {adiestradoresDisponibles.length > 0 && cliente._dbId && (
              <button onClick={() => setMostrarAgendar((v) => !v)} style={botonSecundario}>
                {mostrarAgendar ? "Cancelar" : "+ Agregar al calendario del adiestrador"}
              </button>
            )}
            <button onClick={onEditar} style={botonSecundario}>Editar</button>
            {puedeEliminar && (
              <button onClick={() => setConfirmandoEliminar(true)} style={{ ...botonSecundario, borderColor: RUST, color: RUST }}>Eliminar</button>
            )}
          </div>
        </div>

        {mostrarAgendar && (
          <div style={{ marginTop: 18, padding: 14, background: CREAM_SOFT, borderRadius: 8, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={label} htmlFor="agendar-adiestrador">Adiestrador</label>
              <select id="agendar-adiestrador" value={agendarAdiestrador} onChange={(e) => setAgendarAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {adiestradoresDisponibles.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="agendar-tipo">Tipo</label>
              <select id="agendar-tipo" value={agendarTipo} onChange={(e) => setAgendarTipo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {TIPOS_CITA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>
            </div>
            <div>
              <label style={label} htmlFor="agendar-fecha">Fecha y hora</label>
              <input id="agendar-fecha" type="datetime-local" value={agendarFechaHora} onChange={(e) => setAgendarFechaHora(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <button onClick={agregarAlCalendario} disabled={!agendarFechaHora} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: agendarFechaHora ? 1 : 0.6 }}>
                Agregar al calendario
              </button>
            </div>
          </div>
        )}

        {confirmandoEliminar && (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${cliente.nombre}?`}
            mensaje={`Se borra la ficha de ${cliente.nombre} y de su perro ${cliente.perro} — boletas, historial y datos de contacto quedan asociados a un cliente que ya no vas a poder ver ni editar.`}
            textoConfirmar="Eliminar cliente"
            onConfirmar={() => { onEliminar(); setConfirmandoEliminar(false); }}
            onCancelar={() => setConfirmandoEliminar(false)}
          />
        )}

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginTop: 26 }}>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16 }}>
            <p style={{ ...label, marginBottom: 8 }}>Plan habitual</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{plan?.nombre || "No definido"}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16 }}>
            <p style={{ ...label, marginBottom: 8 }}>Valor de paseo referencial</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{fmtCLP(cliente.valorPaseoRef)}</p>
          </div>
          <div style={{ background: NAVY, borderRadius: 8, padding: 16 }}>
            <p style={{ margin: "0 0 8px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Total facturado histórico</p>
            <p style={{ margin: 0, color: CREAM, fontWeight: 700, fontSize: 15 }}>{fmtCLP(totalHistorico)}</p>
          </div>
        </div>

        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14 }}>
          <p style={{ ...label, marginBottom: 8 }}>Paseador asignado</p>
          <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>
            {cliente.paseadorNombre || "Sin asignar"} {cliente.tarifaPaseador ? `· se le paga ${fmtCLP(cliente.tarifaPaseador)} por paseo` : ""}
          </p>
        </div>

        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14 }}>
          <p style={{ ...label, marginBottom: 8 }}>Responsable de la cuenta</p>
          <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{cliente.responsableNombre || "Sin asignar"}</p>
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={{ ...label, margin: 0 }}>Mascotas {mascotasDelCliente.length > 1 ? `(${mascotasDelCliente.length})` : ""}</p>
            <button onClick={() => { setEditandoMascotaId(null); setMostrarFormMascota((v) => !v); }} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
              {mostrarFormMascota && !editandoMascotaId ? "Cancelar" : "+ Agregar mascota"}
            </button>
          </div>
          {mostrarFormMascota && (
            <FormularioMascota
              inicial={editandoMascotaId ? mascotasDelCliente.find((m) => m.id === editandoMascotaId) : null}
              onGuardar={guardarMascota}
              onCancelar={() => { setMostrarFormMascota(false); setEditandoMascotaId(null); }}
            />
          )}
          {mascotasDelCliente.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Sin perfil de mascota todavía — usa "+ Agregar mascota" para cargar raza, energía y temperamento.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {mascotasDelCliente.map((m) => (
                <FilaMascota key={m.id} mascota={m} todasLasMascotas={mascotas} incompatibilidades={mascotaIncompatibilidades}
                  setMascotaIncompatibilidades={setMascotaIncompatibilidades}
                  onEditar={() => { setEditandoMascotaId(m.id); setMostrarFormMascota(true); }}
                  onEliminar={() => eliminarMascota(m)} />
              ))}
            </div>
          )}
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={label}>Días de paseo habituales{cliente.horaHabitual ? ` · ${cliente.horaHabitual}` : ""}</p>
          <div style={{ display: "flex", gap: 6 }}>
            {DIAS_SEMANA.map((d, dow) => (
              <span key={dow} style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                background: cliente.diasHabituales?.includes(dow) ? NAVY : "#EDE4CE", color: cliente.diasHabituales?.includes(dow) ? CREAM : "#B0A587" }}>
                {d}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <p style={label}>Objetivos a cumplir</p>
          <p style={{ margin: 0, color: INK, fontSize: 14, lineHeight: 1.6 }}>{cliente.objetivos || "Sin objetivos registrados."}</p>
        </div>

        <div style={{ marginTop: 26 }}>
          <p style={label}>Historial</p>
          <p style={{ ...hint, marginTop: 2, marginBottom: 10 }}>Notas, correos y citas de este cliente, todo junto y por fecha.</p>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16 }}>
            <HistorialUnificado notas={cliente.bitacora || []} onAgregarNota={agregarNotaCliente}
              correos={correosCliente} citas={citasCliente} boletas={historialVentas}
              placeholderNota="Ej. llamó para reagendar, quedamos el jueves..." />
          </div>
        </div>

        <div style={{ marginTop: 26 }}>
          <p style={label}>Historial de ventas</p>
          {historialVentas.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todavía no se le ha generado ninguna boleta.</p>
          ) : (
            <div>
              {historialVentas.map((b) => (
                <FilaBoletaVenta key={`${b._tipo}-${b.numero}`} boleta={b} tipo={b._tipo}
                  setBoletasEmitidas={setBoletasEmitidas} setBoletasAdiestramiento={setBoletasAdiestramiento} nombreUsuario={nombreUsuario} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Clientes (base de datos madre) ----------

// Filtros/orden de la lista (no la búsqueda de texto, que es más
// puntual) sobreviven a un refresh — se guardan en localStorage apenas
// cambian, mismo criterio que howria_pago_ajustes.
function cargarFiltrosClientesGuardados() {
  try { return JSON.parse(localStorage.getItem("howria_filtros_clientes") || "{}"); } catch { return {}; }
}

export function Clientes({ clientes, setClientes, boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, usuarios, puedeEliminar, cargandoClientes, correos = [], citasAgenda = [], setCitas, saltarClienteDbId, limpiarSaltoCliente, nombreUsuario, mascotas, setMascotas, mascotaIncompatibilidades, setMascotaIncompatibilidades }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [perfilId, setPerfilId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const filtrosGuardados = cargarFiltrosClientesGuardados();
  const [filtroPaseador, setFiltroPaseador] = useState(filtrosGuardados.filtroPaseador || "todos");
  const [filtroEstado, setFiltroEstado] = useState(filtrosGuardados.filtroEstado || "todos");
  const [soloEvaluacion, setSoloEvaluacion] = useState(filtrosGuardados.soloEvaluacion || false);
  const [orden, setOrden] = useState(filtrosGuardados.orden || "nombre-asc");

  useEffect(() => {
    try { localStorage.setItem("howria_filtros_clientes", JSON.stringify({ filtroPaseador, filtroEstado, soloEvaluacion, orden })); } catch {}
  }, [filtroPaseador, filtroEstado, soloEvaluacion, orden]);

  useEffect(() => {
    if (!saltarClienteDbId) return;
    const c = clientes.find((x) => x._dbId === saltarClienteDbId);
    if (c) setPerfilId(c.id);
    limpiarSaltoCliente();
  }, [saltarClienteDbId, clientes]);

  function guardar(datos) {
    const limpio = { ...datos, valorPaseoRef: Number(datos.valorPaseoRef) || 0, pesoKg: Number(datos.pesoKg) || 0, tarifaPaseador: Number(datos.tarifaPaseador) || 0 };
    if (editandoId) {
      setClientes((prev) => prev.map((c) => (c.id === editandoId ? { ...limpio, id: editandoId } : c)));
    } else {
      setClientes((prev) => [...prev, { ...limpio, id: Date.now() }]);
    }
    setMostrarForm(false);
    setEditandoId(null);
  }

  const clientePerfil = clientes.find((c) => c.id === perfilId);
  if (clientePerfil) {
    return (
      <PerfilCliente
        cliente={clientePerfil}
        boletasCliente={boletasEmitidas.filter((b) => esBoletaDeCliente(b, clientePerfil))}
        boletasAdiestramientoCliente={boletasAdiestramiento.filter((b) => esBoletaDeCliente(b, clientePerfil))}
        correosCliente={correos.filter((c) => c.clienteId === clientePerfil._dbId)}
        citasCliente={citasAgenda.filter((c) => c.clienteId === clientePerfil._dbId)}
        usuarios={usuarios}
        citasAgenda={citasAgenda}
        setCitas={setCitas}
        setClientes={setClientes}
        setBoletasEmitidas={setBoletasEmitidas}
        setBoletasAdiestramiento={setBoletasAdiestramiento}
        onVolver={() => setPerfilId(null)}
        onEditar={() => { setEditandoId(clientePerfil.id); setPerfilId(null); setMostrarForm(true); }}
        onEliminar={() => { setClientes((prev) => prev.filter((x) => x.id !== clientePerfil.id)); setPerfilId(null); }}
        puedeEliminar={puedeEliminar}
        nombreUsuario={nombreUsuario}
        mascotas={mascotas}
        setMascotas={setMascotas}
        mascotaIncompatibilidades={mascotaIncompatibilidades}
        setMascotaIncompatibilidades={setMascotaIncompatibilidades}
      />
    );
  }

  const paseadoresDisponibles = [...new Set(clientes.map((c) => c.paseadorNombre).filter(Boolean))].sort();

  const filtrados = clientes
    .filter((c) => {
      const q = busqueda.trim().toLowerCase();
      if (q && !(c.nombre.toLowerCase().includes(q) || c.perro.toLowerCase().includes(q))) return false;
      if (filtroPaseador !== "todos" && c.paseadorNombre !== filtroPaseador) return false;
      if (filtroEstado !== "todos" && (c.estadoCliente || "activo") !== filtroEstado) return false;
      if (soloEvaluacion && !c.tipoServicio?.includes("evaluacion")) return false;
      return true;
    })
    .sort((a, b) => {
      switch (orden) {
        case "nombre-desc": return b.nombre.localeCompare(a.nombre, "es");
        case "perro-asc": return a.perro.localeCompare(b.perro, "es");
        case "perro-desc": return b.perro.localeCompare(a.perro, "es");
        case "paseador-asc": return (a.paseadorNombre || "").localeCompare(b.paseadorNombre || "", "es");
        case "valor-desc": return (b.valorPaseoRef || 0) - (a.valorPaseoRef || 0);
        case "valor-asc": return (a.valorPaseoRef || 0) - (b.valorPaseoRef || 0);
        case "recientes": return new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0);
        default: return a.nombre.localeCompare(b.nombre, "es");
      }
    });

  return (
    <div className="howria-card" style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Clientes registrados</h2>
          <p style={hint}>Ficha completa por cliente — es la base madre que alimenta boletas, finanzas y perfiles. {clientes.length} en total.</p>
        </div>
        <button onClick={() => { setEditandoId(null); setMostrarForm((v) => !v); }} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>
          {mostrarForm ? "Cancelar" : "+ Nuevo cliente"}
        </button>
      </div>

      {mostrarForm && (
        <FormularioCliente
          inicial={editandoId ? clientes.find((c) => c.id === editandoId) : null}
          paseadores={usuarios}
          entrenadores={usuarios.filter((u) => u.rol === "entrenador")}
          responsables={usuarios}
          onGuardar={guardar}
          onCancelar={() => { setMostrarForm(false); setEditandoId(null); }}
        />
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        <button onClick={() => setSoloEvaluacion(false)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
          border: !soloEvaluacion ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
          background: !soloEvaluacion ? NAVY : "#FFFFFF", color: !soloEvaluacion ? CREAM : INK, fontWeight: !soloEvaluacion ? 600 : 400 }}>
          Todos ({clientes.length})
        </button>
        <button onClick={() => setSoloEvaluacion(true)} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
          border: soloEvaluacion ? "1.5px solid #1E5A7A" : "1px solid #DCD2B4",
          background: soloEvaluacion ? "#D6E6EE" : "#FFFFFF", color: "#1E5A7A", fontWeight: soloEvaluacion ? 600 : 400 }}>
          Evaluación ({clientes.filter((c) => c.tipoServicio?.includes("evaluacion")).length})
        </button>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, marginBottom: 4 }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input placeholder="Buscar por cliente o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }} />
        </div>
        <select value={filtroPaseador} onChange={(e) => setFiltroPaseador(e.target.value)} style={{ ...input, margin: 0, width: "auto", flex: "1 1 170px" }}>
          <option value="todos">Todos los paseadores</option>
          {paseadoresDisponibles.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} style={{ ...input, margin: 0, width: "auto", flex: "1 1 150px" }}>
          <option value="todos">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="pausado">Pausado</option>
          <option value="baja">Baja</option>
        </select>
        <div style={{ position: "relative", flex: "1 1 190px" }}>
          <ArrowUpDown size={14} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <select value={orden} onChange={(e) => setOrden(e.target.value)} style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }}>
            <option value="nombre-asc">Nombre (A-Z)</option>
            <option value="nombre-desc">Nombre (Z-A)</option>
            <option value="perro-asc">Perro (A-Z)</option>
            <option value="perro-desc">Perro (Z-A)</option>
            <option value="paseador-asc">Paseador (A-Z)</option>
            <option value="valor-desc">Valor paseo (mayor a menor)</option>
            <option value="valor-asc">Valor paseo (menor a mayor)</option>
            <option value="recientes">Más recientes primero</option>
          </select>
        </div>
      </div>
      <p style={{ fontSize: 12.5, color: "#8A7E5C", margin: "6px 0 0" }}>{filtrados.length} de {clientes.length} cliente(s)</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginTop: 14 }}>
        {cargandoClientes ? (
          <p style={{ ...hint, gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando clientes…</p>
        ) : (
          <>
            {filtrados.map((c) => {
              const estado = ESTADOS_CLIENTE.find((e) => e.id === (c.estadoCliente || "activo"));
              return (
                <button key={c.id} onClick={() => setPerfilId(c.id)} className="howria-card" style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 14, padding: 16, cursor: "pointer", font: "inherit", position: "relative" }}>
                  <div style={{ position: "absolute", top: 14, right: 14, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: estado.bg, color: estado.color }}>{estado.nombre}</span>
                    {c.tipoServicio?.includes("evaluacion") && (
                      <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: "#D6E6EE", color: "#1E5A7A" }}>Evaluación</span>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", paddingRight: 70 }}>
                    <div style={{ width: 46, height: 46, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none", border: "2px solid #EDE4CE" }} />
                    <div>
                      <div style={{ fontWeight: 600, color: NAVY }}>{c.nombre}</div>
                      <div style={{ fontSize: 13, color: "#8A7E5C" }}>🐾 {c.perro} · {c.raza || "raza s/i"}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#5C5442", marginTop: 10, lineHeight: 1.7 }}>
                    {c.telefono || "Sin teléfono"}<br />
                    Ref: {fmtCLP(c.valorPaseoRef)} / paseo<br />
                    Paseador: {c.paseadorNombre || "sin asignar"}
                    {c.tipoServicio?.includes("evaluacion") && <span style={{ color: "#8A6A1E", fontWeight: 600 }}> · eval. pendiente</span>}
                  </div>
                </button>
              );
            })}
            {filtrados.length === 0 && (
              <p style={{ ...hint, gridColumn: "1 / -1" }}>
                {clientes.length === 0 ? "No hay clientes registrados todavía." : `No se encontraron clientes con "${busqueda}".`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
function variacion(actual, anterior) {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

export function Finanzas({ boletasEmitidas: boletasEmitidasProp, boletasAdiestramiento: boletasAdiestramientoProp = [], clientes: clientesProp, pagosRegistrados: pagosRegistradosProp = [], registroPaseos = {}, user, onVerPagos }) {
  const [periodo, setPeriodo] = useState("semana");
  const hoy = new Date();

  // Un paseador o entrenador no debe ver las finanzas generales de
  // Howria — solo lo que tiene que ver con los clientes que se le
  // asignaron. Se filtran los datos de entrada acá para que el resto
  // del cálculo (que ya trabaja sobre clientes/boletasEmitidas/etc.)
  // quede automáticamente acotado, sin duplicar lógica.
  const esPaseador = user?.rol === "paseador";
  const esEntrenador = user?.rol === "entrenador";
  // La cuenta administrador (Howria) es la cuenta general de la empresa
  // — nunca debe quedar acotada, ni siquiera si figura como responsable
  // de algún cliente (ver más abajo). Debe ver siempre el negocio
  // completo, sin excepción.
  const esAdmin = user?.rol === "administrador";
  // "Responsable de la cuenta" es un rol de negocio (dueño del caso,
  // ej. Javier Arniaz) que no está atado a un rol fijo de la app —
  // Arniaz, por ejemplo, es "entrenador" en el sistema pero también es
  // responsable de varios clientes. Si esta persona figura
  // como responsable de al menos un cliente, su Finanzas personal se
  // acota a esos clientes (viendo paseo Y adiestramiento juntos, es
  // dueño del caso completo) — esto manda por encima de cualquier
  // acotamiento más angosto que ya tuviera por su rol de app.
  const misClientesComoResponsable = esAdmin ? [] : clientesProp.filter((c) => c.responsableNombre === user?.nombre);
  const esResponsable = misClientesComoResponsable.length > 0;
  const vistaPersonal = esResponsable || esPaseador || esEntrenador;
  const clientes = esResponsable
    ? misClientesComoResponsable
    : esPaseador
    ? clientesProp.filter((c) => c.paseadorNombre === user.nombre)
    : esEntrenador
    ? clientesProp.filter((c) => c.adiestradorNombre === user.nombre)
    : clientesProp;
  const boletasEmitidas = esResponsable
    ? boletasEmitidasProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : esEntrenador
    ? []
    : esPaseador
    ? boletasEmitidasProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : boletasEmitidasProp;
  const boletasAdiestramiento = esResponsable
    ? boletasAdiestramientoProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : esPaseador
    ? []
    : esEntrenador
    ? boletasAdiestramientoProp.filter((b) => clientes.some((c) => esBoletaDeCliente(b, c)))
    : boletasAdiestramientoProp;
  const pagosRegistrados = vistaPersonal ? [] : pagosRegistradosProp;

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento", cantidad: 0, descuento: (b.descuentoPackMonto || 0) })),
  ], [boletasEmitidas, boletasAdiestramiento]);
  // Solo lo aceptado/pagado cuenta como venta real — un borrador sin
  // revisar o una boleta cancelada no deben sumar en ningún ingreso.
  const todasLasBoletasVenta = useMemo(() => todasLasBoletas.filter(esVenta), [todasLasBoletas]);

  const { actualDesde, anteriorDesde, anteriorHasta } = useMemo(() => {
    if (periodo === "semana") {
      const inicioActual = inicioSemana(hoy);
      const inicioAnterior = new Date(inicioActual); inicioAnterior.setDate(inicioAnterior.getDate() - 7);
      return { actualDesde: inicioActual, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
    }
    if (periodo === "mes") {
      const inicioActual = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
      const inicioAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      return { actualDesde: inicioActual, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
    }
    const inicioActual = new Date(hoy.getFullYear(), 0, 1);
    const inicioAnterior = new Date(hoy.getFullYear() - 1, 0, 1);
    return { actualDesde: inicioActual, anteriorDesde: inicioAnterior, anteriorHasta: inicioActual };
  }, [periodo]);

  const filtradas = useMemo(() => todasLasBoletasVenta.filter((b) => new Date(b.fechaISO) >= actualDesde), [todasLasBoletasVenta, actualDesde]);
  const anteriores = useMemo(() => todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f >= anteriorDesde && f < anteriorHasta; }), [todasLasBoletasVenta, anteriorDesde, anteriorHasta]);

  const actual = calcularTotales(filtradas);
  const anterior = calcularTotales(anteriores);
  const costosPeriodo = useMemo(() =>
    pagosRegistrados
      .filter((p) => p.fechaPagoISO && new Date(p.fechaPagoISO) >= actualDesde)
      .reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosRegistrados, actualDesde]);
  // Plata pagada a responsables de cuenta en boletas de adiestramiento —
  // costo real para Howria, igual que el pago a paseadores, así que
  // también se resta de la utilidad general.
  const costoResponsablesAdiestramiento = useMemo(() =>
    filtradas.filter((b) => b._tipo === "adiestramiento").reduce((acc, b) => acc + montoParaResponsable(b), 0),
    [filtradas]);
  // "Tu parte" — lo que efectivamente le corresponde al responsable
  // después del reparto con Howria en adiestramiento (los paseos no
  // tienen reparto, van completos). Solo tiene sentido en la vista
  // personal de un responsable de cuenta.
  const tuParte = useMemo(() => filtradas.reduce((acc, b) => acc + montoParaResponsable(b), 0), [filtradas]);
  const utilidad = actual.ingresos - costosPeriodo - costoResponsablesAdiestramiento;
  const promedioBoleta = actual.cantidad ? actual.ingresos / actual.cantidad : 0;
  const varIngresos = variacion(actual.ingresos, anterior.ingresos);

  const porCliente = useMemo(() => {
    const mapa = {};
    filtradas.forEach((b) => { mapa[b.cliente] = (mapa[b.cliente] || 0) + b.total; });
    return Object.entries(mapa).map(([nombre, total]) => ({ nombre, total })).sort((a, b) => b.total - a.total);
  }, [filtradas]);

  const dataGrafico = useMemo(() => {
    if (periodo === "año") {
      return MESES.map((m, i) => ({
        etiqueta: m.slice(0, 3),
        total: todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === i && f.getFullYear() === hoy.getFullYear(); }).reduce((acc, b) => acc + b.total, 0),
      }));
    }
    const mapa = {};
    filtradas.forEach((b) => {
      const f = new Date(b.fechaISO);
      const clave = f.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
      mapa[clave] = (mapa[clave] || 0) + b.total;
    });
    return Object.entries(mapa).map(([etiqueta, total]) => ({ etiqueta, total }));
  }, [filtradas, periodo, todasLasBoletasVenta]);

  const clientesSinBoletaEsteMes = useMemo(() => {
    return clientes.filter((c) => !todasLasBoletas.some((b) => {
      const f = new Date(b.fechaISO);
      return esBoletaDeCliente(b, c) && f.getMonth() === hoy.getMonth() && f.getFullYear() === hoy.getFullYear();
    }));
  }, [clientes, todasLasBoletas]);

  const porTipoServicio = useMemo(() => {
    return TIPOS_SERVICIO.map((t) => {
      const monto = filtradas.filter((b) => clientes.find((c) => c.nombre === b.cliente)?.tipoServicio?.includes(t.id)).reduce((acc, b) => acc + b.total, 0);
      return { tipo: t.nombre, monto };
    });
  }, [filtradas, clientes]);

  const mesActualIdx = hoy.getMonth(), anioActualN = hoy.getFullYear();
  const proyeccionMes = useMemo(() => {
    return clientes.filter((c) => (c.estadoCliente || "activo") === "activo")
      .reduce((acc, c) => acc + diasSegunPlan(mesActualIdx, anioActualN, c.diasHabituales || []).length * Number(c.valorPaseoRef || 0), 0);
  }, [clientes, mesActualIdx, anioActualN]);
  const facturadoEsteMes = todasLasBoletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === mesActualIdx && f.getFullYear() === anioActualN; }).reduce((acc, b) => acc + b.total, 0);
  const porcentajeFacturado = proyeccionMes ? Math.round((facturadoEsteMes / proyeccionMes) * 100) : 0;

  const etiquetaPeriodo = { semana: "esta semana", mes: "este mes", año: "este año" }[periodo];
  const etiquetaAnterior = { semana: "semana anterior", mes: "mes anterior", año: "año anterior" }[periodo];

  function imprimirInforme() {
    window.print();
  }

  // Rama exclusiva para paseador: nada de facturación/ingresos de sus
  // clientes (eso es plata del cliente, no suya) — solo lo que se le va
  // a pagar A ÉL. Manda siempre para este rol, aunque también figure
  // como responsable de algún cliente (ese concepto queda para
  // entrenador/coordinador/administrador). Mismo criterio que "Tu pago"
  // en Mis Paseos (resumenMensual, HowriaAdmin.jsx) — realizados menos
  // cancelados × tarifaPaseador — pero generalizado al selector de
  // período semana/mes/año en vez de quedar fijo al mes en curso.
  if (esPaseador) {
    const misClientesPaseador = clientesProp.filter((c) => c.paseadorNombre === user.nombre);
    const hoyLocal = new Date();
    hoyLocal.setHours(0, 0, 0, 0);

    function diasEnRango(desde, hasta, diasSemana) {
      const claves = [];
      const cursor = new Date(desde);
      cursor.setHours(0, 0, 0, 0);
      const fin = new Date(hasta);
      fin.setHours(0, 0, 0, 0);
      while (cursor <= fin) {
        const dow = (cursor.getDay() + 6) % 7;
        if (diasSemana.includes(dow)) claves.push(fechaKey(cursor));
        cursor.setDate(cursor.getDate() + 1);
      }
      return claves;
    }

    const resumenPaseador = misClientesPaseador.map((c) => {
      const claves = diasEnRango(actualDesde, hoyLocal, c.diasHabituales || []);
      const validas = claves.filter((k) => !registroPaseos[`${c.id}_${k}`]?.cancelado);
      const realizados = validas.filter((k) => registroPaseos[`${c.id}_${k}`]?.realizado).length;
      return { cliente: c, programados: validas.length, realizados, monto: realizados * Number(c.tarifaPaseador || 0) };
    });
    const totalRealizadosPaseador = resumenPaseador.reduce((acc, r) => acc + r.realizados, 0);
    const totalProgramadosPaseador = resumenPaseador.reduce((acc, r) => acc + r.programados, 0);
    const totalMontoPaseador = resumenPaseador.reduce((acc, r) => acc + r.monto, 0);

    return (
      <div className="howria-card" style={tarjeta} id="reporte-finanzas">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #reporte-finanzas, #reporte-finanzas * { visibility: visible; }
            #reporte-finanzas { position: absolute; top: 0; left: 0; width: 100%; border: none; }
            #reporte-finanzas .no-imprimir { display: none; }
          }
        `}</style>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Tu pago</h2>
            <p style={hint}>Solo tus paseos y lo que se te paga por ellos — no lo que se les factura a los clientes.</p>
          </div>
          <button onClick={imprimirInforme} className="no-imprimir" style={{ ...botonSecundario, flex: "none" }}>Imprimir informe</button>
        </div>

        <div className="no-imprimir" style={{ display: "flex", gap: 8, margin: "16px 0 24px" }}>
          {[["semana", "Esta semana"], ["mes", "Este mes"], ["año", "Este año"]].map(([id, nombre]) => (
            <button key={id} onClick={() => setPeriodo(id)}
              style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
                fontWeight: periodo === id ? 600 : 400 }}>
              {nombre}
            </button>
          ))}
        </div>

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#9BAAB8", textTransform: "uppercase" }}>Paseos realizados</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "Georgia, serif" }}>{totalRealizadosPaseador} / {totalProgramadosPaseador}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Avance</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{totalProgramadosPaseador ? Math.round((totalRealizadosPaseador / totalProgramadosPaseador) * 100) : 0}%</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Monto a recibir {etiquetaPeriodo}</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(totalMontoPaseador)}</p>
          </div>
        </div>

        <p style={label}>Detalle por cliente</p>
        {resumenPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no tienes clientes asignados.</p>
        ) : (
          <div>
            {resumenPaseador.map((r) => (
              <div key={r.cliente.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                <span style={{ color: INK }}>{r.cliente.nombre} · {r.cliente.perro}</span>
                <span style={{ color: "#8A7E5C" }}>{r.realizados} / {r.programados} paseos</span>
                <b style={{ color: NAVY }}>{fmtCLP(r.monto)}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="howria-card" style={tarjeta} id="reporte-finanzas">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #reporte-finanzas, #reporte-finanzas * { visibility: visible; }
          #reporte-finanzas { position: absolute; top: 0; left: 0; width: 100%; border: none; }
          #reporte-finanzas .no-imprimir { display: none; }
        }
      `}</style>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={sectionTitle}>{vistaPersonal ? "Finanzas de tus clientes" : "Finanzas de Howria"}</h2>
          <p style={hint}>
            {vistaPersonal
              ? "Informes generados a partir de las boletas de los clientes que tienes asignados — se actualizan solos con cada boleta nueva."
              : "Informes generados a partir de las boletas emitidas — se actualizan solos con cada boleta nueva."}
          </p>
        </div>
        <button onClick={imprimirInforme} className="no-imprimir" style={{ ...botonSecundario, flex: "none" }}>Imprimir informe</button>
      </div>

      <div className="no-imprimir" style={{ display: "flex", gap: 8, margin: "16px 0 24px" }}>
        {[["semana", "Informe semanal"], ["mes", "Informe mensual"], ["año", "Informe anual"]].map(([id, nombre]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
              fontWeight: periodo === id ? 600 : 400 }}>
            {nombre}
          </button>
        ))}
      </div>

      <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: `repeat(${vistaPersonal ? (esResponsable ? 4 : 3) : 6}, 1fr)`, gap: 14, marginBottom: 26 }}>
        <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Ingresos {etiquetaPeriodo}</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(actual.ingresos)}</p>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: varIngresos >= 0 ? "#9FD8A8" : "#E3A08C" }}>
            {varIngresos >= 0 ? "▲" : "▼"} {Math.abs(varIngresos).toFixed(0)}% vs {etiquetaAnterior}
          </p>
        </div>
        {vistaPersonal && esResponsable && (
          <div style={{ background: "#E7F0EA", borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#2E5C41", textTransform: "uppercase", letterSpacing: 0.5 }}>Tu parte</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#2E5C41", fontFamily: "Georgia, serif" }}>{fmtCLP(tuParte)}</p>
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Pago a paseadores</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costosPeriodo)}</p>
            {onVerPagos && (
              <button onClick={onVerPagos} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 11.5, fontWeight: 600, padding: 0, marginTop: 8 }}>
                Ver en Pago trabajadores →
              </button>
            )}
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Pago a responsables (adiestramiento)</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costoResponsablesAdiestramiento)}</p>
          </div>
        )}
        {!vistaPersonal && (
          <div style={{ background: utilidad >= 0 ? "#E7F0EA" : "#F5E4E0", borderRadius: 10, padding: 18 }}>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: utilidad >= 0 ? "#2E5C41" : "#9C4B34", textTransform: "uppercase", letterSpacing: 0.5 }}>Ganancia de Howria</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: utilidad >= 0 ? "#2E5C41" : "#9C4B34", fontFamily: "Georgia, serif" }}>{fmtCLP(utilidad)}</p>
          </div>
        )}
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Boletas emitidas</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{actual.cantidad}</p>
        </div>
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Ticket promedio</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(promedioBoleta)}</p>
        </div>
      </div>
      {!vistaPersonal && (
        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: -18, marginBottom: 26 }}>
          Es lo que le queda a Howria después de los pagos a paseadores ya registrados como pagados en esta app, y de lo que le corresponde a cada responsable en las facturas de adiestramiento donde se definió el reparto — no incluye otros gastos del negocio.
        </p>
      )}
      {vistaPersonal && (
        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: -18, marginBottom: 26 }}>
          {esResponsable
            ? '"Ingresos" es lo facturado en este período a los clientes de los que eres responsable. "Tu parte" descuenta lo que le queda a Howria en las facturas de adiestramiento donde se definió un reparto — si no se definió, se cuenta completa como tuya.'
            : 'Esto es lo facturado a tus clientes en este período, no lo que se te paga a ti — para eso revisa "Tu pago" en Mis paseos.'}
        </p>
      )}

      <div className="howria-card" style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, marginBottom: 26 }}>
        <p style={{ ...label, marginBottom: 8 }}>Proyección del mes en curso (si se factura todo el plan habitual de cada cliente activo)</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(proyeccionMes)}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Ya facturado este mes: {fmtCLP(facturadoEsteMes)} ({porcentajeFacturado}%)</p>
        </div>
      </div>

      <p style={label}>Ingresos por tipo de servicio {etiquetaPeriodo} (un cliente puede contar en más de un tipo)</p>
      <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 26 }}>
        {porTipoServicio.map((t) => (
          <div key={t.tipo} style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>{t.tipo}</p>
            <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 17 }}>{fmtCLP(t.monto)}</p>
          </div>
        ))}
      </div>

      <p style={label}>Ingresos {periodo === "año" ? "por mes" : "por día"}</p>
      <div style={{ width: "100%", height: 220, marginBottom: 30 }}>
        <ResponsiveContainer>
          <BarChart data={dataGrafico}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDE4CE" />
            <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7E5C" }} />
            <YAxis tick={{ fontSize: 11, fill: "#8A7E5C" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v) => fmtCLP(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EDE4CE" }} />
            <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <p style={label}>Ingresos por cliente {etiquetaPeriodo}</p>
          {porCliente.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todavía no hay boletas generadas en este período.</p>
          ) : (
            <div>
              {porCliente.map((c, i) => (
                <FilaLista key={c.nombre} Icono={Dog} titulo={`${i === 0 ? "🏅 " : ""}${c.nombre}`} valor={fmtCLP(c.total)} valorColor={NAVY} />
              ))}
            </div>
          )}
        </div>

        <div>
          <p style={label}>Clientes sin boleta este mes</p>
          {clientesSinBoletaEsteMes.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todos los clientes tienen boleta generada este mes.</p>
          ) : (
            <div>
              {clientesSinBoletaEsteMes.map((c) => (
                <FilaLista key={c.id} Icono={Dog} titulo={c.nombre} subtitulo={c.perro} valor="Pendiente" valorColor={RUST} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Dibujo de boleta de adiestramiento (canvas) ----------
function dibujarBoletaAdiestramiento(canvas, emitida, logoImg, huellaImg) {
  const ctx = canvas.getContext("2d");
  const W = 560, H = 820;
  const M = 34;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  if (huellaImg) {
    ctx.save();
    ctx.globalAlpha = 0.1;
    const hW = 20, hH = 20 * (huellaImg.height / huellaImg.width);
    let i = 0;
    for (let wy = 160; wy < H - 40; wy += 62) {
      const izquierda = i % 2 === 0;
      const cx = izquierda ? 16 : W - 16;
      ctx.save();
      ctx.translate(cx, wy);
      ctx.rotate(izquierda ? -0.3 : 0.3);
      ctx.drawImage(huellaImg, -hW / 2, -hH / 2, hW, hH);
      ctx.restore();
      i++;
    }
    ctx.restore();
  }

  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(0, 0, W, 130);
  if (logoImg) {
    const logoH = 92, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, M, 14, logoW, logoH);
  }
  ctx.fillStyle = CREAM;
  ctx.textAlign = "right";
  ctx.font = "600 19px 'Fraunces', Georgia";
  ctx.fillText(`Boleta N°${String(emitida.numero).padStart(3, "0")}`, W - M, 55);
  ctx.font = "12.5px 'Inter', Helvetica";
  ctx.fillText(`Emitida el ${emitida.fecha}`, W - M, 76);

  let y = 168;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 19px 'Fraunces', Georgia";
  ctx.fillText(emitida.cliente, M, y);
  ctx.font = "500 13.5px 'Inter', Helvetica";
  ctx.fillStyle = "#8A7E5C";
  ctx.fillText(`Clases adiestramiento para ${emitida.perro || "—"}`, M, y + 21);
  ctx.fillText(`Modalidad: ${emitida.modalidad === "grupal" ? "grupal" : "individual"}`, M, y + 41);

  let alturaExtraMensaje = 0;
  if (emitida.mensajePersonalizado) {
    ctx.font = "italic 500 13px 'Inter', Helvetica";
    ctx.fillStyle = GOLD;
    wrapTextInline(ctx, `“${emitida.mensajePersonalizado}”`, M, y + 63, W - M * 2);
    alturaExtraMensaje = 36;
  }

  y += 76 + alturaExtraMensaje;
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillRect(M, y, W - M * 2, 36);
  ctx.fillStyle = "#6B6248";
  ctx.font = "700 12px 'Inter', Helvetica";
  ctx.fillText("DETALLE", M + 12, y + 22);
  ctx.textAlign = "right";
  ctx.fillText("VALOR", W - M - 12, y + 22);
  ctx.textAlign = "left";

  y += 36;
  const { subtotalClases, montoDescuento } = calcularBoletaAdiestramiento({
    numClases: emitida.numClases, precioClase: emitida.precioClase,
    descuentoPackPct: emitida.descuentoPackPct, descuentoPackMonto: emitida.descuentoPackMonto,
    evaluacion: emitida.evaluacion, precioEvaluacion: emitida.precioEvaluacion, transporte: emitida.transporte,
  });
  const filas = [
    { texto: `${emitida.numClases} clase(s) de adiestramiento ${emitida.modalidad} (x ${fmtCLP(emitida.precioClase)})`, valor: fmtCLP(subtotalClases), color: INK },
  ];
  if (montoDescuento > 0) {
    const etiqueta = emitida.descuentoPackPct > 0 ? ` (-${emitida.descuentoPackPct}%)` : "";
    filas.push({ texto: `Descuento pack de ${emitida.numClases} clases${etiqueta}`, valor: `- ${fmtCLP(montoDescuento)}`, color: RUST });
  }
  if (emitida.evaluacion !== "ninguna" && emitida.precioEvaluacion > 0) {
    filas.push({ texto: `Evaluación ${emitida.evaluacion === "presencial" ? "presencial" : "online"}`, valor: fmtCLP(emitida.precioEvaluacion), color: INK });
  }
  if (emitida.transporte > 0) {
    filas.push({ texto: "Transporte", valor: fmtCLP(emitida.transporte), color: INK });
  }
  filas.forEach((fila, idx) => {
    const rowH = 36;
    const fy = y + rowH * idx + 23;
    ctx.strokeStyle = "#EFEAD9";
    ctx.beginPath(); ctx.moveTo(M, y + rowH * idx); ctx.lineTo(W - M, y + rowH * idx); ctx.stroke();
    ctx.fillStyle = INK;
    ctx.font = "500 13.5px 'Inter', Helvetica";
    wrapTextInline(ctx, fila.texto, M + 12, fy, W - M * 2 - 130);
    ctx.textAlign = "right";
    ctx.fillStyle = fila.color;
    ctx.font = "700 14px 'Inter', Helvetica";
    ctx.fillText(fila.valor, W - M - 12, fy);
    ctx.textAlign = "left";
  });
  y += 36 * filas.length + 30;

  const altoTotal = 64;
  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(M, y, W - M * 2, altoTotal);
  ctx.fillStyle = CREAM;
  ctx.font = "600 14px 'Inter', Helvetica";
  ctx.fillText("TOTAL A PAGAR", M + 16, y + altoTotal - 37);
  ctx.font = "700 27px 'Fraunces', Georgia";
  ctx.textAlign = "right";
  ctx.fillText(fmtCLP(emitida.total), W - M - 16, y + altoTotal - 22);
  ctx.textAlign = "left";
  y += altoTotal;

  ctx.fillStyle = "#B0A587";
  ctx.font = "11.5px 'Inter', Helvetica";
  ctx.textAlign = "center";
  ctx.fillText("Gracias por confiar en Howria", W / 2, Math.min(y + 34, H - 24));
  ctx.textAlign = "left";
}

// ---------- Generador de boletas: formulario de adiestramiento ----------
function FormularioBoletaAdiestramiento({ clientes, onRegistrarBoleta }) {
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [clienteManual, setClienteManual] = useState(false);
  const [nombreManual, setNombreManual] = useState("");
  const [perroManual, setPerroManual] = useState("");
  const [modalidad, setModalidad] = useState("individual");
  const [numClases, setNumClases] = useState(4);
  const [precioClase, setPrecioClase] = useState(15000);
  const [descuentoPackPct, setDescuentoPackPct] = useState(0);
  const [descuentoPackMonto, setDescuentoPackMonto] = useState(0);
  const [evaluacion, setEvaluacion] = useState("ninguna");
  const [precioEvaluacion, setPrecioEvaluacion] = useState(0);
  const [transporte, setTransporte] = useState(0);
  const [mensajePersonalizado, setMensajePersonalizado] = useState("");
  const [emitida, setEmitida] = useState(null);
  const [paraConfirmar, setParaConfirmar] = useState(null);
  const [generando, setGenerando] = useState(false);
  const generandoRef = useRef(false);
  const canvasRef = useRef(null);
  const logoImgRef = useRef(null);
  const huellaImgRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.src = LOGO_B64;
    img.onload = () => { logoImgRef.current = img; };
    const img2 = new Image();
    img2.src = HUELLA_B64;
    img2.onload = () => { huellaImgRef.current = img2; };
  }, []);

  const clientesAdiestramiento = clientes.filter((c) => c.tipoServicio?.includes("clases"));
  const cliente = clienteManual
    ? { nombre: nombreManual.trim(), perro: perroManual.trim(), telefono: "", _dbId: null }
    : clientesAdiestramiento.find((c) => c.id === Number(clienteId));

  const { subtotalClases, montoDescuentoPct, montoDescuento, montoEvaluacion, total } = calcularBoletaAdiestramiento({
    numClases, precioClase, descuentoPackPct, descuentoPackMonto, evaluacion, precioEvaluacion, transporte,
  });

  function elegirPack(n, descuentoPct, descuentoMonto = 0) {
    setNumClases(n);
    setDescuentoPackPct(descuentoPct);
    setDescuentoPackMonto(descuentoMonto);
    setEmitida(null);
  }

  function revisar() {
    if (!cliente || !cliente.nombre) return;
    // No se inserta todavía — se muestra la pantalla de confirmación con
    // una foto de lo calculado ahora. Recién al confirmar se crea la
    // boleta de verdad.
    setParaConfirmar({
      clienteId: cliente._dbId,
      cliente: cliente.nombre,
      perro: cliente.perro,
      modalidad,
      numClases: Number(numClases),
      precioClase: Number(precioClase),
      descuentoPackPct: Number(descuentoPackPct || 0),
      descuentoPackMonto: Number(descuentoPackMonto || 0),
      evaluacion,
      precioEvaluacion: montoEvaluacion,
      transporte: Number(transporte || 0),
      subtotalClases,
      montoDescuento,
      total,
      mensajePersonalizado: mensajePersonalizado.trim() || null,
      estado: "no_enviada",
    });
  }

  function cancelarConfirmacion() {
    setParaConfirmar(null);
  }

  async function confirmarEmision() {
    if (!paraConfirmar || generandoRef.current) return;
    generandoRef.current = true;
    setGenerando(true);
    // El número de boleta lo asigna la base de datos sola (columna
    // "numero" generada siempre por Supabase) — acá no se manda, para que
    // nunca puedan existir dos boletas con el mismo número.
    const { data, error } = await supabase.from("boletas_adiestramiento").insert(boletaAdiestramientoToDb(paraConfirmar)).select().single();
    generandoRef.current = false;
    setGenerando(false);
    if (error || !data) {
      showToast(`No se pudo generar la boleta: ${error?.message || "error desconocido"}`);
      return;
    }
    const nueva = { ...dbToBoletaAdiestramiento(data), id: Date.now(), _dbId: data.id };
    setEmitida(nueva);
    setParaConfirmar(null);
    onRegistrarBoleta?.(nueva);
  }

  useEffect(() => {
    if (emitida && canvasRef.current) {
      const dibujar = () => dibujarBoletaAdiestramiento(canvasRef.current, emitida, logoImgRef.current, huellaImgRef.current);
      if (document.fonts?.ready) {
        Promise.all([
          document.fonts.load("700 27px Fraunces"),
          document.fonts.load("700 19px Fraunces"),
          document.fonts.load("13px Inter"),
        ]).then(() => document.fonts.ready).then(dibujar).catch(dibujar);
      } else {
        dibujar();
      }
    }
  }, [emitida]);

  function generarPdfBlob() {
    const canvas = canvasRef.current;
    const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
    doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
    return doc.output("blob");
  }

  function descargarPNG() {
    if (!canvasRef.current) return;
    const link = document.createElement("a");
    link.download = `Boleta-Adiestramiento-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.png`;
    link.href = canvasRef.current.toDataURL("image/png");
    link.click();
  }

  function descargarPDF() {
    if (!canvasRef.current || !emitida) return;
    const blob = generarPdfBlob();
    const link = document.createElement("a");
    link.download = `Boleta-Adiestramiento-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.pdf`;
    link.href = URL.createObjectURL(blob);
    link.click();
  }

  async function enviarWhatsapp() {
    if (!emitida || !cliente) return;
    const mensaje = `Hola!! Buenas buenas, adjunto el detalle de las clases 🐾`;
    const nombreArchivo = `Boleta-Adiestramiento-${String(emitida.numero).padStart(3, "0")}-${emitida.cliente.replace(/\s+/g, "-")}.pdf`;
    if (canvasRef.current && navigator.canShare) {
      try {
        const blob = generarPdfBlob();
        const archivo = new File([blob], nombreArchivo, { type: "application/pdf" });
        if (navigator.canShare({ files: [archivo] })) {
          await navigator.share({ files: [archivo], text: mensaje });
          return;
        }
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
    descargarPDF();
    const numero = (cliente.telefono || "").replace(/\D/g, "");
    window.open(`https://wa.me/${numero}?text=${encodeURIComponent(mensaje + " (adjunta el PDF que se acaba de descargar)")}`, "_blank");
  }

  if (paraConfirmar) {
    const p = paraConfirmar;
    return (
      <div className="howria-card" style={{ ...tarjeta, maxWidth: 560, margin: "0 auto" }}>
        <h2 style={sectionTitle}>Confirmar antes de emitir</h2>
        <p style={hint}>Revisa que todo esté bien — al confirmar, la boleta queda registrada con su número definitivo y ya no se puede deshacer desde acá.</p>

        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14, fontSize: 14, color: INK, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Cliente</span><b>{p.cliente}{p.perro ? ` · 🐾 ${p.perro}` : ""}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Modalidad</span><b style={{ textTransform: "capitalize" }}>{p.modalidad}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Clases</span><b>{p.numClases} × {fmtCLP(p.precioClase)}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Subtotal clases</span><b>{fmtCLP(p.subtotalClases)}</b></div>
          {p.montoDescuento > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", color: RUST }}><span>Descuento pack{p.descuentoPackPct > 0 ? ` (-${p.descuentoPackPct}%)` : ""}</span><b>- {fmtCLP(p.montoDescuento)}</b></div>
          )}
          {p.evaluacion !== "ninguna" && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Evaluación {p.evaluacion}</span><b>{fmtCLP(p.precioEvaluacion)}</b></div>
          )}
          {p.transporte > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Transporte</span><b>{fmtCLP(p.transporte)}</b></div>
          )}
          {p.mensajePersonalizado && (
            <div style={{ marginTop: 4 }}><span style={{ color: "#8A7E5C" }}>Mensaje: </span><i>{p.mensajePersonalizado}</i></div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 17, fontWeight: 700, color: NAVY, marginTop: 6, paddingTop: 8, borderTop: "1px solid #DCD2B4" }}>
            <span>Total</span><span>{fmtCLP(p.total)}</span>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
          <button onClick={confirmarEmision} disabled={generando}
            style={{ ...botonPrincipal, marginTop: 0, opacity: generando ? 0.45 : 1 }}>
            {generando ? "Emitiendo..." : "Confirmar emisión"}
          </button>
          <button onClick={cancelarConfirmacion} disabled={generando} style={botonSecundario}>Volver a editar</button>
        </div>
      </div>
    );
  }

  return (
    <div className="howria-split" style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 28 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>1. Cliente</h2>
        <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 14 }}>
          <input type="checkbox" checked={clienteManual} onChange={(e) => { setClienteManual(e.target.checked); setEmitida(null); }} style={{ width: 16, height: 16 }} />
          <span style={{ fontSize: 13.5, color: NAVY }}>Cliente sin registrar — escribir nombre a mano</span>
        </label>

        {clienteManual ? (
          <>
            <label style={label} htmlFor="badiestramiento-nombre-manual">Nombre para la boleta</label>
            <input id="badiestramiento-nombre-manual" type="text" placeholder="Nombre del tutor" value={nombreManual} onChange={(e) => { setNombreManual(e.target.value); setEmitida(null); }} style={input} />
            <label style={label} htmlFor="badiestramiento-perro-manual">Nombre del perrito</label>
            <input id="badiestramiento-perro-manual" type="text" placeholder="Nombre del perro" value={perroManual} onChange={(e) => { setPerroManual(e.target.value); setEmitida(null); }} style={input} />
          </>
        ) : (
          <>
            <label style={label} htmlFor="badiestramiento-cliente">Cliente (con "Clases de adiestramiento" marcado en su ficha)</label>
            <select id="badiestramiento-cliente" value={clienteId} onChange={(e) => { setClienteId(e.target.value); setEmitida(null); }} style={input}>
              {clientesAdiestramiento.length === 0 && <option value="">No hay clientes marcados con "Clases"</option>}
              {clientesAdiestramiento.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>)}
            </select>
          </>
        )}

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>2. Clases</h2>
        <p style={label} id="badiestramiento-modalidad-label">Modalidad</p>
        <div role="group" aria-labelledby="badiestramiento-modalidad-label" style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["individual", "grupal"].map((m) => (
            <button key={m} type="button" onClick={() => { setModalidad(m); setEmitida(null); }} aria-pressed={modalidad === m}
              style={{
                padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer", textTransform: "capitalize",
                border: modalidad === m ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: modalidad === m ? NAVY : "#FFFFFF",
                color: modalidad === m ? CREAM : INK, fontWeight: modalidad === m ? 600 : 400,
              }}>
              {m}
            </button>
          ))}
        </div>

        <p style={label}>Pack (sugerencias) — o edita a mano abajo</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => elegirPack(4, 0, 20000)} style={botonSecundario}>Pack 4 clases — ahorra $20.000</button>
          <button type="button" onClick={() => elegirPack(8, 10)} style={botonSecundario}>8 clases — ahorra 10%</button>
          <button type="button" onClick={() => elegirPack(12, 15)} style={botonSecundario}>12 clases — ahorra 15%</button>
        </div>

        <label style={label} htmlFor="badiestramiento-num-clases">Número de clases</label>
        <input id="badiestramiento-num-clases" type="number" min="1" value={numClases} onChange={(e) => { setNumClases(e.target.value); setEmitida(null); }} style={input} />
        <label style={label} htmlFor="badiestramiento-precio-clase">Precio por clase</label>
        <input id="badiestramiento-precio-clase" type="number" min="0" value={precioClase} onChange={(e) => { setPrecioClase(e.target.value); setEmitida(null); }} style={input} />
        <label style={label} htmlFor="badiestramiento-descuento-pct">Descuento por pack (%)</label>
        <input id="badiestramiento-descuento-pct" type="number" min="0" max="100" value={descuentoPackPct} onChange={(e) => { setDescuentoPackPct(e.target.value); setEmitida(null); }} style={input} />
        <label style={label} htmlFor="badiestramiento-descuento-monto">Descuento por pack (monto fijo, opcional)</label>
        <input id="badiestramiento-descuento-monto" type="number" min="0" value={descuentoPackMonto} onChange={(e) => { setDescuentoPackMonto(e.target.value); setEmitida(null); }} style={input} />

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>3. Evaluación y transporte</h2>
        <p style={label} id="badiestramiento-evaluacion-label">Evaluación</p>
        <div role="group" aria-labelledby="badiestramiento-evaluacion-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {[{ id: "ninguna", label: "Sin evaluación" }, { id: "presencial", label: "Presencial" }, { id: "online", label: "Online" }].map((e) => (
            <button key={e.id} type="button" onClick={() => { setEvaluacion(e.id); setEmitida(null); }} aria-pressed={evaluacion === e.id}
              style={{
                padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: evaluacion === e.id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: evaluacion === e.id ? NAVY : "#FFFFFF",
                color: evaluacion === e.id ? CREAM : INK, fontWeight: evaluacion === e.id ? 600 : 400,
              }}>
              {e.label}
            </button>
          ))}
        </div>
        {evaluacion !== "ninguna" && (
          <>
            <label style={label} htmlFor="badiestramiento-precio-evaluacion">Precio de la evaluación</label>
            <input id="badiestramiento-precio-evaluacion" type="number" min="0" value={precioEvaluacion} onChange={(e) => { setPrecioEvaluacion(e.target.value); setEmitida(null); }} style={input} />
          </>
        )}
        <label style={label} htmlFor="badiestramiento-precio-transporte">Precio de transporte (opcional)</label>
        <input id="badiestramiento-precio-transporte" type="number" min="0" value={transporte} onChange={(e) => { setTransporte(e.target.value); setEmitida(null); }} style={input} />

        <div style={{ marginTop: 20, padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8 }}>
          <label style={{ ...label, marginBottom: 8, color: "#8A6A1E" }} htmlFor="badiestramiento-mensaje">💬 Mensaje personalizado para esta boleta</label>
          <input id="badiestramiento-mensaje" type="text" placeholder="ej. ¡Nos vemos en la próxima clase!" value={mensajePersonalizado} onChange={(e) => { setMensajePersonalizado(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
        </div>

        <div style={{ marginTop: 20, padding: "18px 20px", background: PANEL_BG, borderRadius: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK }}>
            <span>{numClases} clase(s) × {fmtCLP(precioClase)}</span>
            <span>{fmtCLP(subtotalClases)}</span>
          </div>
          {montoDescuento > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: RUST, marginTop: 4 }}>
              <span>Descuento pack{descuentoPackPct > 0 ? ` (-${descuentoPackPct}%)` : ""}</span>
              <span>- {fmtCLP(montoDescuento)}</span>
            </div>
          )}
          {montoEvaluacion > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK, marginTop: 4 }}>
              <span>Evaluación {evaluacion}</span>
              <span>{fmtCLP(montoEvaluacion)}</span>
            </div>
          )}
          {Number(transporte || 0) > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK, marginTop: 4 }}>
              <span>Transporte</span>
              <span>{fmtCLP(Number(transporte))}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: NAVY, marginTop: 8, fontWeight: 700, borderTop: "1px solid #DCD2B4", paddingTop: 8 }}>
            <span>Total</span>
            <span>{fmtCLP(total)}</span>
          </div>
        </div>

        <button onClick={revisar} disabled={!cliente || !cliente.nombre}
          style={{ ...botonPrincipal, marginTop: 20, opacity: !cliente || !cliente.nombre ? 0.45 : 1 }}>
          Generar boleta
        </button>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Vista previa</h2>
        {!emitida ? (
          <p style={hint}>Completa el formulario y genera la boleta para verla aquí.</p>
        ) : (
          <>
            <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 380, border: "1px solid #EDE4CE", borderRadius: 8, display: "block", margin: "0 auto 16px" }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button onClick={descargarPNG} style={{ ...botonPrincipal, marginTop: 0 }}>Descargar PNG</button>
              <button onClick={descargarPDF} style={{ ...botonSecundario, borderColor: NAVY, color: NAVY }}>Descargar PDF</button>
              <button onClick={enviarWhatsapp} style={{ ...botonSecundario, borderColor: "#2F6A46", color: "#2F6A46" }}>Enviar por WhatsApp</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Boletas: selector de tipo (paseo/adiestramiento) ----------
export function Boletas({ clientes, boletasEmitidas, boletasAdiestramiento, onRegistrarBoleta, onRegistrarBoletaAdiestramiento, recargoPct, actualizarRecargoPct, rolActual }) {
  // El entrenador arranca en adiestramiento (su uso más frecuente) pero
  // ahora puede pasar a boletas de paseo igual que coordinador/administrador.
  const [tipo, setTipo] = useState(rolActual === "entrenador" ? "adiestramiento" : "paseo");

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <button onClick={() => setTipo("paseo")}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: tipo === "paseo" ? NAVY : "#EFE9D8", color: tipo === "paseo" ? CREAM : "#6B6248" }}>
          <Receipt size={15} /> Paseos
        </button>
        <button onClick={() => setTipo("adiestramiento")}
          style={{ display: "flex", alignItems: "center", gap: 6, border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 13.5, fontWeight: 600, cursor: "pointer", background: tipo === "adiestramiento" ? NAVY : "#EFE9D8", color: tipo === "adiestramiento" ? CREAM : "#6B6248" }}>
          <GraduationCap size={15} /> Adiestramiento
        </button>
      </div>
      {tipo === "paseo" ? (
        <FormularioBoletaPaseo clientes={clientes} boletasEmitidas={boletasEmitidas} onRegistrarBoleta={onRegistrarBoleta} recargoPct={recargoPct} actualizarRecargoPct={actualizarRecargoPct} />
      ) : (
        <FormularioBoletaAdiestramiento clientes={clientes} onRegistrarBoleta={onRegistrarBoletaAdiestramiento} />
      )}
    </div>
  );
}

// ---------- Facturas ----------
const FORMAS_PAGO = ["Transferencia", "Efectivo", "Webpay/Tarjeta", "Otro"];

// Tarjeta chica de resumen para la tira de KPI arriba de Facturas — mismos
// colores que ya usa cada estado en ESTADOS_FACTURA, para no inventar una
// paleta nueva que aprender.
function TarjetaResumenFactura({ titulo, valor, color, bg }) {
  return (
    <div style={{ background: bg, borderRadius: 10, padding: 16 }}>
      <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: 0.5 }}>{titulo}</p>
      <p style={{ margin: 0, fontSize: 20, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{valor}</p>
    </div>
  );
}

export function Facturas({ boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, clientes, setClientes, usuarios, cargandoBoletas, nombreUsuario }) {
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagoPendienteDbId, setPagoPendienteDbId] = useState(null);
  const [pagoPendienteTipo, setPagoPendienteTipo] = useState(null);
  const [pagoPendienteNumero, setPagoPendienteNumero] = useState(null);
  const [editandoBoleta, setEditandoBoleta] = useState(null);
  const [fechaPagoForm, setFechaPagoForm] = useState("");
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);
  const [descargando, setDescargando] = useState(null);
  // Colapsada por defecto — apenas se acepta una factura, desaparece de
  // "Por revisar" y pasa para acá, pero sin ocupar pantalla salvo que se
  // abra a propósito.
  const [yaIngresadasAbiertas, setYaIngresadasAbiertas] = useState(false);

  async function descargarPdf(b, claveFila) {
    setDescargando(claveFila);
    try {
      await descargarPdfBoleta(b, b._tipo, b.editadaPor ? "-corregida" : "");
    } catch {
      showToast("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setDescargando(null);
    }
  }

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ], [boletasEmitidas, boletasAdiestramiento]);

  function setterDe(tipo) {
    return tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  }

  // El responsable vive en el cliente, no en la boleta — se resuelve
  // buscando al cliente dueño de cada boleta (mismo match que usa el
  // resto de la app para asociar boleta↔cliente).
  function responsableDe(b) {
    return clientes.find((c) => esBoletaDeCliente(b, c))?.responsableNombre;
  }

  // El responsable es del cliente, no de la boleta puntual — cambiar acá
  // actualiza a todo el cliente dueño de esta boleta, igual que el
  // selector de FormularioCliente.
  function actualizarResponsable(b, nuevoNombre) {
    setClientes((prev) => prev.map((c) => (esBoletaDeCliente(b, c) ? { ...c, responsableNombre: nuevoNombre || undefined } : c)));
  }

  function abrirFormPago(boleta) {
    if (!boleta._dbId) return;
    setPagoPendienteDbId(boleta._dbId);
    setPagoPendienteTipo(boleta._tipo);
    setPagoPendienteNumero(boleta.numero);
    setFechaPagoForm(new Date().toISOString().slice(0, 10));
    setFormaPagoForm(FORMAS_PAGO[0]);
  }

  function confirmarPago() {
    editarBoleta(setterDe(pagoPendienteTipo), pagoPendienteDbId, { estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm });
    setPagoPendienteDbId(null);
    setPagoPendienteTipo(null);
    setPagoPendienteNumero(null);
  }

  // Cancelar/reactivar/revertir un pago son cambios de estado "hacia atrás"
  // — antes se podían hacer con un simple <select>, sin ninguna
  // confirmación (incluía poder revertir una boleta ya pagada con un solo
  // clic sin querer). Ahora cada uno pasa por BotonConfirmable.
  function cancelarBoleta(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, { estado: "cancelada" });
  }
  function revertirAPendiente(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, { estado: "pendiente_pago", fechaPago: undefined, formaPago: undefined });
  }
  function reactivarBoleta(boleta) {
    editarBoleta(setterDe(boleta._tipo), boleta._dbId, { estado: "pendiente_pago" });
  }

  const conteos = useMemo(() => {
    const c = { todas: todasLasBoletas.length };
    ESTADOS_FACTURA.forEach((e) => { c[e.id] = todasLasBoletas.filter((b) => b.estado === e.id).length; });
    return c;
  }, [todasLasBoletas]);

  // Resumen general (independiente de los filtros de la tabla, para que
  // sirva como panorama estable) — le da un efecto real y visible al
  // botón "Aceptar": antes de aceptar una boleta no suma en "Ventas
  // confirmadas" ni en "Por cobrar".
  const ventasConfirmadas = useMemo(() => calcularTotales(todasLasBoletas.filter(esVenta)).ingresos, [todasLasBoletas]);
  const porCobrarMonto = useMemo(() => calcularTotales(todasLasBoletas.filter(esPorCobrar)).ingresos, [todasLasBoletas]);

  // "Por revisar" = todavía sin aceptar, la cola de trabajo activa.
  // "Ya ingresadas" = todo lo que ya pasó por Aceptar (o se canceló) —
  // vive colapsado aparte para no ocupar la vista principal.
  const porRevisar = useMemo(() =>
    todasLasBoletas.filter((b) => b.estado === "no_enviada").sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO)),
    [todasLasBoletas]);
  const todasIngresadas = useMemo(() => todasLasBoletas.filter((b) => b.estado !== "no_enviada"), [todasLasBoletas]);

  const lista = useMemo(() => {
    return todasIngresadas
      .filter((b) => filtroEstado === "todas" || b.estado === filtroEstado)
      .filter((b) => filtroCliente === "todos" || b.cliente === filtroCliente)
      .filter((b) => !desde || fechaKey(new Date(b.fechaISO)) >= desde)
      .filter((b) => !hasta || fechaKey(new Date(b.fechaISO)) <= hasta)
      .filter((b) => !busqueda.trim() || b.cliente.toLowerCase().includes(busqueda.trim().toLowerCase()) || (b.perro || "").toLowerCase().includes(busqueda.trim().toLowerCase()))
      .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  }, [todasIngresadas, filtroEstado, filtroCliente, desde, hasta, busqueda]);

  const totalListado = calcularTotales(lista).ingresos;
  const nombresClientes = [...new Set(todasIngresadas.map((b) => b.cliente))];

  // Formulario de "marcar pagada" y editor de boleta — el mismo contenido
  // se usa tanto en la fila expandida de la tabla (desktop) como dentro
  // de la ficha mobile, para no duplicar la lógica en dos lugares.
  function BloquePagoInline() {
    return (
      <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, padding: 12, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 12.5, color: "#2F6A46", fontWeight: 600 }}>Marcando pagada la N°{String(pagoPendienteNumero).padStart(3, "0")}:</span>
        <input type="date" value={fechaPagoForm} onChange={(e) => setFechaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} />
        <select value={formaPagoForm} onChange={(e) => setFormaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
          {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <button onClick={confirmarPago} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Confirmar</button>
        <button onClick={() => { setPagoPendienteDbId(null); setPagoPendienteTipo(null); setPagoPendienteNumero(null); }} style={botonSecundario}>Cancelar</button>
      </div>
    );
  }

  function BloqueEditorInline(b) {
    return (
      <EditorBoletaBasico boleta={b} tipo={b._tipo}
        onGuardar={(cambios) => { editarBoleta(setterDe(b._tipo), b._dbId, { ...cambios, editadaPor: nombreUsuario, editadaEn: new Date().toISOString() }); setEditandoBoleta(null); }}
        onCancelar={() => setEditandoBoleta(null)} />
    );
  }

  // Una fila de la tabla (más sus filas de expansión: formulario de pago
  // y editor) — se comparte entre "Por revisar" y "Facturas ya
  // ingresadas", que son la misma tabla partida en dos por estado.
  function renderFilaFactura(b) {
    const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
    const claveFila = `${b._tipo}-${b._dbId}`;
    const responsable = responsableDe(b);
    return (
      <Fragment key={claveFila}>
        <tr style={{ borderTop: "1px solid #EDE4CE" }}>
          <td style={{ padding: "10px" }}>
            {String(b.numero).padStart(3, "0")}
            {b.editadaPor && (
              <span title={`Corregida por ${b.editadaPor} el ${new Date(b.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 5, fontSize: 11, color: GOLD, cursor: "help" }}>✎</span>
            )}
          </td>
          <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b._tipo === "paseo" ? "Paseo" : "Adiestramiento"}</td>
          <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{b.cliente}</td>
          <td style={{ padding: "10px", fontSize: 12, color: responsable ? "#6B6248" : "#B0A587" }}>
            {responsable || "Sin asignar"}
            {b._tipo === "adiestramiento" && b.montoResponsable != null && (
              <div style={{ fontSize: 10.5, color: "#8A7E5C", marginTop: 2 }}>
                Se lleva {fmtCLP(montoParaResponsable(b))} · Howria {fmtCLP(b.total - montoParaResponsable(b))}
              </div>
            )}
          </td>
          <td style={{ padding: "10px" }}>{b.perro ? `🐾 ${b.perro}` : "—"}</td>
          <td style={{ padding: "10px" }}>{b._tipo === "paseo" ? `${b.mes} ${b.anio}` : `Adiestramiento · ${b.modalidad}`}</td>
          <td style={{ padding: "10px", color: "#8A7E5C" }}>{b.fecha}</td>
          <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{fmtCLP(b.total)}</td>
          <td style={{ padding: "10px" }}>
            <span style={{ display: "inline-block", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, background: est.bg, color: est.color }}>
              {est.nombre}
            </span>
          </td>
          <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b.estado === "pagada" && b.formaPago ? `${b.formaPago} · ${b.fechaPago}` : "—"}</td>
          <td style={{ padding: "10px" }}>
            {!b._dbId ? (
              // Todavía no vuelve el id real de Supabase — sin él,
              // aceptar/editar/eliminar no tienen forma confiable de
              // saber a cuál boleta se refieren.
              <span style={{ fontSize: 12, color: "#8A7E5C" }}>Guardando…</span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                {b.estado === "no_enviada" && (
                  <button onClick={() => aceptarBoleta(setterDe(b._tipo), b._dbId)} style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Aceptar</button>
                )}
                {b.estado === "pendiente_pago" && (
                  <button onClick={() => abrirFormPago(b)} style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Marcar pagada</button>
                )}
                <button onClick={() => descargarPdf(b, claveFila)} disabled={descargando === claveFila}
                  style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600, opacity: descargando === claveFila ? 0.5 : 1 }}>
                  {descargando === claveFila ? "Generando..." : "Descargar PDF"}
                </button>
                {(b.estado === "no_enviada" || b.estado === "pendiente_pago") && (
                  <BotonConfirmable onConfirm={() => cancelarBoleta(b)} label="Cancelar" colorConfirmar={RUST}
                    style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
                )}
                {b.estado === "pagada" && (
                  <BotonConfirmable onConfirm={() => revertirAPendiente(b)} label="Revertir a pendiente" colorConfirmar={NAVY}
                    style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12 }} />
                )}
                {b.estado === "cancelada" && (
                  <BotonConfirmable onConfirm={() => reactivarBoleta(b)} label="Reactivar" colorConfirmar={"#2F6A46"}
                    style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }} />
                )}
                <button onClick={() => setEditandoBoleta(editandoBoleta === claveFila ? null : claveFila)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Editar</button>
                <BotonEliminar onConfirm={() => eliminarBoleta(setterDe(b._tipo), b._dbId)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
              </div>
            )}
          </td>
        </tr>
        {pagoPendienteDbId === b._dbId && pagoPendienteTipo === b._tipo && (
          <tr>
            <td colSpan={11} style={{ padding: "0 10px 12px" }}>
              <BloquePagoInline />
            </td>
          </tr>
        )}
        {editandoBoleta === claveFila && (
          <tr>
            <td colSpan={11} style={{ padding: "0 10px 12px" }}>
              <BloqueEditorInline b={b} />
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  // Versión ficha de la misma boleta, para mobile — mismo estado y
  // handlers que renderFilaFactura, solo cambia el layout. Acá además se
  // puede cambiar el responsable del dinero sin salir de Facturas.
  function renderTarjetaFactura(b) {
    const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
    const claveFila = `${b._tipo}-${b._dbId}`;
    const responsable = responsableDe(b);
    const hayAccionPrincipal = b.estado === "no_enviada" || b.estado === "pendiente_pago";
    return (
      <div key={claveFila} className="howria-card" style={{ background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 12, padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#8A7E5C", fontWeight: 600 }}>
            N°{String(b.numero).padStart(3, "0")} · {b._tipo === "paseo" ? "Paseo" : "Adiestramiento"}
            {b.editadaPor && (
              <span title={`Corregida por ${b.editadaPor} el ${new Date(b.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 5, color: GOLD, cursor: "help" }}>✎</span>
            )}
          </span>
          <span style={{ display: "inline-block", borderRadius: 20, padding: "5px 10px", fontSize: 12, fontWeight: 600, background: est.bg, color: est.color }}>
            {est.nombre}
          </span>
        </div>

        <p style={{ margin: "0 0 2px", fontSize: 16, fontWeight: 700, color: NAVY }}>{b.cliente}</p>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6B6248" }}>{b.perro ? `🐾 ${b.perro}` : "Sin perro asociado"}</p>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#8A7E5C" }}>{b._tipo === "paseo" ? `${b.mes} ${b.anio}` : `Adiestramiento · ${b.modalidad}`} · Emitida {b.fecha}</span>
          <span style={{ fontSize: 19, fontWeight: 700, color: NAVY, whiteSpace: "nowrap" }}>{fmtCLP(b.total)}</span>
        </div>
        {b.estado === "pagada" && b.formaPago && (
          <p style={{ margin: "0 0 10px", fontSize: 12, color: "#8A7E5C" }}>Pagada: {b.formaPago} · {b.fechaPago}</p>
        )}

        <div style={{ margin: "10px 0 12px" }}>
          <label style={{ display: "block", fontSize: 11, color: "#8A7E5C", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>
            Responsable del dinero
          </label>
          <select value={responsable || ""} onChange={(e) => actualizarResponsable(b, e.target.value)} style={{ ...input, marginBottom: 0, width: "100%" }}>
            <option value="">Sin asignar</option>
            {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          {b._tipo === "adiestramiento" && b.montoResponsable != null && (
            <p style={{ margin: "6px 0 0", fontSize: 12, color: "#8A7E5C" }}>
              Se lleva {fmtCLP(montoParaResponsable(b))} · Howria {fmtCLP(b.total - montoParaResponsable(b))}
            </p>
          )}
        </div>

        {!b._dbId ? (
          <p style={{ fontSize: 12.5, color: "#8A7E5C" }}>Guardando…</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {b.estado === "no_enviada" && (
                <button onClick={() => aceptarBoleta(setterDe(b._tipo), b._dbId)}
                  style={{ ...botonPrincipal, marginTop: 0, background: "#2F6A46", flex: 1, minHeight: 44 }}>Aceptar</button>
              )}
              {b.estado === "pendiente_pago" && (
                <button onClick={() => abrirFormPago(b)}
                  style={{ ...botonPrincipal, marginTop: 0, background: "#2F6A46", flex: 1, minHeight: 44 }}>Marcar pagada</button>
              )}
              <button onClick={() => descargarPdf(b, claveFila)} disabled={descargando === claveFila}
                style={{ ...botonSecundario, flex: hayAccionPrincipal ? "0 0 auto" : 1, minHeight: 44, opacity: descargando === claveFila ? 0.5 : 1 }}>
                {descargando === claveFila ? "Generando..." : "PDF"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontSize: 12.5 }}>
              {hayAccionPrincipal && (
                <BotonConfirmable onConfirm={() => cancelarBoleta(b)} label="Cancelar" colorConfirmar={RUST}
                  style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
              )}
              {b.estado === "pagada" && (
                <BotonConfirmable onConfirm={() => revertirAPendiente(b)} label="Revertir a pendiente" colorConfirmar={NAVY}
                  style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5 }} />
              )}
              {b.estado === "cancelada" && (
                <BotonConfirmable onConfirm={() => reactivarBoleta(b)} label="Reactivar" colorConfirmar={"#2F6A46"}
                  style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }} />
              )}
              <button onClick={() => setEditandoBoleta(editandoBoleta === claveFila ? null : claveFila)}
                style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Editar</button>
              <BotonEliminar onConfirm={() => eliminarBoleta(setterDe(b._tipo), b._dbId)}
                style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
            </div>
          </>
        )}

        {pagoPendienteDbId === b._dbId && pagoPendienteTipo === b._tipo && (
          <div style={{ marginTop: 12 }}><BloquePagoInline /></div>
        )}
        {editandoBoleta === claveFila && (
          <div style={{ marginTop: 12 }}><BloqueEditorInline b={b} /></div>
        )}
      </div>
    );
  }

  function EncabezadoTabla() {
    return (
      <thead>
        <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
          <th style={{ padding: "8px 10px" }}>N°</th>
          <th style={{ padding: "8px 10px" }}>Tipo</th>
          <th style={{ padding: "8px 10px" }}>Cliente</th>
          <th style={{ padding: "8px 10px" }}>Responsable</th>
          <th style={{ padding: "8px 10px" }}>Perro</th>
          <th style={{ padding: "8px 10px" }}>Período</th>
          <th style={{ padding: "8px 10px" }}>Emitida</th>
          <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
          <th style={{ padding: "8px 10px" }}>Estado</th>
          <th style={{ padding: "8px 10px" }}>Pago</th>
          <th style={{ padding: "8px 10px" }}>Acciones</th>
        </tr>
      </thead>
    );
  }

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Facturas</h2>
      <p style={hint}>Todas las boletas generadas por el sistema, con quién es cada una y en qué estado de pago se encuentra.</p>

      {cargandoBoletas ? (
        <p style={{ ...hint, display: "flex", alignItems: "center", gap: 8, marginTop: 16 }}>
          <Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando facturas…
        </p>
      ) : (
        <>
          <div style={{ marginTop: 22 }}>
            <h3 style={{ ...sectionTitle, fontSize: 15, marginBottom: 4 }}>Por revisar {porRevisar.length > 0 ? `(${porRevisar.length})` : ""}</h3>
            {porRevisar.length === 0 ? (
              <p style={{ ...hint, marginTop: 6 }}>No hay facturas por revisar — todo lo generado ya fue aceptado.</p>
            ) : (
              <>
                <p style={{ ...hint, marginTop: 2, marginBottom: 10 }}>Boletas recién generadas, todavía sin revisar — al aceptarlas pasan a "Facturas ya ingresadas" y empiezan a contar como venta.</p>
                <div className="howria-facturas-tabla" style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                    <EncabezadoTabla />
                    <tbody>{porRevisar.map(renderFilaFactura)}</tbody>
                  </table>
                </div>
                <div className="howria-facturas-tarjetas" style={{ flexDirection: "column", gap: 12 }}>
                  {porRevisar.map(renderTarjetaFactura)}
                </div>
              </>
            )}
          </div>

          <button onClick={() => setYaIngresadasAbiertas((v) => !v)}
            style={{ ...botonSecundario, width: "auto", marginTop: 22 }}>
            {yaIngresadasAbiertas ? "▾" : "▸"} Facturas ya ingresadas ({todasIngresadas.length})
          </button>

          {yaIngresadasAbiertas && (
            <div style={{ marginTop: 16 }}>
              <div className="howria-finanzas-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                <TarjetaResumenFactura titulo="Ventas confirmadas" valor={fmtCLP(ventasConfirmadas)} color={ESTADOS_FACTURA[2].color} bg={ESTADOS_FACTURA[2].bg} />
                <TarjetaResumenFactura titulo="Por cobrar" valor={fmtCLP(porCobrarMonto)} color={ESTADOS_FACTURA[1].color} bg={ESTADOS_FACTURA[1].bg} />
                <TarjetaResumenFactura titulo="Por revisar" valor={`${conteos.no_enviada || 0} factura(s)`} color={ESTADOS_FACTURA[0].color} bg={ESTADOS_FACTURA[0].bg} />
                <TarjetaResumenFactura titulo="Canceladas" valor={`${conteos.cancelada || 0} factura(s)`} color={ESTADOS_FACTURA[3].color} bg={ESTADOS_FACTURA[3].bg} />
              </div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                <button onClick={() => setFiltroEstado("todas")}
                  style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                    border: filtroEstado === "todas" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                    background: filtroEstado === "todas" ? NAVY : "#FFFFFF", color: filtroEstado === "todas" ? CREAM : INK,
                    fontWeight: filtroEstado === "todas" ? 600 : 400 }}>
                  Todas ({todasIngresadas.length})
                </button>
                {ESTADOS_FACTURA.filter((e) => e.id !== "no_enviada").map((e) => (
                  <button key={e.id} onClick={() => setFiltroEstado(e.id)}
                    style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                      border: filtroEstado === e.id ? `1.5px solid ${e.color}` : "1px solid #DCD2B4",
                      background: filtroEstado === e.id ? e.bg : "#FFFFFF", color: e.color,
                      fontWeight: filtroEstado === e.id ? 600 : 400 }}>
                    {e.nombre} ({conteos[e.id] || 0})
                  </button>
                ))}
              </div>

              <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ position: "relative" }}>
                  <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
                  <input placeholder="Buscar por cliente o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                    style={{ ...input, marginBottom: 0, width: "100%", paddingLeft: 34 }} />
                </div>
                <select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  <option value="todos">Todos los clientes</option>
                  {nombresClientes.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} style={{ ...input, marginBottom: 0 }} title="Desde" />
                  <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} style={{ ...input, marginBottom: 0 }} title="Hasta" />
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: "#8A7E5C", margin: "0 0 10px" }}>
                <span>{lista.length} factura(s) en este listado</span>
                <span>Suma: <b style={{ color: NAVY }}>{fmtCLP(totalListado)}</b></span>
              </div>

              <div className="howria-facturas-tabla" style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                  <EncabezadoTabla />
                  <tbody>
                    {lista.map(renderFilaFactura)}
                    {lista.length === 0 && (
                      <tr><td colSpan={11} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay facturas que coincidan.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="howria-facturas-tarjetas" style={{ flexDirection: "column", gap: 12 }}>
                {lista.map(renderTarjetaFactura)}
                {lista.length === 0 && (
                  <p style={{ ...hint, textAlign: "center" }}>No hay facturas que coincidan.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Panel admin (usuarios) ----------
export function PanelAdmin({ usuarios, setUsuarios, clientes, setClientes, usuarioActual, permisosRoles, actualizarPermisoRol, notificacionesRoles, actualizarNotificacionRol, esAdmin, cargandoUsuarios, loginsPendientes, setLoginsPendientes, solicitudesRegistro, setSolicitudesRegistro }) {
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [borrarId, setBorrarId] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: "", rol: "paseador" });
  const [creando, setCreando] = useState(false);
  const [credencialesNuevo, setCredencialesNuevo] = useState(null);
  const [masOpciones, setMasOpciones] = useState(false);
  const [fotoUrlNuevo, setFotoUrlNuevo] = useState(null);
  const [fechaInicioNuevo, setFechaInicioNuevo] = useState("");
  const [bancoNuevo, setBancoNuevo] = useState("");
  const [tipoCuentaNuevo, setTipoCuentaNuevo] = useState("Cuenta corriente");
  const [numeroCuentaNuevo, setNumeroCuentaNuevo] = useState("");
  const [clientesSeleccionadosNuevo, setClientesSeleccionadosNuevo] = useState([]);
  const [capacitacionAbiertaId, setCapacitacionAbiertaId] = useState(null);
  const [gestionandoSolicitudId, setGestionandoSolicitudId] = useState(null);
  const [reseteandoId, setReseteandoId] = useState(null);
  const [passwordReseteada, setPasswordReseteada] = useState(null);

  const hoyNuevo = new Date();
  const mesActualNuevo = hoyNuevo.getMonth(), anioActualNuevo = hoyNuevo.getFullYear();

  async function subirFotoNuevo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFotoUrlNuevo(await comprimirImagen(file));
  }

  function toggleClienteNuevo(id) {
    setClientesSeleccionadosNuevo((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const clientesElegidosNuevo = clientes.filter((c) => clientesSeleccionadosNuevo.includes(c.id));
  const horarioPorDiaNuevo = DIAS_SEMANA_LARGO.map((nombreDia, dow) => ({
    dia: nombreDia,
    clientes: clientesElegidosNuevo.filter((c) => c.diasHabituales?.includes(dow)),
  }));
  const paseosSemanaNuevo = clientesElegidosNuevo.reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
  const gananciaSemanalNuevo = clientesElegidosNuevo.reduce((acc, c) => acc + (c.diasHabituales?.length || 0) * Number(c.tarifaPaseador || 0), 0);
  const gananciaMensualNuevo = clientesElegidosNuevo.reduce((acc, c) => {
    const paseosMes = diasSegunPlan(mesActualNuevo, anioActualNuevo, c.diasHabituales || []).length;
    return acc + paseosMes * Number(c.tarifaPaseador || 0);
  }, 0);

  async function resetearPassword(u) {
    if (reseteandoId || !u.email) return;
    setReseteandoId(u.id);
    const { data: { session } } = await supabase.auth.refreshSession();
    const resp = await fetch("/api/reset-password-usuario", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ email: u.email }),
    });
    const data = await resp.json().catch(() => ({}));
    setReseteandoId(null);
    if (!resp.ok) {
      showToast(data.error || "No se pudo resetear la contraseña");
      return;
    }
    setPasswordReseteada({ nombre: u.nombre, email: u.email, password: data.password });
  }

  const filtrados = usuarios.filter((u) => u.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  function clientesDe(nombre) {
    return clientes.filter((c) => c.paseadorNombre === nombre).length;
  }

  function actualizarRol(id, rol) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, rol } : u)));
  }

  function actualizarMetaMensual(id, valor) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, metaMensual: valor === "" ? null : Number(valor) } : u)));
  }

  function actualizarCapacidad(id, valor) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, capacidadMaxima: valor === "" ? null : Number(valor) } : u)));
  }

  function toggleCapacitacion(id, pasoId) {
    setUsuarios((prev) => prev.map((u) => {
      if (u.id !== id) return u;
      const actual = u.capacitacionCompletada || [];
      const completado = actual.includes(pasoId)
        ? actual.filter((p) => p !== pasoId)
        : [...actual, pasoId];
      return { ...u, capacitacionCompletada: completado };
    }));
  }

  function empezarEdicionNombre(u) {
    setEditandoId(u.id);
    setNombreEditado(u.nombre);
  }

  function guardarNombre(id) {
    const nombreNuevo = nombreEditado.trim();
    if (nombreNuevo) {
      const usuario = usuarios.find((u) => u.id === id);
      setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, nombre: nombreNuevo } : u)));
      if (usuario && usuario.nombre !== nombreNuevo) {
        setClientes((prev) => prev.map((c) => (c.paseadorNombre === usuario.nombre ? { ...c, paseadorNombre: nombreNuevo } : c)));
      }
    }
    setEditandoId(null);
  }

  function confirmarBorrar(u) {
    setUsuarios((prev) => prev.filter((x) => x.id !== u.id));
    if (u.email) {
      setLoginsPendientes((prev) => [...prev, { id: Date.now(), nombre: u.nombre, email: u.email, eliminadoEn: new Date().toISOString() }]);
    }
    setBorrarId(null);
  }

  function quitarLoginPendiente(id) {
    setLoginsPendientes((prev) => prev.filter((l) => l.id !== id));
  }

  // Reconstruye la fila de usuarios a partir de lo que quedó guardado en
  // logins_pendientes_borrar (nombre + email) al momento de eliminarlo. Su
  // cuenta de acceso en Supabase Auth no se borró (eliminar acá nunca la
  // toca, ver nota más abajo), así que solo hace falta el perfil — no se
  // crea una cuenta nueva ni se le cambia la contraseña.
  function restaurarLogin(l) {
    setUsuarios((prev) => [...prev, { id: Date.now(), nombre: l.nombre, rol: "paseador", email: l.email }]);
    quitarLoginPendiente(l.id);
    showToast(`${l.nombre} fue restaurado — ajusta su rol en la lista de arriba si "paseador" no es el que le corresponde.`);
  }

  async function agregar() {
    if (!nuevo.nombre.trim() || creando) return;
    setCreando(true);
    const nombreNuevo = nuevo.nombre.trim();
    const email = slugEmailUsuario(nombreNuevo);
    const { password, error } = await crearCuentaAcceso(email);
    if (error) {
      showToast(`No se pudo crear la cuenta de acceso: ${error.message}`);
      setCreando(false);
      return;
    }
    const usuarioNuevo = {
      id: Date.now(), nombre: nombreNuevo, rol: nuevo.rol, email,
      fotoUrl: fotoUrlNuevo, fechaInicio: fechaInicioNuevo,
      datosBancarios: { banco: bancoNuevo, tipoCuenta: tipoCuentaNuevo, numeroCuenta: numeroCuentaNuevo },
    };
    setUsuarios((prev) => [...prev, usuarioNuevo]);
    if (clientesSeleccionadosNuevo.length > 0) {
      setClientes((prev) => prev.map((c) => (clientesSeleccionadosNuevo.includes(c.id) ? { ...c, paseadorNombre: usuarioNuevo.nombre } : c)));
    }
    const detalleClientes = clientesElegidosNuevo.length > 0 ? ` con ${clientesElegidosNuevo.length} cliente(s) asignado(s)` : "";
    setCredencialesNuevo({ nombre: nombreNuevo, email, password, detalleClientes });
    setNuevo({ nombre: "", rol: "paseador" });
    setFotoUrlNuevo(null); setFechaInicioNuevo(""); setBancoNuevo(""); setNumeroCuentaNuevo(""); setClientesSeleccionadosNuevo([]);
    setMasOpciones(false);
    setCreando(false);
  }

  // La cuenta de acceso (Supabase Auth) ya existe desde que la persona
  // mandó el formulario — la creó api/solicitud-registro.js con la
  // contraseña que ella misma eligió. Aprobar solo activa su perfil en
  // usuarios, que es lo que realmente le da entrada a la app.
  async function aprobarSolicitud(s) {
    if (gestionandoSolicitudId) return;
    setGestionandoSolicitudId(s.id);
    try {
      const email = slugEmailUsuario(s.nombre);
      setUsuarios((prev) => [...prev, { id: Date.now(), nombre: s.nombre, rol: "paseador", email }]);
      const { error: errorUpdate } = await supabase.from("solicitudes_registro").update({ estado: "aprobada" }).eq("id", s.id);
      if (errorUpdate) showToast(`El perfil se creó, pero no se pudo marcar la solicitud como aprobada: ${errorUpdate.message}`);
      setSolicitudesRegistro((prev) => prev.filter((x) => x.id !== s.id));
      showToast(`${s.nombre} fue aprobado con rol "paseador" — ya puede entrar con la contraseña que eligió. Ajusta el rol en la lista de arriba si corresponde otro.`);
    } catch (err) {
      showToast(`No se pudo aprobar la solicitud: ${err.message || "error desconocido"}`);
    } finally {
      setGestionandoSolicitudId(null);
    }
  }

  // Al rechazar queda una cuenta de Supabase Auth huérfana (se creó al
  // mandar el formulario, pero nunca va a tener perfil en usuarios) —
  // se agrega a la misma lista de "logins pendientes de borrar" que ya
  // se usa para las cuentas eliminadas, para que el administrador se
  // acuerde de borrarla a mano en el dashboard de Supabase.
  async function rechazarSolicitud(s) {
    if (gestionandoSolicitudId) return;
    setGestionandoSolicitudId(s.id);
    const { error } = await supabase.from("solicitudes_registro").update({ estado: "rechazada" }).eq("id", s.id);
    if (error) {
      showToast(`No se pudo rechazar la solicitud: ${error.message}`);
      setGestionandoSolicitudId(null);
      return;
    }
    setSolicitudesRegistro((prev) => prev.filter((x) => x.id !== s.id));
    setLoginsPendientes((prev) => [...prev, { id: Date.now(), nombre: s.nombre, email: slugEmailUsuario(s.nombre), eliminadoEn: new Date().toISOString() }]);
    setGestionandoSolicitudId(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Permisos por rol — qué pestañas ve cada uno</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 16 }}>
          Marca o desmarca las pestañas que puede ver cada rol. Los cambios se aplican al instante — la próxima vez que esa persona entre (o recargue la página) va a ver el menú actualizado.
        </p>
        {!permisosRoles ? (
          <p style={{ fontSize: 13, color: "#8A7E5C", display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando permisos...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "#8A7E5C", fontWeight: 600, borderBottom: "1px solid #E4DBC3" }}>Pestaña</th>
                  {ROLES_APP.map((r) => (
                    <th key={r} style={{ textAlign: "center", padding: "6px 10px", color: NAVY, fontWeight: 700, borderBottom: "1px solid #E4DBC3", textTransform: "capitalize" }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TODOS_LOS_TABS.map((t) => (
                  <tr key={t.id}>
                    <td style={{ padding: "7px 10px", color: INK, borderBottom: "1px solid #F1EAD9" }}>{t.label}</td>
                    {ROLES_APP.map((r) => {
                      const bloqueado = r === "administrador" && t.id === "usuarios";
                      const activo = permisosRoles[r]?.includes(t.id) || bloqueado;
                      return (
                        <td key={r} style={{ textAlign: "center", padding: "7px 10px", borderBottom: "1px solid #F1EAD9" }}>
                          <input type="checkbox" checked={activo} disabled={bloqueado}
                            title={bloqueado ? "El administrador siempre necesita ver Usuarios, para no perder acceso a esta pantalla" : ""}
                            onChange={(e) => actualizarPermisoRol(r, t.id, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: bloqueado ? "not-allowed" : "pointer" }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Notificaciones por rol — qué aviso push recibe cada uno</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 16 }}>
          Marca o desmarca qué rol recibe cada notificación. Solo le llega a quien además haya activado las notificaciones en su navegador (el ícono de campana del header).
        </p>
        {!notificacionesRoles ? (
          <p style={{ fontSize: 13, color: "#8A7E5C", display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando notificaciones...</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "6px 10px", color: "#8A7E5C", fontWeight: 600, borderBottom: "1px solid #E4DBC3" }}>Aviso</th>
                  {ROLES_APP.map((r) => (
                    <th key={r} style={{ textAlign: "center", padding: "6px 10px", color: NAVY, fontWeight: 700, borderBottom: "1px solid #E4DBC3", textTransform: "capitalize" }}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EVENTOS_NOTIFICACION.map((ev) => (
                  <tr key={ev.id}>
                    <td style={{ padding: "7px 10px", color: INK, borderBottom: "1px solid #F1EAD9" }}>{ev.label}</td>
                    {ROLES_APP.map((r) => {
                      const activo = notificacionesRoles[r]?.includes(ev.id);
                      return (
                        <td key={r} style={{ textAlign: "center", padding: "7px 10px", borderBottom: "1px solid #F1EAD9" }}>
                          <input type="checkbox" checked={activo}
                            onChange={(e) => actualizarNotificacionRol(r, ev.id, e.target.checked)}
                            style={{ width: 16, height: 16, cursor: "pointer" }} />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Usuarios del sistema ({usuarios.length})</h2>
        <input placeholder="Buscar por nombre..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, marginBottom: 16, maxWidth: 320 }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cargandoUsuarios && <p style={{ color: "#8A7E5C", fontSize: 13.5, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando usuarios…</p>}
          {!cargandoUsuarios && filtrados.map((u) => {
            const esUsuarioActual = usuarioActual && u.email === usuarioActual.email;
            return (
              <div key={u.id} style={{ padding: "14px 16px", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ width: 36, height: 36, borderRadius: "50%", background: u.fotoUrl ? `url(${u.fotoUrl}) center/cover` : NAVY, display: "flex", alignItems: "center", justifyContent: "center", color: CREAM, fontSize: 14, fontWeight: 700, flexShrink: 0 }}>
                      {!u.fotoUrl && u.nombre.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <div style={{ color: NAVY, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                        {editandoId === u.id ? (
                          <>
                            <input value={nombreEditado} onChange={(e) => setNombreEditado(e.target.value)} autoFocus
                              onKeyDown={(e) => e.key === "Enter" && guardarNombre(u.id)}
                              style={{ fontSize: 13.5, padding: "3px 6px", border: "1px solid #E4DBC3", borderRadius: 5, width: 160 }} />
                            <button onClick={() => guardarNombre(u.id)} style={{ border: "none", background: "none", color: "#2E5C41", cursor: "pointer", fontSize: 12 }}>Guardar</button>
                            <button onClick={() => setEditandoId(null)} style={{ border: "none", background: "none", color: "#8A7E5C", cursor: "pointer", fontSize: 12 }}>Cancelar</button>
                          </>
                        ) : (
                          <>
                            {u.nombre}
                            {esUsuarioActual && <span style={{ fontSize: 11, color: GOLD, fontWeight: 500 }}>(tú)</span>}
                            <button onClick={() => empezarEdicionNombre(u)} title="Cambiar nombre" style={{ border: "none", background: "none", color: "#B0A587", cursor: "pointer", fontSize: 12 }}>✎</button>
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#8A7E5C" }}>{u.email || "sin correo asignado"}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: "#6B6248" }}>{clientesDe(u.nombre)} cliente(s) asignado(s)</span>
                    <button onClick={() => setCapacitacionAbiertaId(capacitacionAbiertaId === u.id ? null : u.id)}
                      style={{ border: "1px solid #E4DBC3", background: "none", color: NAVY, borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                      Capacitación {(u.capacitacionCompletada || []).length}/{PASOS_CAPACITACION.length} {capacitacionAbiertaId === u.id ? "▴" : "▾"}
                    </button>
                    {esAdmin ? (
                      <select value={u.rol} onChange={(e) => actualizarRol(u.id, e.target.value)} style={{ ...input, marginBottom: 0, width: 170, padding: "8px 10px", fontSize: 13 }}>
                        <option value="paseador">Paseador</option>
                        <option value="entrenador">Entrenador</option>
                        <option value="coordinador">Coordinador</option>
                        <option value="administrador">Administrador general</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 12.5, color: "#6B6248" }}>
                        {{ paseador: "Paseador", entrenador: "Entrenador", coordinador: "Coordinador", administrador: "Administrador general" }[u.rol] || u.rol}
                      </span>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6248" }}>
                      Máx. perros/manada
                      <input type="number" min="0" placeholder="sin límite" value={u.capacidadMaxima ?? ""} onChange={(e) => actualizarCapacidad(u.id, e.target.value)}
                        style={{ width: 64, fontSize: 12.5, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6 }} />
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6B6248" }}>
                      Meta mensual
                      <input type="number" min="0" placeholder="sin meta" value={u.metaMensual ?? ""} onChange={(e) => actualizarMetaMensual(u.id, e.target.value)}
                        style={{ width: 90, fontSize: 12.5, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6 }} />
                    </label>
                    {esAdmin && u.email && (
                      <BotonEliminar onConfirm={() => resetearPassword(u)} disabled={reseteandoId === u.id}
                        label={reseteandoId === u.id ? "Reseteando..." : "Resetear contraseña"}
                        style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5 }} />
                    )}
                    {esAdmin && (
                      <button onClick={() => setBorrarId(u.id)} disabled={esUsuarioActual}
                        title={esUsuarioActual ? "No puedes eliminar tu propia cuenta" : "Eliminar"}
                        style={{ border: "none", background: "none", color: esUsuarioActual ? "#C9BFA0" : RUST, cursor: esUsuarioActual ? "not-allowed" : "pointer", fontSize: 12.5 }}>
                        Eliminar
                      </button>
                    )}
                  </div>
                </div>
                {capacitacionAbiertaId === u.id && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #F1EAD9", display: "flex", flexDirection: "column", gap: 8 }}>
                    {PASOS_CAPACITACION.map((paso) => {
                      const hecho = (u.capacitacionCompletada || []).includes(paso.id);
                      return (
                        <label key={paso.id} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontSize: 13, color: hecho ? "#2F6A46" : INK }}>
                          <input type="checkbox" checked={hecho} onChange={() => toggleCapacitacion(u.id, paso.id)} />
                          {paso.texto}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!cargandoUsuarios && filtrados.length === 0 && <p style={{ color: "#8A7E5C", fontSize: 13.5 }}>No hay usuarios que coincidan con la búsqueda.</p>}
        </div>

        {passwordReseteada && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8, fontSize: 13, color: "#8A6A1E", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ Contraseña reseteada para {passwordReseteada.nombre} — pásale estos datos:</p>
            <p style={{ margin: 0 }}>Correo: <b>{passwordReseteada.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña nueva: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{passwordReseteada.password}</b></p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => navigator.clipboard.writeText(`Correo: ${passwordReseteada.email}\nContraseña: ${passwordReseteada.password}`)}
                style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
              <button onClick={() => setPasswordReseteada(null)} style={{ border: "none", background: "none", color: "#8A6A1E", cursor: "pointer", fontSize: 12 }}>Cerrar</button>
            </div>
          </div>
        )}

        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 14, lineHeight: 1.5 }}>
          Nota: eliminar aquí quita el acceso de esta persona a la app, pero su cuenta de acceso sigue existiendo en Supabase → Authentication → Users — bórrala también ahí si quieres cerrarla por completo. Cambiar el nombre (✎) no cambia su correo de acceso, así que puede seguir entrando con la misma contraseña de siempre.
        </p>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Agregar usuario</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
          <input placeholder="Nombre completo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} style={{ ...input, flex: 1, minWidth: 200, marginBottom: 0 }} />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} style={{ ...input, marginBottom: 0, width: 190 }}>
            <option value="paseador">Paseador</option>
            <option value="entrenador">Entrenador</option>
            <option value="coordinador">Coordinador</option>
            <option value="administrador">Administrador general</option>
          </select>
          <button onClick={agregar} disabled={!nuevo.nombre.trim() || creando} style={{ ...botonPrincipal, width: "auto", padding: "0 22px", opacity: !nuevo.nombre.trim() || creando ? 0.5 : 1 }}>
            {creando ? "Creando cuenta..." : "Agregar"}
          </button>
        </div>
        {!nuevo.nombre.trim() && <p style={{ color: "#8A7E5C", fontSize: 12.5, margin: "8px 0 0" }}>Ingresa el nombre para poder agregar.</p>}

        {!masOpciones ? (
          <button onClick={() => setMasOpciones(true)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600, marginTop: 12, padding: 0 }}>
            + Agregar foto, fecha de inicio, datos bancarios y clientes
          </button>
        ) : (
          <div style={{ marginTop: 16 }}>
            <div className="howria-photo-row" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20 }}>
              <div>
                <div style={{ width: 100, height: 100, borderRadius: "50%", background: fotoUrlNuevo ? `url(${fotoUrlNuevo}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
                  {!fotoUrlNuevo && "Foto"}
                </div>
                <label style={{ ...botonSecundario, display: "inline-block", marginTop: 10, padding: "6px 10px", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
                  Subir foto
                  <input type="file" accept="image/*" onChange={subirFotoNuevo} style={{ display: "none" }} />
                </label>
              </div>
              <div>
                <label style={label} htmlFor="nuevo-fecha-inicio">Fecha de inicio de contrato</label>
                <input id="nuevo-fecha-inicio" type="date" value={fechaInicioNuevo} onChange={(e) => setFechaInicioNuevo(e.target.value)} style={{ ...input, marginBottom: 0, maxWidth: 220 }} />
              </div>
            </div>

            <p style={{ ...label, marginTop: 22 }}>Datos bancarios para el pago</p>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 6 }}>
              <input placeholder="Banco" value={bancoNuevo} onChange={(e) => setBancoNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={tipoCuentaNuevo} onChange={(e) => setTipoCuentaNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option>Cuenta corriente</option>
                <option>Cuenta vista</option>
                <option>Cuenta RUT</option>
              </select>
              <input placeholder="N° de cuenta" value={numeroCuentaNuevo} onChange={(e) => setNumeroCuentaNuevo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>

            <p style={{ ...label, marginTop: 22 }}>Clientes a asignar (opcional)</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 6 }}>
              {clientes.map((c) => (
                <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: clientesSeleccionadosNuevo.includes(c.id) ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                  <input type="checkbox" checked={clientesSeleccionadosNuevo.includes(c.id)} onChange={() => toggleClienteNuevo(c.id)} />
                  <span>{c.nombre} · 🐾 {c.perro} {c.paseadorNombre && <span style={{ color: "#8A7E5C", fontSize: 11.5 }}>(hoy: {c.paseadorNombre})</span>}</span>
                </label>
              ))}
            </div>
            <p style={hint}>Si un cliente ya tenía otro paseador asignado, al registrar quedará reasignado a este nuevo ingreso. Puedes dejarlo sin marcar y asignar clientes más adelante editando la ficha del cliente en Clientes.</p>

            <button onClick={() => setMasOpciones(false)} style={{ border: "none", background: "none", color: "#8A7E5C", cursor: "pointer", fontSize: 12.5, marginTop: 6, padding: 0 }}>
              Menos opciones
            </button>
          </div>
        )}

        {masOpciones && clientesElegidosNuevo.length > 0 && (
          <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid #EDE4CE" }}>
            <h2 style={sectionTitle}>Horario resultante</h2>
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {horarioPorDiaNuevo.map((d) => (
                <div key={d.dia} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                  <span style={{ width: 90, color: NAVY, fontWeight: 600 }}>{d.dia}</span>
                  <span style={{ color: d.clientes.length ? INK : "#B0A587" }}>
                    {d.clientes.length ? d.clientes.map((c) => `${c.nombre} (${c.perro})`).join(" · ") : "Libre"}
                  </span>
                </div>
              ))}
            </div>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 22 }}>
              <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
                <p style={{ ...label, marginBottom: 6 }}>Paseos por semana</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 19 }}>{paseosSemanaNuevo}</p>
              </div>
              <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia semanal estimada</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaSemanalNuevo)}</p>
              </div>
              <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
                <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia mensual estimada</p>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaMensualNuevo)}</p>
              </div>
            </div>
          </div>
        )}

        {credencialesNuevo && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, fontSize: 13, color: "#2F6A46", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ Cuenta creada para {credencialesNuevo.nombre}{credencialesNuevo.detalleClientes} — pásale estos datos para que pueda entrar:</p>
            <p style={{ margin: 0 }}>Correo: <b>{credencialesNuevo.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{credencialesNuevo.password}</b></p>
            <button onClick={() => navigator.clipboard.writeText(`Correo: ${credencialesNuevo.email}\nContraseña: ${credencialesNuevo.password}`)}
              style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
          </div>
        )}
      </div>

      {esAdmin && solicitudesRegistro.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#D8ECDE", border: "1px solid #2F6A46" }}>
          <h2 style={{ ...sectionTitle, color: "#2F6A46" }}>Solicitudes de registro pendientes ({solicitudesRegistro.length})</h2>
          <p style={{ fontSize: 13, color: "#2E5C41", marginTop: -8, marginBottom: 14 }}>
            Gente que pidió unirse al equipo desde "Registro de cuenta" en el login (ya eligieron su propia contraseña). Aprobar activa su perfil (rol "paseador" por defecto, lo puedes cambiar después en la lista de arriba). Rechazar deja pendiente borrar su cuenta de acceso — se agrega abajo a "Logins pendientes de borrar".
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {solicitudesRegistro.map((s) => (
              <div key={s.id} style={{ background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <b style={{ color: NAVY, fontSize: 14 }}>{s.nombre}</b>
                    <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>
                      {s.email}{s.telefono ? ` · ${s.telefono}` : ""} · {new Date(s.creado_en).toLocaleDateString("es-CL")}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                    <button onClick={() => aprobarSolicitud(s)} disabled={gestionandoSolicitudId === s.id}
                      style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                      {gestionandoSolicitudId === s.id ? "Aprobando..." : "Aprobar"}
                    </button>
                    <BotonEliminar onConfirm={() => rechazarSolicitud(s)} disabled={gestionandoSolicitudId === s.id} label="Rechazar"
                      style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12, fontWeight: 600 }} />
                  </div>
                </div>
                {s.mensaje && <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#5C5442", fontStyle: "italic" }}>"{s.mensaje}"</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {esAdmin && loginsPendientes.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#FBF6E9", border: `1px solid ${GOLD}` }}>
          <h2 style={{ ...sectionTitle, color: "#8A6A1E" }}>Logins pendientes de borrar en Supabase ({loginsPendientes.length})</h2>
          <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 14 }}>
            Al eliminar a alguien aquí, su acceso a la app se corta al instante, pero su cuenta de acceso sigue existiendo en Supabase → Authentication → Users hasta que la borres ahí a mano. Esta lista es solo para que no se te olvide.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loginsPendientes.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: "10px 14px" }}>
                <span style={{ fontSize: 13 }}>
                  <b style={{ color: NAVY }}>{l.nombre}</b> · {l.email}
                  <span style={{ color: "#8A7E5C", fontSize: 12 }}> · eliminado el {new Date(l.eliminadoEn).toLocaleDateString("es-CL")}</span>
                </span>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <button onClick={() => restaurarLogin(l)} title="Lo eliminé por error — recrear su perfil con este correo"
                    style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    Restaurar
                  </button>
                  <button onClick={() => quitarLoginPendiente(l.id)} title="Ya lo borré en Supabase"
                    style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                    Ya lo borré, quitar de la lista
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {borrarId && (() => {
        const u = usuarios.find((x) => x.id === borrarId);
        if (!u) return null;
        return (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${u.nombre}?`}
            mensaje="Pierde el acceso a la app al instante. Su cuenta de acceso en Supabase no se borra sola — queda anotada abajo, en 'Logins pendientes de borrar', para que te acuerdes de borrarla ahí también."
            textoConfirmar="Eliminar usuario"
            onConfirmar={() => confirmarBorrar(u)}
            onCancelar={() => setBorrarId(null)}
          />
        );
      })()}
    </div>
  );
}
function programadosEnRango(cliente, desde, hasta, registroPaseos = {}) {
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const dow = (cur.getDay() + 6) % 7;
    const cancelado = registroPaseos[`${cliente.id}_${fechaKey(cur)}`]?.cancelado;
    if (cliente.diasHabituales?.includes(dow) && !cancelado) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

function realizadosEnRango(registroPaseos, clienteId, desde, hasta, paseadorEsperado = null) {
  let n = 0;
  const cur = new Date(desde);
  while (cur < hasta) {
    const r = registroPaseos[`${clienteId}_${fechaKey(cur)}`];
    if (r?.realizado) {
      // si el registro tiene guardado quién era el paseador ese día, solo cuenta
      // para ese paseador (así, si el cliente cambió de paseador, el pago queda bien atribuido)
      if (!paseadorEsperado || !r.paseadorNombre || r.paseadorNombre === paseadorEsperado) n++;
    }
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export function PagoTrabajadores({ boletasEmitidas, clientes, usuarios, registroPaseos, pagosRegistrados, setPagosRegistrados, cargandoPagos }) {
  const [periodo, setPeriodo] = useState("semana");
  // El bono/descuento se guarda en localStorage apenas se escribe (no solo
  // al marcar el pago) para que no se pierda si alguien lo tipea y se
  // distrae antes de confirmar — no necesita ser compartido entre
  // dispositivos, es solo un borrador hasta que el pago quede registrado.
  const [ajustes, setAjustes] = useState(() => {
    try { return JSON.parse(localStorage.getItem("howria_pago_ajustes") || "{}"); } catch { return {}; }
  });
  const hoy = new Date();
  const { desde, hasta, etiqueta } = rangoPeriodo(periodo, hoy);
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();

  function claveAjuste(paseador) {
    return `${paseador}|${periodo}|${etiqueta}`;
  }

  function actualizarAjuste(paseador, valor) {
    setAjustes((prev) => {
      const next = { ...prev, [claveAjuste(paseador)]: Number(valor) || 0 };
      try { localStorage.setItem("howria_pago_ajustes", JSON.stringify(next)); } catch {}
      return next;
    });
  }

  function descargarResumen(fila) {
    const texto = `Resumen de pago — Howria\n` +
      `Paseador: ${fila.paseador}\n` +
      `Período: ${periodo === "semana" ? "Semana" : "Mes"} ${etiqueta}\n\n` +
      `Clientes atendidos: ${fila.clientes}\n` +
      `Paseos realizados: ${fila.realizados} / ${fila.programados} (${fila.cumplimiento}%)\n\n` +
      `Monto asegurado (cliente ya pagó): ${fmtCLP(fila.montoAsegurado)}\n` +
      `Monto proyectado (pendiente de cobro): ${fmtCLP(fila.montoProyectado)}\n` +
      `Ajuste manual (bono/descuento): ${fmtCLP(fila.ajuste)}\n` +
      `TOTAL A PAGAR: ${fmtCLP(fila.monto)}\n`;
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Pago-${fila.paseador.replace(/\s+/g, "-")}-${etiqueta.replace(/\s+/g, "-")}.txt`;
    link.click();
  }

  const resumenPorPaseador = useMemo(() => {
    const mapa = {};
    const nombresConocidos = new Set([
      ...usuarios.map((u) => u.nombre),
      ...clientes.filter((c) => c.paseadorNombre).map((c) => c.paseadorNombre),
    ]);
    nombresConocidos.forEach((nombre) => { mapa[nombre] = { paseador: nombre, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 }; });

    clientes.filter((c) => c.paseadorNombre).forEach((c) => {
      const nombre = c.paseadorNombre;
      const programados = programadosEnRango(c, desde, hasta, registroPaseos);
      const realizadosRaw = realizadosEnRango(registroPaseos, c.id, desde, hasta, nombre);
      const realizados = Math.min(realizadosRaw, programados || realizadosRaw);
      const tarifa = Number(c.tarifaPaseador || 0);
      const montoCliente = realizados * tarifa;

      // ¿la boleta de este cliente para el mes actual ya está pagada?
      const facturaMes = boletasEmitidas.find((b) => esBoletaDeCliente(b, c) && b.mes === MESES[mesActual] && b.anio === anioActual);
      const asegurado = facturaMes?.estado === "pagada";

      if (!mapa[nombre]) mapa[nombre] = { paseador: nombre, clientes: 0, programados: 0, realizados: 0, montoAsegurado: 0, montoProyectado: 0 };
      mapa[nombre].clientes += 1;
      mapa[nombre].programados += programados;
      mapa[nombre].realizados += realizados;
      if (asegurado) mapa[nombre].montoAsegurado += montoCliente;
      else mapa[nombre].montoProyectado += montoCliente;
    });

    return Object.values(mapa)
      .map((r) => {
        const ajuste = ajustes[claveAjuste(r.paseador)] || 0;
        return { ...r, ajuste, monto: r.montoAsegurado + r.montoProyectado + ajuste, cumplimiento: r.programados ? Math.round((r.realizados / r.programados) * 100) : 0 };
      })
      .sort((a, b) => b.monto - a.monto);
  }, [clientes, usuarios, registroPaseos, boletasEmitidas, desde, hasta, mesActual, anioActual, ajustes, periodo, etiqueta]);

  const totalAsegurado = resumenPorPaseador.reduce((acc, r) => acc + r.montoAsegurado, 0);
  const totalProyectado = resumenPorPaseador.reduce((acc, r) => acc + r.montoProyectado, 0);

  function yaPagado(paseador) {
    return pagosRegistrados.find((p) => p.paseador === paseador && p.periodo === periodo && p.etiqueta === etiqueta);
  }

  function marcarPagado(fila) {
    setPagosRegistrados((prev) => [...prev, {
      id: Date.now() + Math.random(),
      paseador: fila.paseador, periodo, etiqueta, monto: fila.monto, paseos: fila.realizados, clientes: fila.clientes,
      ajuste: fila.ajuste || 0,
      fechaPagoISO: new Date().toISOString().slice(0, 10),
      fechaPago: new Date().toLocaleDateString("es-CL"),
    }]);
  }

  function desmarcarPagado(id) {
    setPagosRegistrados((prev) => prev.filter((p) => p.id !== id));
  }

  const historial = [...pagosRegistrados].sort((a, b) => b.id - a.id);

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Pago a trabajadores</h2>
      <p style={hint}>Calculado desde los paseos que cada paseador marcó como realizados en "Mis paseos" (no desde lo facturado), con su tarifa por paseo.</p>

      <div style={{ display: "flex", gap: 8, margin: "16px 0 6px" }}>
        {[["semana", "Semana"], ["mes", "Mes"]].map(([id, nombre]) => (
          <button key={id} onClick={() => setPeriodo(id)}
            style={{ padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
              border: periodo === id ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: periodo === id ? NAVY : "#FFFFFF", color: periodo === id ? CREAM : INK,
              fontWeight: periodo === id ? 600 : 400 }}>
            {nombre}
          </button>
        ))}
      </div>
      <p style={{ ...hint, marginBottom: 6 }}>Período: <b style={{ color: NAVY }}>{etiqueta}</b></p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 20 }}>
        <p style={{ ...hint, margin: 0 }}>💚 Asegurado (cliente ya pagó): <b style={{ color: "#2F6A46" }}>{fmtCLP(totalAsegurado)}</b></p>
        <p style={{ ...hint, margin: 0 }}>🕓 Proyectado (falta cobrar/confirmar): <b style={{ color: "#8A6A1E" }}>{fmtCLP(totalProyectado)}</b></p>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={{ width: "100%", minWidth: 720, borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <th style={{ padding: "8px 10px" }}>Paseador</th>
              <th style={{ padding: "8px 10px" }}>Clientes</th>
              <th style={{ padding: "8px 10px" }}>Cumplimiento</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Asegurado</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Proyectado</th>
              <th style={{ padding: "8px 10px" }}>Bono/descuento</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "8px 10px" }}></th>
            </tr>
          </thead>
          <tbody>
            {resumenPorPaseador.map((r) => {
              const pagado = yaPagado(r.paseador);
              return (
                <tr key={r.paseador} style={{ borderTop: "1px solid #EDE4CE" }}>
                  <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{r.paseador}</td>
                  <td style={{ padding: "10px" }}>{r.clientes}</td>
                  <td style={{ padding: "10px" }}>
                    <span style={{ fontWeight: 600, color: r.cumplimiento >= 90 ? "#2F6A46" : r.cumplimiento >= 60 ? "#8A6A1E" : RUST }}>{r.realizados}/{r.programados}</span>
                    <span style={{ color: "#8A7E5C", marginLeft: 6, fontSize: 12 }}>({r.cumplimiento}%)</span>
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#2F6A46" }}>{fmtCLP(r.montoAsegurado)}</td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 600, color: "#8A6A1E" }}>{fmtCLP(r.montoProyectado)}</td>
                  <td style={{ padding: "10px" }}>
                    <input type="number" value={r.ajuste || ""} placeholder="0" onChange={(e) => actualizarAjuste(r.paseador, e.target.value)}
                      style={{ ...input, marginBottom: 0, width: 100, padding: "6px 8px", fontSize: 12.5 }} />
                  </td>
                  <td style={{ padding: "10px", textAlign: "right", fontWeight: 700, color: NAVY }}>{fmtCLP(r.monto)}</td>
                  <td style={{ padding: "10px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => descargarResumen(r)} style={{ ...botonSecundario, padding: "7px 12px", fontSize: 12 }}>Descargar</button>
                      {pagado ? (
                        <>
                          <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                          <BotonEliminar onConfirm={() => desmarcarPagado(pagado.id)} label="Deshacer"
                            style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, borderColor: RUST, color: RUST }} />
                        </>
                      ) : (
                        <BotonEliminar onConfirm={() => marcarPagado(r)} disabled={r.monto === 0} label="Marcar como pagado"
                          style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5 }} />
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {resumenPorPaseador.length === 0 && (
              <tr><td colSpan={8} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay paseadores asignados todavía.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={label}>Historial de pagos realizados</p>
      {cargandoPagos ? (
        <p style={{ ...hint, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando historial de pagos…</p>
      ) : historial.length === 0 ? (
        <p style={{ ...hint, marginTop: 8 }}>Todavía no se ha marcado ningún pago.</p>
      ) : (
        <div>
          {historial.map((p) => (
            <FilaLista key={p.id} Icono={Banknote} titulo={p.paseador}
              subtitulo={`${p.periodo === "semana" ? "Semana" : "Mes"} ${p.etiqueta} · pagado el ${p.fechaPago}`}
              valor={fmtCLP(p.monto)} valorColor={NAVY} />
          ))}
        </div>
      )}
    </div>
  );
}
// ---------- Asignaciones (paseador ↔ cliente) ----------
const DIAS_LARGOS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function inicioSemanaActual() {
  const f = new Date();
  f.setHours(0, 0, 0, 0);
  const dow = (f.getDay() + 6) % 7;
  f.setDate(f.getDate() - dow);
  return f;
}

const UMBRAL_SOBRECARGA = 8;

// Bloque plegable para no mostrar toda la pestaña Coordinación de una en
// celular — "Hoy" abierto por defecto, el resto a un toque de distancia.
function SeccionPlegable({ titulo, subtitulo, defaultAbierta, children }) {
  const [abierta, setAbierta] = useState(!!defaultAbierta);
  return (
    <div className="howria-card" style={tarjeta}>
      <button onClick={() => setAbierta((v) => !v)}
        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}>
        <div>
          <h2 style={sectionTitle}>{titulo}</h2>
          {subtitulo && <p style={{ ...hint, marginTop: 4 }}>{subtitulo}</p>}
        </div>
        <span style={{ fontSize: 18, color: "#8A7E5C", flexShrink: 0, marginTop: 4, transform: abierta ? "rotate(180deg)" : "none", transition: "transform .15s ease" }}>▾</span>
      </button>
      {abierta && <div style={{ marginTop: 16 }}>{children}</div>}
    </div>
  );
}

// Fila de un cliente en el calendario del día: en celular se ven grandes
// las 2 acciones más usadas (marcar hecho / cancelar) y reasignar + nota
// quedan detrás de "Más" para no saturar.
function FilaCalendarioCliente({ item, usuarios, diaVista, hoy, onToggleRealizado, onToggleCancelado, onReasignar, onGuardarNota }) {
  const [masAbierto, setMasAbierto] = useState(false);
  const { cliente: c, estado, nota, atrasado } = item;
  const colorEstado = estado === "realizado" ? "#2F6A46" : estado === "cancelado" ? RUST : atrasado ? RUST : "#8A6A1E";
  const bgEstado = estado === "realizado" ? "#D8ECDE" : estado === "cancelado" ? "#F1DCD2" : atrasado ? "#F1DCD2" : "#F3E3B4";
  const textoEstado = estado === "realizado" ? "Realizado" : estado === "cancelado" ? "Cancelado" : atrasado ? "⚠️ Atrasado" : "Pendiente";

  return (
    <div style={{ padding: "10px 12px", background: atrasado ? "#FBEEEA" : CREAM_SOFT, borderRadius: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600, flexShrink: 0 }}>{c.horaHabitual || "—"}</span>
          <span style={{ fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre} · 🐾 {c.perro}</span>
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: bgEstado, color: colorEstado, flexShrink: 0 }}>{textoEstado}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button onClick={onToggleRealizado} disabled={diaVista > hoy}
          style={{ flex: "1 1 130px", border: `1px solid ${estado === "realizado" ? "#2F6A46" : "#C7D9CC"}`, background: estado === "realizado" ? "#2F6A46" : "#fff", color: estado === "realizado" ? "#fff" : "#2F6A46", borderRadius: 7, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, cursor: diaVista > hoy ? "not-allowed" : "pointer", opacity: diaVista > hoy ? 0.5 : 1 }}>
          {estado === "realizado" ? "✓ Hecho" : "Marcar hecho"}
        </button>
        <button onClick={onToggleCancelado}
          style={{ flex: "1 1 110px", border: `1px solid ${estado === "cancelado" ? RUST : "#E7CFC2"}`, background: estado === "cancelado" ? RUST : "#fff", color: estado === "cancelado" ? "#fff" : RUST, borderRadius: 7, padding: "8px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>
          {estado === "cancelado" ? "✕ Cancelado" : "Cancelar"}
        </button>
        <button onClick={() => setMasAbierto((v) => !v)}
          style={{ border: "none", background: "none", color: "#8A7E5C", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: "8px 4px", flexShrink: 0 }}>
          {masAbierto ? "Menos ▲" : "Más ▾"}
        </button>
      </div>
      {masAbierto && (
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
          <select defaultValue="" onChange={(e) => { if (e.target.value) onReasignar(e.target.value); e.target.value = ""; }}
            style={{ fontSize: 11.5, padding: "6px 8px", borderRadius: 6, border: "1px solid #E4DBC3", flex: "1 1 140px" }}>
            <option value="">Reasignar a...</option>
            {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          <input defaultValue={nota} placeholder="nota..." onBlur={(e) => onGuardarNota(e.target.value)}
            style={{ fontSize: 12, padding: "6px 8px", border: "1px solid #E4DBC3", borderRadius: 6, flex: "1 1 140px" }} />
        </div>
      )}
    </div>
  );
}

export function Coordinacion({ clientes, setClientes, usuarios, registroPaseos, setRegistroPaseos, setTab, setMapaPaseadorSel, faseDiaPaseador = {}, ausenciasPaseador = {} }) {
  const [paseadorSel, setPaseadorSel] = useState(usuarios[0]?.nombre || "");
  const [busqueda, setBusqueda] = useState("");
  const [diaOffset, setDiaOffset] = useState(0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dowHoy = (hoy.getDay() + 6) % 7;
  const [diaSemanaMovil, setDiaSemanaMovil] = useState(dowHoy);
  const inicioSemana = inicioSemanaActual();

  const diaVista = useMemo(() => { const d = new Date(hoy); d.setDate(d.getDate() + diaOffset); return d; }, [diaOffset]);
  const dowVista = (diaVista.getDay() + 6) % 7;
  const esHoyVista = diaOffset === 0;

  function actualizarRegistroDia(clienteId, fecha, cambios) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...cambios } }));
  }
  function toggleRealizadoDia(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    actualizarRegistroDia(clienteId, fecha, { realizado: !registroPaseos[key]?.realizado, cancelado: false });
  }
  function toggleCanceladoDia(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    actualizarRegistroDia(clienteId, fecha, { cancelado: !registroPaseos[key]?.cancelado, realizado: false });
  }
  function irAMapa(nombrePaseador) {
    setMapaPaseadorSel(nombrePaseador);
    setTab("mapa");
  }

  const calendarioDia = useMemo(() => {
    const ahora = new Date();
    return clientes
      .filter((c) => c.diasHabituales?.includes(dowVista))
      .map((c) => {
        const key = `${c.id}_${fechaKey(diaVista)}`;
        const registro = registroPaseos[key];
        const estado = registro?.realizado ? "realizado" : registro?.cancelado ? "cancelado" : "pendiente";
        let atrasado = false;
        if (esHoyVista && estado === "pendiente" && c.horaHabitual) {
          const [h, m] = c.horaHabitual.split(":").map(Number);
          const horaProgramada = new Date(diaVista);
          horaProgramada.setHours(h, m, 0, 0);
          atrasado = ahora > horaProgramada;
        }
        return { cliente: c, estado, nota: registro?.nota || "", atrasado };
      })
      .sort((a, b) => (a.cliente.horaHabitual || "99:99").localeCompare(b.cliente.horaHabitual || "99:99"));
  }, [clientes, registroPaseos, diaVista, dowVista, esHoyVista]);

  const calendarioPorPaseador = useMemo(() => {
    const grupos = {};
    calendarioDia.forEach((item) => {
      const nombre = item.cliente.paseadorNombre || "Sin asignar";
      (grupos[nombre] ||= []).push(item);
    });
    return Object.entries(grupos)
      .map(([paseador, items]) => ({ paseador, items }))
      .sort((a, b) => a.paseador.localeCompare(b.paseador, "es"));
  }, [calendarioDia]);

  const clientesHoy = clientes.filter((c) => c.diasHabituales?.includes(dowHoy));
  const realizadosHoy = clientesHoy.filter((c) => registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.realizado).length;
  const canceladosHoy = clientesHoy.filter((c) => registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.cancelado).length;
  const pendientesHoy = clientesHoy.length - realizadosHoy - canceladosHoy;

  const fechasSemana = Array.from({ length: 7 }, (_, i) => { const f = new Date(inicioSemana); f.setDate(f.getDate() + i); return f; });
  const resumenSemana = fechasSemana.map((fecha, i) => {
    const clientesDia = clientes.filter((c) => c.diasHabituales?.includes(i));
    return { dia: DIAS_LARGOS[i], total: clientesDia.length };
  });

  // carga semanal comparada entre paseadores — "sobrecargado" se calcula
  // con el mismo umbral que la vista diaria (picoDiario, el día más
  // cargado de su semana), no con el total semanal, para que un
  // paseador no aparezca sobrecargado acá y no en el detalle por día (o
  // al revés).
  const cargaPorPaseador = usuarios.map((u) => {
    const clientesDe = clientes.filter((c) => c.paseadorNombre === u.nombre);
    const total = clientesDe.reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
    const picoDiario = Math.max(0, ...Array.from({ length: 7 }, (_, dow) => clientesDe.filter((c) => c.diasHabituales?.includes(dow)).length));
    return { nombre: u.nombre, total, picoDiario };
  }).sort((a, b) => b.total - a.total);
  const maxCarga = Math.max(1, ...cargaPorPaseador.map((p) => p.total));

  const sinPaseador = clientes.filter((c) => !c.paseadorNombre && (!c.tipoServicio?.length || c.tipoServicio.includes("paseos")));

  const clientesDelPaseador = clientes.filter((c) => c.paseadorNombre === paseadorSel);
  const qBusqueda = busqueda.trim().toLowerCase();

  function toggleDiaCliente(clienteId, dow) {
    setClientes((prev) => prev.map((c) => {
      if (c.id !== clienteId) return c;
      const dias = c.diasHabituales || [];
      const tiene = dias.includes(dow);
      return { ...c, diasHabituales: tiene ? dias.filter((d) => d !== dow) : [...dias, dow].sort((a, b) => a - b) };
    }));
  }

  function agregarClienteADia(clienteId, dow) {
    setClientes((prev) => prev.map((c) => {
      if (c.id !== clienteId) return c;
      const dias = new Set(c.diasHabituales || []);
      dias.add(dow);
      return { ...c, paseadorNombre: paseadorSel, diasHabituales: [...dias].sort((a, b) => a - b) };
    }));
  }

  function asignarPaseadorRapido(clienteId, nombre) {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, paseadorNombre: nombre } : c)));
  }

  function guardarNotaDia(clienteId, fecha, nota) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), nota } }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <SeccionPlegable titulo="Hoy" subtitulo="Quién pasea a quién, a qué hora, y si ya se hizo." defaultAbierta>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>
          <p style={{ ...hint, margin: 0 }}>
            <b style={{ color: NAVY }}>{DIAS_LARGOS[dowVista]} {diaVista.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}</b>
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDiaOffset((d) => d - 1)} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5 }}>← Anterior</button>
            <button onClick={() => setDiaOffset(0)} disabled={diaOffset === 0} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5, opacity: diaOffset === 0 ? 0.5 : 1 }}>Hoy</button>
            <button onClick={() => setDiaOffset((d) => d + 1)} style={{ ...botonSecundario, padding: "8px 12px", fontSize: 12.5 }}>Siguiente →</button>
          </div>
        </div>

        {calendarioPorPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>No hay paseos programados este día.</p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {calendarioPorPaseador.map(({ paseador, items }) => {
              const hechos = items.filter((i) => i.estado === "realizado").length;
              return (
                <div key={paseador} style={{ border: "1px solid #E4DBC3", borderRadius: 10, padding: 14, background: "#FFFFFF" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, color: NAVY, fontSize: 14.5 }}>{paseador} <span style={{ fontWeight: 400, color: "#8A7E5C", fontSize: 12.5 }}>· {hechos}/{items.length} hecho(s)</span></span>
                      {esHoyVista && paseador !== "Sin asignar" && (() => {
                        const motivo = ausenciasPaseador[paseador];
                        if (motivo) {
                          return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: "#F1DCD2", color: RUST }}>⚠️ Ausente: {motivo}</span>;
                        }
                        const f = FASES_PASEADOR.find((x) => x.id === (faseDiaPaseador[paseador] || "pendiente"));
                        return <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: f.bg, color: f.color }}>{f.nombre}</span>;
                      })()}
                    </div>
                    {paseador !== "Sin asignar" && (
                      <button onClick={() => irAMapa(paseador)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Ver ruta en el mapa →</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map((item) => (
                      <FilaCalendarioCliente key={item.cliente.id} item={item} usuarios={usuarios} diaVista={diaVista} hoy={hoy}
                        onToggleRealizado={() => toggleRealizadoDia(item.cliente.id, diaVista)}
                        onToggleCancelado={() => toggleCanceladoDia(item.cliente.id, diaVista)}
                        onReasignar={(nombre) => asignarPaseadorRapido(item.cliente.id, nombre)}
                        onGuardarNota={(nota) => guardarNotaDia(item.cliente.id, diaVista, nota)} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginTop: 20 }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#9BAAB8" }}>Programados hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>{clientesHoy.length}</p>
          </div>
          <div style={{ background: "#E7F0EA", borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#2E5C41" }}>Realizados hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: "#2E5C41" }}>{realizadosHoy}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#8A7E5C" }}>Pendientes hoy</p>
            <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: RUST }}>{pendientesHoy}{canceladosHoy > 0 ? ` (${canceladosHoy} cancelado(s))` : ""}</p>
          </div>
        </div>
      </SeccionPlegable>

      <SeccionPlegable titulo="Semana" subtitulo="Cómo se reparte la semana y el horario fijo de cada paseador.">
        <div className="howria-dia-selector-movil" style={{ display: "none", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 2 }}>
          {DIAS_LARGOS.map((dia, dow) => (
            <button key={dow} onClick={() => setDiaSemanaMovil(dow)}
              style={{
                flex: "0 0 auto", padding: "8px 12px", borderRadius: 20, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
                border: dow === diaSemanaMovil ? "none" : "1px solid #E4DBC3",
                background: dow === diaSemanaMovil ? NAVY : "#fff",
                color: dow === diaSemanaMovil ? CREAM : INK,
              }}>
              {dia.slice(0, 3)}{dow === dowHoy ? " ·" : ""}
            </button>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Paseos programados por día, esta semana</p>
        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 22 }}>
          {resumenSemana.map((d, i) => (
            <div key={i} className={i === diaSemanaMovil ? undefined : "howria-dia-col-oculta-movil"}
              style={{ textAlign: "center", padding: "10px 4px", borderRadius: 8, background: i === dowHoy ? NAVY : CREAM_SOFT }}>
              <p style={{ margin: 0, fontSize: 11, color: i === dowHoy ? "#9BAAB8" : "#8A7E5C" }}>{d.dia.slice(0, 3)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: i === dowHoy ? CREAM : NAVY }}>{d.total}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Carga semanal por paseador (total de paseos/semana)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
          {cargaPorPaseador.map((p) => (
            <div key={p.nombre} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: INK, width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
              <div style={{ flex: 1, background: CREAM_SOFT, borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(p.total / maxCarga) * 100}%`, height: "100%", background: p.picoDiario > UMBRAL_SOBRECARGA ? RUST : NAVY, borderRadius: 6 }} title={p.picoDiario > UMBRAL_SOBRECARGA ? `Su día más cargado tiene ${p.picoDiario} clientes` : undefined} />
              </div>
              <span style={{ fontSize: 12, color: "#8A7E5C", width: 30, textAlign: "right", flexShrink: 0 }}>{p.total}</span>
            </div>
          ))}
        </div>

        <h3 style={{ ...sectionTitle, fontSize: 16 }}>Horario semanal por paseador</h3>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -6, marginBottom: 14 }}>
          Elige un paseador para ver y editar su horario. Agrega un cliente a un día con el selector, quítalo con la "×", o déjale una nota rápida.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <select value={paseadorSel} onChange={(e) => setPaseadorSel(e.target.value)} style={{ ...input, maxWidth: 280, marginBottom: 0 }}>
            {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
          </select>
          <input placeholder="Buscar cliente para agregar..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, maxWidth: 240, marginBottom: 0 }} />
        </div>

        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
          {DIAS_LARGOS.map((dia, dow) => {
            const clientesDia = clientesDelPaseador.filter((c) => c.diasHabituales?.includes(dow));
            const disponiblesParaAgregar = clientes
              .filter((c) => !c.diasHabituales?.includes(dow))
              .filter((c) => !qBusqueda || c.nombre.toLowerCase().includes(qBusqueda) || c.perro.toLowerCase().includes(qBusqueda));
            const fechaDia = fechasSemana[dow];
            const sobrecargado = clientesDia.length > UMBRAL_SOBRECARGA;
            return (
              <div key={dow} className={dow === diaSemanaMovil ? undefined : "howria-dia-col-oculta-movil"}
                style={{ border: sobrecargado ? `1.5px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8, padding: 10, background: dow === dowHoy ? "#FBF6E9" : "#fff" }}>
                <p style={{ margin: "0 0 8px", fontSize: 11.5, fontWeight: 700, color: sobrecargado ? RUST : NAVY, display: "flex", justifyContent: "space-between" }}>
                  <span>{dia.slice(0, 3)}{dow === dowHoy ? " · hoy" : ""}</span>
                  {sobrecargado && <span title={`Más de ${UMBRAL_SOBRECARGA} clientes este día`}>⚠️</span>}
                </p>
                {clientesDia.map((c) => {
                  const registro = registroPaseos[`${c.id}_${fechaKey(fechaDia)}`];
                  const color = registro?.realizado ? "#3F8B5B" : registro?.cancelado ? RUST : "#C4BCA0";
                  return (
                    <div key={c.id} style={{ background: CREAM_SOFT, borderRadius: 6, padding: "5px 6px", marginBottom: 4 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: INK, lineHeight: 1.2 }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
                          {c.nombre}
                        </span>
                        <BotonEliminar onConfirm={() => toggleDiaCliente(c.id, dow)} label="×" title="Quitar de este día" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 13, flexShrink: 0, marginLeft: 4, padding: 0 }} />
                      </div>
                      <input defaultValue={registro?.nota || ""} placeholder="nota..."
                        onBlur={(e) => guardarNotaDia(c.id, fechaDia, e.target.value)}
                        style={{ width: "100%", fontSize: 10, marginTop: 3, padding: "2px 4px", border: "1px solid #E4DBC3", borderRadius: 4, background: "#fff" }} />
                    </div>
                  );
                })}
                {clientesDia.length === 0 && <p style={{ fontSize: 10.5, color: "#C4BCA0", margin: "0 0 6px" }}>Sin paseos</p>}
                <select onChange={(e) => { if (e.target.value) { agregarClienteADia(Number(e.target.value), dow); e.target.value = ""; } }} style={{ width: "100%", fontSize: 10.5, padding: "4px 2px", marginTop: 4, border: "1px solid #E4DBC3", borderRadius: 5 }}>
                  <option value="">+ agregar</option>
                  {disponiblesParaAgregar.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            );
          })}
        </div>
      </SeccionPlegable>

      <SeccionPlegable titulo="Reasignar" subtitulo="Cambiar el paseador asignado a un cliente.">
        {sinPaseador.length > 0 && (
          <div style={{ background: "#FBEFE3", border: "1px solid #E8CBA0", borderRadius: 10, padding: 14, marginBottom: 18 }}>
            <h3 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 700, color: "#8A5A22" }}>⚠️ Clientes sin paseador ({sinPaseador.length})</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sinPaseador.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", borderRadius: 8, padding: "8px 12px" }}>
                  <span style={{ fontSize: 13, color: INK }}>{c.nombre} — {c.perro}</span>
                  <select defaultValue="" onChange={(e) => e.target.value && asignarPaseadorRapido(c.id, e.target.value)} style={{ fontSize: 12.5, padding: "5px 8px", borderRadius: 6, border: "1px solid #E4DBC3" }}>
                    <option value="">Asignar a...</option>
                    {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}
        <Asignaciones clientes={clientes} setClientes={setClientes} usuarios={usuarios} />
      </SeccionPlegable>
    </div>
  );
}

function Asignaciones({ clientes, setClientes, usuarios }) {
  const paseadoresDisponibles = usuarios;
  const [pendienteReasignar, setPendienteReasignar] = useState(null);

  function asignarPaseador(clienteId, nombre) {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, paseadorNombre: nombre } : c)));
  }

  function actualizarTarifa(clienteId, tarifa) {
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, tarifaPaseador: Number(tarifa) || 0 } : c)));
  }

  const clientesPorPaseador = useMemo(() => {
    const mapa = {};
    paseadoresDisponibles.forEach((p) => { mapa[p.nombre] = 0; });
    clientes.forEach((c) => { if (c.paseadorNombre) mapa[c.paseadorNombre] = (mapa[c.paseadorNombre] || 0) + 1; });
    return mapa;
  }, [clientes, paseadoresDisponibles]);

  const cargaPorDia = useMemo(() => {
    return paseadoresDisponibles.map((p) => {
      const clientesDe = clientes.filter((c) => c.paseadorNombre === p.nombre);
      const porDia = DIAS_SEMANA.map((_, dow) => clientesDe.filter((c) => c.diasHabituales?.includes(dow)).length);
      return { paseador: p.nombre, porDia, total: porDia.reduce((a, b) => a + b, 0) };
    });
  }, [clientes, paseadoresDisponibles]);

  const sinAsignar = clientes.filter((c) => !c.paseadorNombre && (!c.tipoServicio?.length || c.tipoServicio.includes("paseos"))).length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Paseadores de la empresa</h2>
        <p style={hint}>Cuántos clientes tiene asignado cada uno ahora mismo.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 14 }}>
          {paseadoresDisponibles.map((p) => (
            <div key={p.id} style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 600, color: NAVY }}>{p.nombre}</div>
              <div style={{ fontSize: 12, color: "#8A7E5C", textTransform: "capitalize" }}>{p.rol}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, marginTop: 8, fontFamily: "Georgia, serif" }}>{clientesPorPaseador[p.nombre] || 0}</div>
              <div style={{ fontSize: 11.5, color: "#8A7E5C" }}>clientes asignados</div>
            </div>
          ))}
          {paseadoresDisponibles.length === 0 && <p style={hint}>Todavía no hay paseadores registrados en "Usuarios".</p>}
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Carga de trabajo por día</h2>
        <p style={hint}>Cantidad de paseos programados cada día de la semana — dos paseadores con la misma cantidad de clientes pueden tener cargas muy distintas.</p>
        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase" }}>
                <th style={{ padding: "8px 10px" }}>Paseador</th>
                {DIAS_SEMANA_LARGO.map((d) => <th key={d} style={{ padding: "8px 10px", textAlign: "center" }}>{d.slice(0, 3)}</th>)}
                <th style={{ padding: "8px 10px", textAlign: "center" }}>Total sem.</th>
              </tr>
            </thead>
            <tbody>
              {cargaPorDia.map((r) => (
                <tr key={r.paseador} style={{ borderTop: "1px solid #EDE4CE" }}>
                  <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{r.paseador}</td>
                  {r.porDia.map((n, i) => (
                    <td key={i} style={{ padding: "10px", textAlign: "center", color: n >= 4 ? RUST : n === 0 ? "#C9C3A8" : INK, fontWeight: n >= 4 ? 700 : 400 }}>{n || "—"}</td>
                  ))}
                  <td style={{ padding: "10px", textAlign: "center", fontWeight: 700, color: NAVY }}>{r.total}</td>
                </tr>
              ))}
              {cargaPorDia.length === 0 && (
                <tr><td colSpan={9} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay paseadores registrados.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Asignar clientes</h2>
        <p style={hint}>{sinAsignar > 0 ? `${sinAsignar} cliente(s) sin paseador asignado.` : "Todos los clientes tienen paseador asignado."}</p>


        <div style={{ overflowX: "auto", marginTop: 14 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                <th style={{ padding: "8px 10px" }}>Cliente</th>
                <th style={{ padding: "8px 10px" }}>Perro</th>
                <th style={{ padding: "8px 10px" }}>Paseador asignado</th>
                <th style={{ padding: "8px 10px" }}>Tarifa por paseo</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} style={{ borderTop: "1px solid #EDE4CE" }}>
                  <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{c.nombre}</td>
                  <td style={{ padding: "10px" }}>🐾 {c.perro}</td>
                  <td style={{ padding: "10px" }}>
                    {pendienteReasignar?.clienteId === c.id ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12.5, color: INK }}>¿Reasignar a {pendienteReasignar.nombre || "sin paseador"}?</span>
                        <button onClick={() => { asignarPaseador(c.id, pendienteReasignar.nombre); setPendienteReasignar(null); }}
                          style={{ border: "none", background: RUST, color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
                          Confirmar
                        </button>
                        <button onClick={() => setPendienteReasignar(null)}
                          style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <select value={c.paseadorNombre || ""} onChange={(e) => setPendienteReasignar({ clienteId: c.id, nombre: e.target.value })}
                        style={{ ...input, marginBottom: 0, padding: "8px 10px", fontSize: 13 }}>
                        <option value="">Sin asignar</option>
                        {paseadoresDisponibles.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ padding: "10px" }}>
                    <input type="number" value={c.tarifaPaseador || ""} onChange={(e) => actualizarTarifa(c.id, e.target.value)}
                      style={{ ...input, marginBottom: 0, width: 130, padding: "8px 10px", fontSize: 13 }} placeholder="$ por paseo" />
                  </td>
                </tr>
              ))}
              {clientes.length === 0 && (
                <tr><td colSpan={4} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay clientes registrados todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------- Mapa de rutas ----------

// Tarjeta arrastrable de un cliente en el armador de manada. El clic normal
// sigue funcionando igual que antes (togglea incluido) — dnd-kit solo activa
// el arrastre si el puntero se mueve lo suficiente (mouse) o se mantiene
// apretado un instante (táctil), así que un tap corto no se confunde con un
// intento de arrastre y el click nativo se sigue disparando solo.
function TarjetaClienteArrastrable({ cliente: c, enConflicto, onToggle, onUbicar, geocodificando }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: c.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onToggle(c.id)}
      style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        padding: "10px 12px", background: "#FFFFFF",
        border: enConflicto ? `1.5px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8,
        opacity: isDragging ? 0.4 : 1, touchAction: "none", cursor: "grab",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: 1 }}>
        <GripVertical size={15} color="#C4BCA0" style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <b style={{ color: NAVY }}>{c.nombre}</b> · 🐾 {c.perro} · {c.direccion || "sin dirección"}
        </span>
      </div>
      {c.lat && c.lng ? (
        <span style={{ fontSize: 11.5, color: "#2F6A46", fontWeight: 600, flexShrink: 0 }}>✓ ubicado</span>
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onUbicar(c); }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={!c.direccion || geocodificando === c.id}
          style={{ ...botonSecundario, padding: "6px 10px", fontSize: 11.5, flexShrink: 0 }}
        >
          {geocodificando === c.id ? "Buscando..." : "Ubicar"}
        </button>
      )}
    </div>
  );
}

// Columna de destino ("Disponibles" / "En la ruta de hoy") del armador de
// manada — soltar una tarjeta acá adentro dispara onDragEnd en MapaRutas.
function ColumnaManada({ id, titulo, clientes, vacio, idsClientesEnConflicto, onToggle, onUbicar, geocodificando }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div>
      <p style={{ ...label, marginBottom: 8 }}>{titulo} ({clientes.length})</p>
      <div
        ref={setNodeRef}
        style={{
          display: "flex", flexDirection: "column", gap: 8, minHeight: 60, borderRadius: 10,
          padding: 8, background: isOver ? "#F3E3B4" : "transparent",
          border: isOver ? `1.5px dashed ${GOLD}` : "1.5px dashed transparent",
        }}
      >
        {clientes.length === 0 && <p style={{ ...hint, margin: "8px 4px" }}>{vacio}</p>}
        {clientes.map((c) => (
          <TarjetaClienteArrastrable
            key={c.id} cliente={c} enConflicto={idsClientesEnConflicto.has(c.id)}
            onToggle={onToggle} onUbicar={onUbicar} geocodificando={geocodificando}
          />
        ))}
      </div>
    </div>
  );
}

export function MapaRutas({ clientes, setClientes, usuarios, paseadorId: paseadorIdProp, setPaseadorId, mascotas = [], mascotaIncompatibilidades = [] }) {
  const paseadores = usuarios;
  const paseadorId = paseadorIdProp || paseadores[0]?.nombre || "";
  const [incluidos, setIncluidos] = useState({});
  const [velocidad, setVelocidad] = useState(20);
  const [duracionParada, setDuracionParada] = useState(25);
  const [ruta, setRuta] = useState(null);
  const [geocodificando, setGeocodificando] = useState(null);
  const [errorGeo, setErrorGeo] = useState("");
  const mapaDivRef = useRef(null);
  const mapaRef = useRef(null);
  const marcadoresRef = useRef(null);

  const clientesDelPaseador = clientes.filter((c) => c.paseadorNombre === paseadorId);

  // Solo aviso, no bloquea "Calcular ruta" — el coordinador decide si
  // sigue igual (ver audit, hallazgo "compatibilidad y capacidad").
  const mascotasIncluidas = clientesDelPaseador
    .filter((c) => incluidos[c.id])
    .flatMap((c) => mascotas.filter((m) => m.clienteId === c._dbId));
  const capacidadMaxima = usuarios.find((u) => u.nombre === paseadorId)?.capacidadMaxima;
  const conflictosCompatibilidad = [];
  for (let i = 0; i < mascotasIncluidas.length; i++) {
    for (let j = i + 1; j < mascotasIncluidas.length; j++) {
      const a = mascotasIncluidas[i], b = mascotasIncluidas[j];
      const incompatibles = mascotaIncompatibilidades.some((inc) =>
        (inc.mascotaId1 === a._dbId && inc.mascotaId2 === b._dbId) || (inc.mascotaId1 === b._dbId && inc.mascotaId2 === a._dbId));
      if (incompatibles) conflictosCompatibilidad.push([a, b]);
    }
  }
  const idsMascotasEnConflicto = new Set(conflictosCompatibilidad.flatMap(([a, b]) => [a._dbId, b._dbId]));
  const idsClientesEnConflicto = new Set(
    clientesDelPaseador.filter((c) => mascotas.some((m) => m.clienteId === c._dbId && idsMascotasEnConflicto.has(m._dbId))).map((c) => c.id)
  );

  function toggleIncluido(id) {
    setIncluidos((prev) => ({ ...prev, [id]: !prev[id] }));
    setRuta(null);
  }

  // Umbrales de activación distintos por tipo de puntero (patrón recomendado
  // por dnd-kit): con mouse hay que moverse un poco antes de que cuente como
  // arrastre; en táctil hay que mantener apretado un instante, así un swipe
  // para scrollear la lista no dispara un arrastre por accidente.
  const sensoresManada = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  function onDragEndManada(event) {
    const { active, over } = event;
    if (!over) return;
    const yaIncluido = !!incluidos[active.id];
    const destinoIncluye = over.id === "en-ruta";
    if (yaIncluido !== destinoIncluye) toggleIncluido(active.id);
  }

  async function ubicarCliente(cliente) {
    if (!cliente.direccion) return;
    setGeocodificando(cliente.id);
    setErrorGeo("");
    try {
      const coords = await geocodificarDireccion(cliente.direccion);
      if (!coords) {
        setErrorGeo(`No se encontró la dirección de ${cliente.nombre}. Revísala e intenta de nuevo.`);
      } else {
        setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, lat: coords.lat, lng: coords.lng } : c)));
      }
    } catch {
      setErrorGeo("No se pudo conectar con el servicio de mapas — revisa tu conexión a internet.");
    } finally {
      setGeocodificando(null);
    }
  }

  function calcularRuta() {
    const seleccionados = clientesDelPaseador.filter((c) => incluidos[c.id] && c.lat && c.lng);
    if (seleccionados.length < 2) { setRuta(null); return; }
    const orden = ordenarRutaCercanoMasProximo(seleccionados);
    let distanciaTotal = 0;
    for (let i = 0; i < orden.length - 1; i++) distanciaTotal += distanciaKm(orden[i], orden[i + 1]);
    const minutosViaje = (distanciaTotal / velocidad) * 60;
    const minutosParadas = orden.length * duracionParada;
    const dinero = orden.reduce((acc, c) => acc + Number(c.valorPaseoRef || 0), 0);
    setRuta({ orden, distanciaTotal, minutosViaje, minutosParadas, dinero });
  }

  const clientesConMapa = clientes.filter((c) => c.lat && c.lng);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    if (!mapaDivRef.current || mapaRef.current) return;
    const mapa = L.map(mapaDivRef.current).setView([SANTIAGO_CENTRO.lat, SANTIAGO_CENTRO.lng], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "© colaboradores de OpenStreetMap",
      maxZoom: 19,
    }).addTo(mapa);
    marcadoresRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    return () => { mapa.remove(); mapaRef.current = null; };
  }, []);

  // Redibuja los puntos (y ajusta el encuadre) cuando cambian los clientes
  // ubicados o cuáles están incluidos en la ruta del paseador elegido.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !marcadoresRef.current) return;
    marcadoresRef.current.clearLayers();
    clientesConMapa.forEach((c) => {
      const enRuta = c.paseadorNombre === paseadorId && incluidos[c.id];
      L.circleMarker([c.lat, c.lng], {
        radius: 9,
        weight: 2,
        color: "#FFFFFF",
        fillColor: enRuta ? GOLD : NAVY,
        fillOpacity: 1,
      })
        .bindTooltip(`${c.nombre} · ${c.perro}`)
        .addTo(marcadoresRef.current);
    });
    if (clientesConMapa.length > 0) {
      mapa.invalidateSize();
      mapa.fitBounds(L.latLngBounds(clientesConMapa.map((c) => [c.lat, c.lng])), { padding: [40, 40], maxZoom: 15 });
    }
  }, [clientesConMapa, paseadorId, incluidos]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Mapa de rutas — Santiago</h2>
        <p style={hint}>Elige un paseador, agrega o quita clientes de su ruta, ubícalos en el mapa y calcula cuánto tiempo y dinero genera la ruta.</p>

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, margin: "16px 0" }}>
          <div>
            <label style={label} htmlFor="mapa-paseador">Paseador</label>
            <select id="mapa-paseador" value={paseadorId} onChange={(e) => { setPaseadorId(e.target.value); setIncluidos({}); setRuta(null); }} style={{ ...input, marginBottom: 0 }}>
              {paseadores.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label style={label} htmlFor="mapa-velocidad">Velocidad promedio (km/h)</label>
            <input id="mapa-velocidad" type="number" value={velocidad} onChange={(e) => setVelocidad(Number(e.target.value) || 1)} style={{ ...input, marginBottom: 0 }} />
          </div>
          <div>
            <label style={label} htmlFor="mapa-minutos">Minutos por paseo</label>
            <input id="mapa-minutos" type="number" value={duracionParada} onChange={(e) => setDuracionParada(Number(e.target.value) || 0)} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <p style={{ ...label, margin: 0 }}>Clientes de {paseadorId || "este paseador"}</p>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: capacidadMaxima && mascotasIncluidas.length > capacidadMaxima ? RUST : "#8A7E5C" }}>
            {capacidadMaxima ? `${mascotasIncluidas.length}/${capacidadMaxima} perros en esta manada` : `${mascotasIncluidas.length} perro(s) — sin límite configurado`}
          </span>
        </div>
        {capacidadMaxima && mascotasIncluidas.length > capacidadMaxima && (
          <p style={{ fontSize: 12.5, color: RUST, margin: "6px 0 0" }}>⚠️ Esta manada se pasa de la capacidad de {paseadorId} ({capacidadMaxima} perros).</p>
        )}
        {conflictosCompatibilidad.length > 0 && (
          <div style={{ background: "#F1DCD2", border: "1px solid #E7C0AE", borderRadius: 8, padding: "10px 14px", marginTop: 8 }}>
            {conflictosCompatibilidad.map(([a, b], i) => (
              <p key={i} style={{ margin: i === 0 ? 0 : "4px 0 0", fontSize: 12.5, color: RUST }}>⚠️ {a.nombre} y {b.nombre} no se llevan bien.</p>
            ))}
          </div>
        )}
        {clientesDelPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Este paseador no tiene clientes asignados (ve a "Asignaciones").</p>
        ) : (
          <DndContext sensors={sensoresManada} onDragEnd={onDragEndManada}>
            <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              <ColumnaManada
                id="disponibles" titulo="Disponibles"
                clientes={clientesDelPaseador.filter((c) => !incluidos[c.id])}
                vacio="No quedan clientes sin incluir."
                idsClientesEnConflicto={idsClientesEnConflicto} onToggle={toggleIncluido}
                onUbicar={ubicarCliente} geocodificando={geocodificando}
              />
              <ColumnaManada
                id="en-ruta" titulo="En la ruta de hoy"
                clientes={clientesDelPaseador.filter((c) => incluidos[c.id])}
                vacio="Arrastra o toca un cliente de la izquierda para agregarlo."
                idsClientesEnConflicto={idsClientesEnConflicto} onToggle={toggleIncluido}
                onUbicar={ubicarCliente} geocodificando={geocodificando}
              />
            </div>
          </DndContext>
        )}
        {errorGeo && <p style={{ color: RUST, fontSize: 12.5, marginBottom: 12 }}>{errorGeo}</p>}

        <button onClick={calcularRuta} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px" }}>Calcular ruta</button>

        {ruta && (
          <div style={{ marginTop: 20, padding: 18, background: CREAM_SOFT, borderRadius: 8 }}>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 14 }}>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Distancia total</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{ruta.distanciaTotal.toFixed(1)} km</p>
              </div>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Tiempo estimado</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{Math.round(ruta.minutosViaje + ruta.minutosParadas)} min</p>
              </div>
              <div>
                <p style={{ ...label, marginBottom: 6 }}>Dinero que genera la ruta</p>
                <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 18 }}>{fmtCLP(ruta.dinero)}</p>
              </div>
            </div>
            <p style={label}>Orden sugerido de la ruta</p>
            {ruta.orden.map((c, i) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < ruta.orden.length - 1 ? "1px solid #E4DBC3" : "none", fontSize: 13.5 }}>
                <span>{i + 1}. {c.nombre} · {c.direccion}</span>
                <span style={{ color: "#8A7E5C" }}>{fmtCLP(c.valorPaseoRef)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <p style={label}>Mapa</p>
        <div ref={mapaDivRef} style={{ width: "100%", height: 420, borderRadius: 8, border: "1px solid #E4DBC3", background: "#EDE4CE" }} />
        {clientesConMapa.length === 0 && (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no hay ningún cliente ubicado — usa "Ubicar en el mapa" arriba.</p>
        )}
        <p style={{ fontSize: 11, color: "#9A9179", marginTop: 8 }}>El punto dorado marca los clientes incluidos en la ruta calculada; el azul marino, los demás clientes ya ubicados. Se puede hacer zoom y arrastrar (mouse o dedo).</p>
      </div>
    </div>
  );
}


// ---------- Equipo (organización de trabajo interno) ----------
export function EquipoTrabajo({ usuarios, objetivos = [], setObjetivos, objetivosMensuales = [], setObjetivosMensuales, tareas = [], setTareas, cargando }) {
  const hoy = new Date();
  const [semanaOffset, setSemanaOffset] = useState(0);
  const fechaRef = useMemo(() => { const d = new Date(hoy); d.setDate(d.getDate() + semanaOffset * 7); return d; }, [semanaOffset]);
  const { desde, hasta, etiqueta } = rangoPeriodo("semana", fechaRef);
  const semanaKey = fechaKey(desde);
  const mesKey = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const [vistaObjetivos, setVistaObjetivos] = useState("semana");
  const [nuevoObjetivoMes, setNuevoObjetivoMes] = useState("");
  const [asignadoObjetivoMes, setAsignadoObjetivoMes] = useState("");

  const [nuevoObjetivo, setNuevoObjetivo] = useState("");
  const [asignadoObjetivo, setAsignadoObjetivo] = useState("");
  const [diaSeleccionado, setDiaSeleccionado] = useState((hoy.getDay() + 6) % 7);
  const [nuevaTarea, setNuevaTarea] = useState("");
  const [asignadoTarea, setAsignadoTarea] = useState("");
  const [enlaceTarea, setEnlaceTarea] = useState("");

  const diasSemanaVista = useMemo(() => Array.from({ length: 7 }, (_, i) => { const d = new Date(desde); d.setDate(d.getDate() + i); return d; }), [desde]);

  const objetivosSemana = objetivos.filter((o) => o.semanaKey === semanaKey);
  const tareasSemana = tareas.filter((t) => { const f = new Date(t.fechaISO); return f >= desde && f < hasta; });
  const tareasDelDia = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(diasSemanaVista[diaSeleccionado]));

  function agregarObjetivo() {
    if (!nuevoObjetivo.trim()) return;
    setObjetivos((prev) => [...prev, { id: Date.now(), texto: nuevoObjetivo.trim(), asignadoA: asignadoObjetivo, semanaKey, cumplido: false }]);
    setNuevoObjetivo(""); setAsignadoObjetivo("");
  }
  function toggleObjetivo(id) {
    setObjetivos((prev) => prev.map((o) => (o.id === id ? { ...o, cumplido: !o.cumplido } : o)));
  }
  function eliminarObjetivo(id) {
    setObjetivos((prev) => prev.filter((o) => o.id !== id));
  }

  const objetivosDelMes = objetivosMensuales.filter((o) => o.mesKey === mesKey);
  function agregarObjetivoMes() {
    if (!nuevoObjetivoMes.trim()) return;
    setObjetivosMensuales((prev) => [...prev, { id: Date.now(), texto: nuevoObjetivoMes.trim(), asignadoA: asignadoObjetivoMes, mesKey, cumplido: false }]);
    setNuevoObjetivoMes(""); setAsignadoObjetivoMes("");
  }
  function toggleObjetivoMes(id) {
    setObjetivosMensuales((prev) => prev.map((o) => (o.id === id ? { ...o, cumplido: !o.cumplido } : o)));
  }
  function eliminarObjetivoMes(id) {
    setObjetivosMensuales((prev) => prev.filter((o) => o.id !== id));
  }

  function agregarTarea() {
    if (!nuevaTarea.trim()) return;
    setTareas((prev) => [...prev, { id: Date.now(), titulo: nuevaTarea.trim(), asignadoA: asignadoTarea, enlace: enlaceTarea.trim(), fechaISO: diasSemanaVista[diaSeleccionado].toISOString(), estado: "pendiente" }]);
    setNuevaTarea(""); setAsignadoTarea(""); setEnlaceTarea("");
  }
  function toggleTarea(id) {
    setTareas((prev) => prev.map((t) => (t.id === id ? { ...t, estado: t.estado === "hecho" ? "pendiente" : "hecho" } : t)));
  }
  function eliminarTarea(id) {
    setTareas((prev) => prev.filter((t) => t.id !== id));
  }

  const progresoPorPersona = usuarios.map((p) => {
    const suyas = tareasSemana.filter((t) => t.asignadoA === p.nombre);
    const hechas = suyas.filter((t) => t.estado === "hecho").length;
    return { persona: p.nombre, total: suyas.length, hechas };
  });
  const totalTareasSemana = tareasSemana.length;
  const totalHechasSemana = tareasSemana.filter((t) => t.estado === "hecho").length;
  const objetivosCumplidos = objetivosSemana.filter((o) => o.cumplido).length;

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando equipo…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Equipo Howria</h2>
            <p style={hint}>Objetivos de la semana, tareas del día a día, y quién lleva qué. Trabajo semana a semana.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setSemanaOffset((s) => s - 1)} style={botonSecundario}>← Semana anterior</button>
            <button onClick={() => setSemanaOffset(0)} disabled={semanaOffset === 0} style={{ ...botonSecundario, opacity: semanaOffset === 0 ? 0.5 : 1 }}>Esta semana</button>
            <button onClick={() => setSemanaOffset((s) => Math.min(s + 1, 0))} disabled={semanaOffset >= 0} style={{ ...botonSecundario, opacity: semanaOffset >= 0 ? 0.5 : 1 }}>Siguiente →</button>
          </div>
        </div>
        <p style={{ ...hint, marginTop: 10 }}>Semana: <b style={{ color: NAVY }}>{etiqueta}</b></p>

        <p style={{ ...label, marginTop: 16 }}>Equipo</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {usuarios.map((persona) => (
            <span key={persona.id} style={{ padding: "6px 14px", borderRadius: 20, background: CREAM_SOFT, color: NAVY, fontSize: 13, fontWeight: 600 }}>{persona.nombre}</span>
          ))}
        </div>
        <p style={hint}>Para agregar o sacar a alguien del equipo, hazlo desde la pestaña "Usuarios".</p>
      </div>

      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={sectionTitle}>Objetivos</h2>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setVistaObjetivos("semana")} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", border: vistaObjetivos === "semana" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4", background: vistaObjetivos === "semana" ? NAVY : "#FFFFFF", color: vistaObjetivos === "semana" ? CREAM : INK }}>Semana</button>
            <button onClick={() => setVistaObjetivos("mes")} style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer", border: vistaObjetivos === "mes" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4", background: vistaObjetivos === "mes" ? NAVY : "#FFFFFF", color: vistaObjetivos === "mes" ? CREAM : INK }}>Mes</button>
          </div>
        </div>

        {vistaObjetivos === "semana" ? (
          <>
            <p style={hint}>{objetivosCumplidos} de {objetivosSemana.length} objetivos de la semana cumplidos.</p>
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              {objetivosSemana.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: o.cumplido ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                    <input type="checkbox" checked={o.cumplido} onChange={() => toggleObjetivo(o.id)} />
                    <span style={{ fontSize: 13.5, textDecoration: o.cumplido ? "line-through" : "none", color: o.cumplido ? "#5C5442" : INK }}>
                      {o.texto} {o.asignadoA && <span style={{ color: "#8A7E5C", fontSize: 12 }}>· {o.asignadoA}</span>}
                    </span>
                  </label>
                  <BotonEliminar onConfirm={() => eliminarObjetivo(o.id)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
                </div>
              ))}
              {objetivosSemana.length === 0 && <p style={{ ...hint, marginTop: 4 }}>Todavía no hay objetivos para esta semana.</p>}
            </div>

            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
              <input placeholder="Nuevo objetivo de la semana" value={nuevoObjetivo} onChange={(e) => setNuevoObjetivo(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={asignadoObjetivo} onChange={(e) => setAsignadoObjetivo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option value="">Equipo (todos)</option>
                {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivo} disabled={!nuevoObjetivo.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevoObjetivo.trim() ? 0.5 : 1 }}>Agregar</button>
            </div>
          </>
        ) : (
          <>
            <p style={hint}>{objetivosDelMes.filter((o) => o.cumplido).length} de {objetivosDelMes.length} objetivos del mes cumplidos — para metas más largas, no solo semanales.</p>
            <div style={{ marginTop: 14, marginBottom: 16 }}>
              {objetivosDelMes.map((o) => (
                <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: o.cumplido ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 8 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                    <input type="checkbox" checked={o.cumplido} onChange={() => toggleObjetivoMes(o.id)} />
                    <span style={{ fontSize: 13.5, textDecoration: o.cumplido ? "line-through" : "none", color: o.cumplido ? "#5C5442" : INK }}>
                      {o.texto} {o.asignadoA && <span style={{ color: "#8A7E5C", fontSize: 12 }}>· {o.asignadoA}</span>}
                    </span>
                  </label>
                  <BotonEliminar onConfirm={() => eliminarObjetivoMes(o.id)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
                </div>
              ))}
              {objetivosDelMes.length === 0 && <p style={{ ...hint, marginTop: 4 }}>Todavía no hay objetivos para este mes.</p>}
            </div>

            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 10 }}>
              <input placeholder="Nuevo objetivo del mes" value={nuevoObjetivoMes} onChange={(e) => setNuevoObjetivoMes(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              <select value={asignadoObjetivoMes} onChange={(e) => setAsignadoObjetivoMes(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                <option value="">Equipo (todos)</option>
                {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivoMes} disabled={!nuevoObjetivoMes.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevoObjetivoMes.trim() ? 0.5 : 1 }}>Agregar</button>
            </div>
          </>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Tareas diarias</h2>
        <div style={{ display: "flex", gap: 6, marginTop: 14, marginBottom: 16, flexWrap: "wrap" }}>
          {diasSemanaVista.map((d, i) => {
            const total = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(d)).length;
            const hechas = tareasSemana.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(d) && t.estado === "hecho").length;
            return (
              <button key={i} onClick={() => setDiaSeleccionado(i)}
                style={{ padding: "10px 8px", minWidth: 70, borderRadius: 8, cursor: "pointer", textAlign: "center",
                  border: diaSeleccionado === i ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                  background: diaSeleccionado === i ? NAVY : "#FFFFFF", color: diaSeleccionado === i ? CREAM : INK }}>
                <div style={{ fontSize: 11, textTransform: "uppercase" }}>{DIAS_SEMANA[i]} {d.getDate()}</div>
                <div style={{ fontSize: 11, marginTop: 2, color: diaSeleccionado === i ? "#9BAAB8" : "#8A7E5C" }}>{hechas}/{total}</div>
              </button>
            );
          })}
        </div>

        <div style={{ marginBottom: 16 }}>
          {tareasDelDia.map((t) => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: t.estado === "hecho" ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                <input type="checkbox" checked={t.estado === "hecho"} onChange={() => toggleTarea(t.id)} />
                <span style={{ fontSize: 13.5, textDecoration: t.estado === "hecho" ? "line-through" : "none", color: t.estado === "hecho" ? "#5C5442" : INK }}>
                  {t.titulo} {t.asignadoA && <span style={{ color: "#8A7E5C", fontSize: 12 }}>· {t.asignadoA}</span>}
                  {t.enlace && <> · <a href={t.enlace} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "#1F5C8A" }}>🔗 documento</a></>}
                </span>
              </label>
              <BotonEliminar onConfirm={() => eliminarTarea(t.id)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
            </div>
          ))}
          {tareasDelDia.length === 0 && <p style={hint}>No hay tareas para este día.</p>}
        </div>

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 10 }}>
          <input placeholder="Nueva tarea para este día" value={nuevaTarea} onChange={(e) => setNuevaTarea(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <select value={asignadoTarea} onChange={(e) => setAsignadoTarea(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option value="">Sin asignar</option>
            {usuarios.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
          <input placeholder="Enlace a documento (opcional)" value={enlaceTarea} onChange={(e) => setEnlaceTarea(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <button onClick={agregarTarea} disabled={!nuevaTarea.trim()} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0, opacity: !nuevaTarea.trim() ? 0.5 : 1 }}>Agregar</button>
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Progreso de la semana</h2>
        <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18, margin: "14px 0 20px" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Tareas completadas</p>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 22, fontFamily: "Georgia, serif" }}>{totalHechasSemana} / {totalTareasSemana}</p>
        </div>
        <p style={label}>Por persona</p>
        {progresoPorPersona.map((p) => (
          <FilaLista key={p.persona} Icono={Users} titulo={p.persona} valor={`${p.hechas} / ${p.total} tareas`} />
        ))}
      </div>
    </div>
  );
}
// ---------- Agenda del adiestrador ----------
const TIPOS_CITA = [
  { id: "evaluacion", nombre: "Evaluación" },
  { id: "clase", nombre: "Clase" },
];

// Compartida entre el formulario de Agenda y el botón "Agregar al
// calendario del adiestrador" de PerfilCliente — mismo criterio de choque
// en los dos lugares donde se agenda una cita a mano.
function hayChoqueHorario(citas, adiestrador, fechaISO, duracionMin = 60) {
  const inicioNuevo = new Date(fechaISO).getTime();
  const finNuevo = inicioNuevo + duracionMin * 60000;
  return citas.some((c) => {
    if (c.adiestrador !== adiestrador || !["pendiente", "agendada"].includes(c.estado)) return false;
    const oIni = new Date(c.fechaISO).getTime();
    const oFin = oIni + (c.duracionMin || 60) * 60000;
    return inicioNuevo < oFin && finNuevo > oIni;
  });
}

const NOMBRES_ESTADO_CITA = { pendiente: "Pendiente", agendada: "Agendada", rechazada: "Rechazada", cancelada: "Cancelada", realizada: "Realizada" };

// Bloques horarios de 1 hora que el adiestrador puede habilitar por día —
// mismo horizonte que cubre un negocio de paseos/adiestramiento (8am-8pm).
const BLOQUES_DIA = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

// Lo que el cliente dejó al pedir la cita desde la agenda pública — copia
// redundante guardada directo en citas_agenda (ver api/cliente-agenda.js),
// así el adiestrador la ve acá sin necesitar acceso a la tabla prospectos
// (coordinador/admin únicamente). Citas viejas, creadas antes de esta
// columna, o agendadas a mano por staff, simplemente no tienen nada que
// mostrar.
function DatosContactoCita({ cita, onAbrir }) {
  if (!cita.email && !cita.telefono && !cita.direccion) return null;
  return (
    <button type="button" onClick={onAbrir}
      style={{ display: "block", width: "100%", textAlign: "left", marginTop: 8, padding: "8px 10px", background: CREAM_SOFT, border: "none", borderRadius: 6, fontSize: 12.5, color: "#5C5442", cursor: "pointer" }}>
      <p style={{ margin: 0, fontSize: 10.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>Datos que dejó al pedir la cita · toca para ver todo</p>
      {cita.email && <p style={{ margin: "4px 0 0" }}>✉️ {cita.email}</p>}
      {cita.telefono && <p style={{ margin: "2px 0 0" }}>📞 {cita.telefono}</p>}
      {cita.direccion && <p style={{ margin: "2px 0 0" }}>📍 {cita.direccion}</p>}
    </button>
  );
}

function FilaDetalleCita({ label, valor }) {
  return (
    <div>
      <p style={{ margin: 0, fontSize: 10.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 13.5, color: NAVY }}>{valor}</p>
    </div>
  );
}

// Mismo criterio visual que ModalConfirmacion (HowriaAdmin.jsx) — fondo
// oscuro + tarjeta centrada — pero de solo lectura, sin botones de acción.
function ModalDetalleCita({ cita, onCerrar, onEliminar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);

  const esPaseo = cita.tipo === "paseo";
  const tipoTexto = esPaseo ? "Paseo" : TIPOS_CITA.find((t) => t.id === cita.tipo)?.nombre || cita.tipo;
  const estadoTexto = NOMBRES_ESTADO_CITA[cita.estado] || cita.estado;
  const puedeEliminar = onEliminar && cita._dbId && ["cancelada", "rechazada", "realizada"].includes(cita.estado);

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-detalle-cita-titulo"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 420, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <h3 id="modal-detalle-cita-titulo" style={{ margin: "0 0 4px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{cita.clienteNombre}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8A7E5C" }}>🐾 {cita.perro} · {tipoTexto} · {estadoTexto}</p>

        <div style={{ display: "grid", gap: 14 }}>
          <FilaDetalleCita label={esPaseo ? "Fecha" : "Fecha y hora"} valor={esPaseo
            ? new Date(cita.fechaISO).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })
            : new Date(cita.fechaISO).toLocaleString("es-CL", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} />
          <FilaDetalleCita label={esPaseo ? "Paseador" : "Adiestrador"} valor={cita.adiestrador} />
          {cita.precio != null && <FilaDetalleCita label="Precio" valor={fmtCLP(cita.precio)} />}
          <FilaDetalleCita label="Correo" valor={cita.email || "Sin correo"} />
          <FilaDetalleCita label="Teléfono" valor={cita.telefono || "Sin teléfono"} />
          <FilaDetalleCita label="Dirección" valor={cita.direccion || "Sin dirección"} />
          {cita.notas && <FilaDetalleCita label="Notas" valor={cita.notas} />}
          {!esPaseo && <FilaDetalleCita label="Origen" valor={cita.origen === "cliente" ? "Pedida por el cliente (agenda pública)" : "Agendada por el equipo"} />}
          {cita.confirmadaEn && <FilaDetalleCita label="Confirmada el" valor={new Date(cita.confirmadaEn).toLocaleString("es-CL")} />}
        </div>

        {puedeEliminar && (
          <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid #EDE4CE", display: "flex", justifyContent: "flex-end" }}>
            <BotonEliminar onConfirm={() => { onEliminar(cita._dbId); onCerrar(); }} label="Eliminar cita" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
          </div>
        )}
      </div>
    </div>
  );
}

export function Agenda({ clientes, usuarios, citas, setCitas, cargando, disponibilidadFecha, toggleBloqueDisponibilidad, aplicarPatronSemanal, tarifas, actualizarTarifas, rolActual, nombreActual }) {
  const adiestradores = usuarios.filter((u) => u.rol === "entrenador");
  const [filtroAdiestrador, setFiltroAdiestrador] = useState("todos");
  const [clienteId, setClienteId] = useState(clientes[0]?.id ?? "");
  const [tipo, setTipo] = useState("evaluacion");
  const [adiestrador, setAdiestrador] = useState(adiestradores[0]?.nombre ?? "");
  const [fechaHora, setFechaHora] = useState("");
  const [notasNuevas, setNotasNuevas] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [notasEdit, setNotasEdit] = useState("");
  const [confirmandoId, setConfirmandoId] = useState(null);
  const [citaDetalleId, setCitaDetalleId] = useState(null);
  const esEntrenador = rolActual === "entrenador";
  const [adiestradorHorario, setAdiestradorHorario] = useState(esEntrenador ? nombreActual : (adiestradores[0]?.nombre ?? ""));
  const [linkGenericoCopiado, setLinkGenericoCopiado] = useState(false);
  const hoyDisponibilidad = new Date();
  const [mesDisponibilidad, setMesDisponibilidad] = useState({ anio: hoyDisponibilidad.getFullYear(), mesIdx: hoyDisponibilidad.getMonth() });
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);
  const [diasPatron, setDiasPatron] = useState([]);
  const [bloquesPatron, setBloquesPatron] = useState([]);
  const [aplicandoPatron, setAplicandoPatron] = useState(false);
  const [mostrarFormAgendar, setMostrarFormAgendar] = useState(false);

  function copiarLinkGenerico() {
    const link = `${window.location.origin}/agendaadiestrador`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkGenericoCopiado(true);
      setTimeout(() => setLinkGenericoCopiado(false), 2500);
    });
  }

  function agendar() {
    const cliente = clientes.find((c) => c.id === Number(clienteId));
    if (!cliente || !fechaHora || !adiestrador) return;
    if (new Date(fechaHora).getTime() <= Date.now()) {
      showToast("La fecha y hora de la cita debe ser futura.");
      return;
    }
    if (hayChoqueHorario(citas, adiestrador, fechaHora)) {
      showToast(`${adiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => [...prev, {
      id: Date.now(), clienteId: cliente._dbId, clienteNombre: cliente.nombre, perro: cliente.perro,
      tipo, adiestrador, fechaISO: new Date(fechaHora).toISOString(), estado: "agendada", notas: notasNuevas.trim(), origen: "staff",
    }]);
    setFechaHora(""); setNotasNuevas(""); setMostrarFormAgendar(false);
  }

  function cancelar(id) {
    setCitas((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "cancelada" } : c)));
  }

  function confirmarRealizada(id) {
    setCitas((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "realizada", notas: notasEdit.trim() } : c)));
    setEditandoId(null); setNotasEdit("");
  }

  function rechazar(id) {
    setCitas((prev) => prev.map((c) => (c.id === id ? { ...c, estado: "rechazada" } : c)));
  }

  async function confirmar(cita) {
    if (confirmandoId) return;
    setConfirmandoId(cita.id);
    try {
      // refreshSession() en vez de getSession(): fuerza un token nuevo en
      // vez de reusar uno que puede haber vencido mientras la pestaña
      // estuvo inactiva (típico en el "app" instalada en el celular, que
      // no siempre alcanza a renovarlo sola en segundo plano).
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/confirmar-cita", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ citaId: cita._dbId }),
      });
      const resultado = await resp.json().catch(() => ({}));
      // 502 = la cita sí quedó confirmada en la base, pero el envío del
      // correo falló (ver api/confirmar-cita.js) — igual hay que reflejar
      // el cambio de estado en pantalla, no solo los errores de verdad.
      if (!resp.ok && resp.status !== 502) {
        showToast(resultado.error || "No se pudo confirmar la cita.");
        return;
      }
      setCitas((prev) => prev.map((c) => (c.id === cita.id ? { ...c, estado: "agendada" } : c)));
      showToast(resp.status === 502 ? resultado.error : "Cita confirmada — se le avisó al cliente por correo.");
    } catch {
      showToast("No se pudo confirmar la cita — revisa tu conexión.");
    } finally {
      setConfirmandoId(null);
    }
  }

  const citasFiltradas = filtroAdiestrador === "todos" ? citas : citas.filter((c) => c.adiestrador === filtroAdiestrador);
  const pendientes = citasFiltradas.filter((c) => c.estado === "pendiente").sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  const proximas = citasFiltradas.filter((c) => c.estado === "agendada").sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  const historial = citasFiltradas.filter((c) => !["agendada", "pendiente"].includes(c.estado)).sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando agenda…</p></div>;
  }

  const citaDetalle = citaDetalleId ? citas.find((c) => c.id === citaDetalleId) : null;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {citaDetalle && <ModalDetalleCita cita={citaDetalle} onCerrar={() => setCitaDetalleId(null)} onEliminar={(dbId) => eliminarCita(setCitas, dbId)} />}
      <div className="howria-agenda-link">
        <div className="howria-card howria-agenda-link-tarjeta" style={{ ...tarjeta, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Link público de agenda</h2>
            <p style={{ ...hint, margin: 0 }}>Compártelo donde quieras (Instagram, WhatsApp) — cualquier persona puede pedir hora y quedar como prospecto.</p>
          </div>
          <button onClick={copiarLinkGenerico} style={botonSecundario}>{linkGenericoCopiado ? "¡Copiado!" : "Copiar link genérico"}</button>
        </div>
        <button onClick={copiarLinkGenerico} title="Copiar link público de agenda" aria-label="Copiar link público de agenda"
          className="howria-agenda-link-boton"
          style={{ width: 44, height: 44, borderRadius: 12, border: "none", background: linkGenericoCopiado ? "#2F6A46" : NAVY, color: CREAM, cursor: "pointer", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(20,33,61,0.15)" }}>
          {linkGenericoCopiado ? <Check size={18} /> : <Link2 size={18} />}
        </button>
      </div>

      {pendientes.length > 0 && (
        <div className="howria-card howria-agenda-pendientes" style={{ ...tarjeta, background: "#F3E3B4", border: "1px solid #E3D08C" }}>
          <h2 style={sectionTitle}>Pendientes de confirmar ({pendientes.length})</h2>
          <p style={hint}>Solicitudes que dejaron los tutores desde su portal. Al confirmar, el cliente recibe un correo con la fecha y hora.</p>
          <div style={{ marginTop: 12 }}>
            {pendientes.map((c) => (
              <div key={c.id} style={{ padding: "12px 14px", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13.5 }}>
                    <b style={{ color: NAVY }}>{c.clienteNombre}</b> · 🐾 {c.perro}
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                      {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>
                    {new Date(c.fechaISO).toLocaleString("es-CL", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.adiestrador}
                  </div>
                </div>
                <DatosContactoCita cita={c} onAbrir={() => setCitaDetalleId(c.id)} />
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => confirmar(c)} disabled={confirmandoId === c.id}
                    style={{ ...botonPrincipal, width: "auto", padding: "7px 16px", marginTop: 0, fontSize: 12.5, opacity: confirmandoId === c.id ? 0.6 : 1 }}>
                    {confirmandoId === c.id ? "Confirmando..." : "Confirmar"}
                  </button>
                  <BotonEliminar onConfirm={() => rechazar(c.id)} disabled={confirmandoId === c.id} label="Rechazar" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="howria-card howria-agenda-form" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Agendar evaluación o clase</h2>
            {!mostrarFormAgendar && <p style={{ ...hint, margin: "4px 0 0" }}>Se guarda en el calendario del adiestrador elegido y queda con seguimiento hasta marcarla como realizada.</p>}
          </div>
          <button onClick={() => setMostrarFormAgendar((v) => !v)} style={{ ...botonSecundario, width: "auto", flex: "none" }}>
            {mostrarFormAgendar ? "Cancelar" : "+ Agendar evaluación o clase"}
          </button>
        </div>

        {mostrarFormAgendar && (
          <>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
              <div>
                <label style={label} htmlFor="agenda-cliente">Cliente</label>
                <select id="agenda-cliente" value={clienteId} onChange={(e) => setClienteId(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre} — {c.perro}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-tipo">Tipo</label>
                <select id="agenda-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {TIPOS_CITA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-adiestrador">Adiestrador</label>
                <select id="agenda-adiestrador" value={adiestrador} onChange={(e) => setAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                  {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
                </select>
              </div>
              <div>
                <label style={label} htmlFor="agenda-fecha-hora">Fecha y hora</label>
                <input id="agenda-fecha-hora" type="datetime-local" value={fechaHora} onChange={(e) => setFechaHora(e.target.value)} style={{ ...input, marginBottom: 0 }} />
              </div>
            </div>
            <label style={{ ...label, marginTop: 12 }} htmlFor="agenda-notas">Notas (opcional)</label>
            <textarea id="agenda-notas" value={notasNuevas} onChange={(e) => setNotasNuevas(e.target.value)} placeholder="Ej. primera evaluación, revisar reactividad con otros perros..."
              style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit" }} />
            <button onClick={agendar} disabled={!clienteId || !fechaHora || !adiestrador} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px", opacity: !clienteId || !fechaHora || !adiestrador ? 0.45 : 1 }}>
              Agendar
            </button>
          </>
        )}
      </div>

      <div className="howria-card howria-agenda-proximas" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={sectionTitle}>Próximas citas</h2>
          <select value={filtroAdiestrador} onChange={(e) => setFiltroAdiestrador(e.target.value)} style={{ ...input, marginBottom: 0, width: 200 }}>
            <option value="todos">Todos los adiestradores</option>
            {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
          </select>
        </div>

        <div style={{ marginTop: 14 }}>
          {proximas.map((c) => (
            <div key={c.id} style={{ padding: "12px 14px", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 13.5 }}>
                  <b style={{ color: NAVY }}>{c.clienteNombre}</b> · 🐾 {c.perro}
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                    {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                  </span>
                </div>
                <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>
                  {new Date(c.fechaISO).toLocaleString("es-CL", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {c.adiestrador}
                </div>
              </div>
              {c.notas && <p style={{ margin: "8px 0 0", fontSize: 13, color: "#5C5442" }}>{c.notas}</p>}
              <DatosContactoCita cita={c} onAbrir={() => setCitaDetalleId(c.id)} />

              {editandoId === c.id ? (
                <div style={{ marginTop: 10 }}>
                  <textarea value={notasEdit} onChange={(e) => setNotasEdit(e.target.value)} placeholder="Seguimiento: cómo fue la sesión..."
                    style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit", marginBottom: 8 }} />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={() => confirmarRealizada(c.id)} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Guardar seguimiento</button>
                    <button onClick={() => setEditandoId(null)} style={botonSecundario}>Cancelar</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => { setEditandoId(c.id); setNotasEdit(c.notas || ""); }} style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5 }}>Marcar realizada</button>
                  <BotonEliminar onConfirm={() => cancelar(c.id)} label="Cancelar cita" style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }} />
                </div>
              )}
            </div>
          ))}
          {proximas.length === 0 && <p style={hint}>No hay citas agendadas.</p>}
        </div>
      </div>

      <div className="howria-card howria-agenda-historial" style={tarjeta}>
        <h2 style={sectionTitle}>Historial y seguimiento</h2>
        {historial.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no hay citas realizadas o canceladas.</p>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {historial.map((c) => (
              <div key={c.id} style={{ padding: "12px 14px", background: "#FFFDF7", border: "1px solid #E4DBC3", borderRadius: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                  <b style={{ color: NAVY, fontSize: 15 }}>{c.clienteNombre}</b>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: c.estado === "realizada" ? "#D8ECDE" : "#F1DCD2", color: c.estado === "realizada" ? "#2F6A46" : RUST }}>
                    {NOMBRES_ESTADO_CITA[c.estado] || c.estado}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                  <span style={{ fontSize: 12, color: "#8A7E5C" }}>🐾 {c.perro}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20, background: c.tipo === "evaluacion" ? "#F3E3B4" : "#D8ECDE", color: c.tipo === "evaluacion" ? "#8A6A1E" : "#2F6A46" }}>
                    {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre}
                  </span>
                </div>
                <p style={{ margin: "8px 0 0", color: "#8A7E5C", fontSize: 12.5 }}>{c.adiestrador} · {new Date(c.fechaISO).toLocaleDateString("es-CL")}</p>
                {c.notas && <p style={{ margin: "6px 0 0", color: "#5C5442", fontSize: 13 }}>{c.notas}</p>}
                {c._dbId && (
                  <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
                    <BotonEliminar onConfirm={() => eliminarCita(setCitas, c._dbId)} label="Eliminar" style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "5px 10px", fontSize: 11.5, cursor: "pointer" }} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card howria-agenda-disponibilidad" style={tarjeta}>
          <h2 style={sectionTitle}>Disponibilidad</h2>
          <p style={hint}>Clic en un día para ver y elegir qué bloques de hora quedan disponibles ese día — solo esos bloques van a aparecer para que los tutores agenden evaluaciones y clases.</p>
          {!esEntrenador && (
            <select value={adiestradorHorario} onChange={(e) => setAdiestradorHorario(e.target.value)} style={{ ...input, marginTop: 12, width: 240 }}>
              {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
          )}
          {(() => {
            const objetivo = esEntrenador ? nombreActual : adiestradorHorario;
            const hoyKey = fechaKey(new Date());

            function bloquesDe(key) {
              return disponibilidadFecha.filter((d) => d.adiestrador === objetivo && d.fecha === key).map((d) => d.horaInicio);
            }

            function estadoDia(key) {
              if (key < hoyKey) return "pasado";
              return bloquesDe(key).length > 0 ? "disponible" : "bloqueado";
            }

            function onClickDia(key) {
              setDiaSeleccionado(key);
            }

            function toggleDiaPatron(dow) {
              setDiasPatron((prev) => (prev.includes(dow) ? prev.filter((d) => d !== dow) : [...prev, dow]));
            }

            function toggleBloquePatron(hora) {
              setBloquesPatron((prev) => (prev.includes(hora) ? prev.filter((h) => h !== hora) : [...prev, hora]));
            }

            async function aplicarPatron() {
              if (diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron) return;
              setAplicandoPatron(true);
              const total = diasDelMes(mesDisponibilidad.mesIdx, mesDisponibilidad.anio);
              const desde = fechaKeyMes(mesDisponibilidad.anio, mesDisponibilidad.mesIdx, 1);
              const hasta = fechaKeyMes(mesDisponibilidad.anio, mesDisponibilidad.mesIdx, total);
              await aplicarPatronSemanal(objetivo, diasPatron, bloquesPatron, desde, hasta);
              setAplicandoPatron(false);
            }

            const bloquesDelDiaSeleccionado = diaSeleccionado ? bloquesDe(diaSeleccionado) : [];

            return (
              <div style={{ marginTop: 14 }}>
                <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 14, marginBottom: 16 }}>
                  <p style={{ ...label, marginBottom: 8 }}>Aplicar horario habitual a este mes</p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {DIAS_SEMANA_LARGO.map((nombreDia, dow) => (
                      <button key={dow} type="button" onClick={() => toggleDiaPatron(dow)}
                        style={{
                          borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: diasPatron.includes(dow) ? NAVY : "#FFFFFF", color: diasPatron.includes(dow) ? CREAM : "#6B6248",
                          border: diasPatron.includes(dow) ? "none" : "1px solid #E4DBC3",
                        }}>
                        {nombreDia.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
                    {BLOQUES_DIA.map((hora) => (
                      <button key={hora} type="button" onClick={() => toggleBloquePatron(hora)}
                        style={{
                          borderRadius: 20, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                          background: bloquesPatron.includes(hora) ? NAVY : "#FFFFFF", color: bloquesPatron.includes(hora) ? CREAM : "#6B6248",
                          border: bloquesPatron.includes(hora) ? "none" : "1px solid #E4DBC3",
                        }}>
                        {hora}
                      </button>
                    ))}
                  </div>
                  <button onClick={aplicarPatron} disabled={diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron}
                    style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: diasPatron.length === 0 || bloquesPatron.length === 0 || aplicandoPatron ? 0.5 : 1 }}>
                    {aplicandoPatron ? "Aplicando..." : `Aplicar a ${MESES[mesDisponibilidad.mesIdx]}`}
                  </button>
                </div>
                <CalendarioMes anio={mesDisponibilidad.anio} mesIdx={mesDisponibilidad.mesIdx} estadoDia={estadoDia} onClickDia={onClickDia}
                  onCambiarMes={(delta) => setMesDisponibilidad((prev) => {
                    const d = new Date(prev.anio, prev.mesIdx + delta, 1);
                    return { anio: d.getFullYear(), mesIdx: d.getMonth() };
                  })}
                  seleccionado={diaSeleccionado} />
                {diaSeleccionado && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #EDE4CE" }}>
                    <p style={{ ...label, marginBottom: 8 }}>
                      Bloques del {new Date(diaSeleccionado + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {BLOQUES_DIA.map((hora) => {
                        const activo = bloquesDelDiaSeleccionado.includes(hora);
                        return (
                          <button key={hora} type="button" onClick={() => toggleBloqueDisponibilidad(objetivo, diaSeleccionado, hora)}
                            style={{
                              borderRadius: 20, padding: "7px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer",
                              background: activo ? "#D8ECDE" : "#FFFFFF", color: activo ? "#2F6A46" : "#6B6248",
                              border: activo ? "1.5px solid #2F6A46" : "1px solid #E4DBC3",
                            }}>
                            {hora}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card howria-agenda-precios" style={tarjeta}>
          <h2 style={sectionTitle}>Precios</h2>
          <p style={hint}>Lo que ve el tutor al reservar en el link público — se guarda en cada solicitud, así que si lo cambias no afecta las citas ya agendadas.</p>
          {!esEntrenador && (
            <select value={adiestradorHorario} onChange={(e) => setAdiestradorHorario(e.target.value)} style={{ ...input, marginTop: 12, width: 240 }}>
              {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
          )}
          {(() => {
            const objetivo = esEntrenador ? nombreActual : adiestradorHorario;
            const tarifa = tarifas.find((t) => t.adiestrador === objetivo) || { precioEvaluacion: 0, precioClase: 0 };
            return (
              <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
                <div>
                  <label style={label} htmlFor="tarifa-evaluacion">Precio evaluación</label>
                  <input id="tarifa-evaluacion" type="number" min="0" value={tarifa.precioEvaluacion}
                    onChange={(e) => actualizarTarifas(objetivo, { precioEvaluacion: Number(e.target.value) })}
                    style={{ ...input, marginBottom: 0 }} />
                </div>
                <div>
                  <label style={label} htmlFor="tarifa-clase">Precio clase</label>
                  <input id="tarifa-clase" type="number" min="0" value={tarifa.precioClase}
                    onChange={(e) => actualizarTarifas(objetivo, { precioClase: Number(e.target.value) })}
                    style={{ ...input, marginBottom: 0 }} />
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
// ---------- Mail (contacto@howria.cl) ----------
function fmtFechaCorreo(iso) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// La "contraparte" de un correo es la persona externa del intercambio —
// el remitente si nos escribió, el destinatario si le escribimos nosotros.
// Agrupar por esa dirección arma un hilo por persona sin importar si el
// mensaje vino de una reserva automática o de una respuesta manual.
function construirHilos(correos) {
  const porContraparte = new Map();
  for (const c of correos) {
    const contraparte = (c.direccion === "entrante" ? c.remitente : c.destinatario)?.toLowerCase() || "desconocido";
    if (!porContraparte.has(contraparte)) porContraparte.set(contraparte, []);
    porContraparte.get(contraparte).push(c);
  }
  const hilos = [];
  for (const [contraparte, mensajes] of porContraparte) {
    mensajes.sort((a, b) => new Date(a.creadoEn) - new Date(b.creadoEn));
    const conFicha = [...mensajes].reverse().find((m) => m.clienteId || m.prospectoId);
    hilos.push({
      contraparte,
      mensajes,
      ultimo: mensajes[mensajes.length - 1],
      noLeidos: mensajes.filter((m) => m.direccion === "entrante" && !m.leido).length,
      clienteId: conFicha?.clienteId || null,
      prospectoId: conFicha?.prospectoId || null,
    });
  }
  hilos.sort((a, b) => new Date(b.ultimo.creadoEn) - new Date(a.ultimo.creadoEn));
  return hilos;
}

// Mismo render para cualquier mensaje (entrante o saliente): si trae HTML
// se muestra en un iframe sandbox — el saliente es contenido propio, pero
// aplicar la misma regla sin excepciones evita tener dos caminos distintos
// para renderizar HTML de correo, uno de ellos sin aislar.
function CuerpoCorreo({ mensaje }) {
  if (mensaje.cuerpoHtml) {
    return (
      <iframe
        sandbox=""
        srcDoc={mensaje.cuerpoHtml}
        title={`Correo: ${mensaje.asunto || "sin asunto"}`}
        style={{ width: "100%", height: 300, border: "1px solid #E4DBC3", borderRadius: 6, background: "#FFFFFF" }}
      />
    );
  }
  return <p style={{ margin: 0, fontSize: 13.5, color: "#332E22", whiteSpace: "pre-wrap" }}>{mensaje.cuerpoTexto || "(sin contenido)"}</p>;
}

// Lista compacta reutilizada en la ficha de un cliente y en la tarjeta de
// un prospecto — sin cuerpo expandible, para eso está la pestaña Mail.
// Convierte la fecha de una nota vieja de bitácora ("DD-MM-YYYY", texto
// simple sin hora — formato que usaba prospectos antes de este historial
// unificado) a un Date real, para poder ordenarla junto a correos/citas/
// boletas que sí tienen timestamp. Las notas nuevas ya guardan creadoEn
// (ISO) directo, no necesitan este parseo.
function fechaNotaVieja(fechaStr) {
  if (!fechaStr) return new Date(0);
  const [d, m, y] = fechaStr.split("-");
  if (!d || !m || !y) return new Date(0);
  return new Date(`${y}-${m}-${d}`);
}

// Línea de tiempo de todo lo que se sabe de un contacto (cliente o
// prospecto) en un solo lugar: notas libres + correos + (citas y
// boletas, cuando aplica) — ordenado del más reciente al más viejo, con
// un campo arriba para dejar una nota nueva. Reemplaza los bloques
// sueltos de "Bitácora"/"Correo" que antes vivían por separado.
function HistorialUnificado({ notas = [], onAgregarNota, correos = [], citas = [], boletas = [], placeholderNota = "Ej. llamó para confirmar, quedamos el jueves..." }) {
  const [notaNueva, setNotaNueva] = useState("");

  function agregar() {
    const texto = notaNueva.trim();
    if (!texto || !onAgregarNota) return;
    onAgregarNota(texto);
    setNotaNueva("");
  }

  const entradas = [
    ...notas.map((n) => ({ fechaOrden: n.creadoEn ? new Date(n.creadoEn) : fechaNotaVieja(n.fecha), icono: "📝", texto: n.texto })),
    ...correos.map((c) => ({
      fechaOrden: new Date(c.creadoEn),
      icono: c.direccion === "entrante" ? "📥" : "📤",
      texto: `${c.direccion === "entrante" ? "Recibido" : "Enviado"}: ${c.asunto || "(sin asunto)"}`,
    })),
    ...citas.map((c) => ({
      fechaOrden: new Date(c.fechaISO),
      icono: "📅",
      texto: `${TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre || c.tipo} con ${c.adiestrador} — ${NOMBRES_ESTADO_CITA[c.estado] || c.estado}`,
    })),
    ...boletas.map((b) => ({
      fechaOrden: new Date(b.fechaISO),
      icono: "🧾",
      texto: `Boleta N°${String(b.numero).padStart(3, "0")} — ${fmtCLP(b.total)} — ${ESTADOS_FACTURA.find((e) => e.id === b.estado)?.nombre || b.estado}`,
    })),
  ].sort((a, b) => b.fechaOrden - a.fechaOrden);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input placeholder={placeholderNota} value={notaNueva} onChange={(e) => setNotaNueva(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()} style={{ ...input, marginBottom: 0, flex: 1 }} />
        <button onClick={agregar} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>Agregar nota</button>
      </div>
      {entradas.length === 0 ? (
        <p style={{ ...hint, margin: 0 }}>Sin actividad registrada todavía.</p>
      ) : (
        <div style={{ display: "grid", gap: 6 }}>
          {entradas.map((e, i) => (
            <p key={i} style={{ margin: 0, fontSize: 13, color: INK }}>
              <span style={{ marginRight: 6 }}>{e.icono}</span>
              {e.texto}
              <span style={{ color: "#8A7E5C", fontSize: 12 }}> · {e.fechaOrden.toLocaleDateString("es-CL")}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export function Mail({ correos, setCorreos, cargando, clientes, prospectos, onVerCliente, onVerProspecto }) {
  const [busqueda, setBusqueda] = useState("");
  const [hiloAbierto, setHiloAbierto] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  const hilos = useMemo(() => construirHilos(correos), [correos]);

  function nombreDe(hilo) {
    if (hilo.clienteId) {
      const c = clientes.find((x) => x._dbId === hilo.clienteId);
      if (c) return c.nombre;
    }
    if (hilo.prospectoId) {
      const p = prospectos.find((x) => x._dbId === hilo.prospectoId);
      if (p) return p.nombre;
    }
    return hilo.contraparte;
  }

  const busquedaLimpia = busqueda.trim().toLowerCase();
  const hilosFiltrados = hilos.filter((h) => {
    if (!busquedaLimpia) return true;
    return h.contraparte.includes(busquedaLimpia)
      || nombreDe(h).toLowerCase().includes(busquedaLimpia)
      || (h.ultimo.asunto || "").toLowerCase().includes(busquedaLimpia);
  });

  function abrirHilo(hilo) {
    const yaAbierto = hiloAbierto === hilo.contraparte;
    setHiloAbierto(yaAbierto ? null : hilo.contraparte);
    // El borrador es una sola variable compartida por todos los hilos, no
    // una por hilo — sin este reset, un texto escrito para un cliente y
    // nunca enviado podía terminar mandado a otro cliente distinto al
    // abrir su hilo y tocar "Enviar respuesta".
    setRespuesta("");
    setErrorEnvio("");
    if (yaAbierto) return;
    const idsNoLeidos = hilo.mensajes.filter((m) => m.direccion === "entrante" && !m.leido).map((m) => m.id);
    if (idsNoLeidos.length === 0) return;
    supabase.from("correos").update({ leido: true }).in("id", idsNoLeidos).then(({ error }) => {
      if (!error) setCorreos((prev) => prev.map((c) => (idsNoLeidos.includes(c.id) ? { ...c, leido: true } : c)));
    });
  }

  async function enviarRespuesta(hilo) {
    if (!respuesta.trim() || enviando) return;
    setEnviando(true);
    setErrorEnvio("");
    try {
      // Ver comentario en Agenda.confirmar(): refreshSession() en vez de
      // getSession() para no mandar un token vencido.
      const { data: { session } } = await supabase.auth.refreshSession();
      const resp = await fetch("/api/responder-correo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          destinatario: hilo.contraparte,
          asunto: hilo.ultimo.asunto ? `Re: ${hilo.ultimo.asunto.replace(/^Re:\s*/i, "")}` : undefined,
          cuerpo: respuesta,
          clienteId: hilo.clienteId,
          prospectoId: hilo.prospectoId,
        }),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorEnvio(resultado.error || "No se pudo enviar la respuesta.");
        return;
      }
      if (resultado.correo) setCorreos((prev) => [dbToCorreo(resultado.correo), ...prev]);
      setRespuesta("");
      showToast("Respuesta enviada.");
    } catch {
      setErrorEnvio("No se pudo conectar — revisa tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando correo…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Mail — contacto@howria.cl</h2>
        <p style={hint}>Correos recibidos en contacto@howria.cl y confirmaciones enviadas a clientes, agrupados por conversación.</p>
        <input placeholder="Buscar por nombre, correo o asunto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, marginTop: 14, marginBottom: 0 }} />
      </div>

      {hilosFiltrados.length === 0 ? (
        <div className="howria-card" style={tarjeta}><p style={hint}>No hay correos {busquedaLimpia ? "que coincidan con la búsqueda" : "todavía"}.</p></div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {hilosFiltrados.map((hilo) => {
            const abierto = hiloAbierto === hilo.contraparte;
            const nombre = nombreDe(hilo);
            return (
              <div key={hilo.contraparte} className="howria-card" style={tarjeta}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, cursor: "pointer" }} onClick={() => abrirHilo(hilo)}>
                  <div style={{ fontSize: 13.5 }}>
                    {hilo.noLeidos > 0 && (
                      <span style={{ marginRight: 8, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: RUST, color: "#FFFFFF" }}>{hilo.noLeidos}</span>
                    )}
                    <b style={{ color: NAVY }}>{nombre}</b>
                    {nombre !== hilo.contraparte && <span style={{ color: "#8A7E5C" }}> · {hilo.contraparte}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>{fmtFechaCorreo(hilo.ultimo.creadoEn)}</div>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8A7E5C", cursor: "pointer" }} onClick={() => abrirHilo(hilo)}>
                  {hilo.ultimo.direccion === "entrante" ? "Recibido" : "Enviado"} · {hilo.ultimo.asunto || "(sin asunto)"}
                </p>

                {abierto && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E4DBC3", display: "grid", gap: 14 }}>
                    {(hilo.clienteId || hilo.prospectoId) && (
                      <button onClick={() => (hilo.clienteId ? onVerCliente(hilo.clienteId) : onVerProspecto(hilo.contraparte))}
                        style={{ ...botonSecundario, width: "auto", padding: "6px 14px", fontSize: 12.5, flex: "none", alignSelf: "flex-start" }}>
                        Ver ficha de {hilo.clienteId ? "cliente" : "prospecto"}
                      </button>
                    )}
                    {hilo.mensajes.map((m) => (
                      <div key={m.id}>
                        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: m.direccion === "entrante" ? "#D8ECDE" : "#F1DCD2", color: m.direccion === "entrante" ? "#2F6A46" : "#A85C3B" }}>
                            {m.direccion === "entrante" ? `De: ${m.remitente}` : `Para: ${m.destinatario}`}
                          </span>
                          <span style={{ fontSize: 12, color: "#8A7E5C" }}>{fmtFechaCorreo(m.creadoEn)}</span>
                        </div>
                        <CuerpoCorreo mensaje={m} />
                      </div>
                    ))}

                    <div style={{ borderTop: "1px solid #E4DBC3", paddingTop: 14 }} onClick={(e) => e.stopPropagation()}>
                      <textarea placeholder={`Responder a ${hilo.contraparte}…`} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
                        rows={3} style={{ ...input, marginBottom: 8, resize: "vertical" }} />
                      {errorEnvio && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: RUST }}>{errorEnvio}</p>}
                      <button onClick={() => enviarRespuesta(hilo)} disabled={!respuesta.trim() || enviando}
                        style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: !respuesta.trim() || enviando ? 0.5 : 1 }}>
                        {enviando ? "Enviando..." : "Enviar respuesta"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
// ---------- Alumnos (seguimiento de clases de adiestramiento) ----------
const TEMAS_ADIESTRAMIENTO_FLAT = TEMARIO_ADIESTRAMIENTO.flatMap((g) => g.temas);
function nombreTema(id) {
  return TEMAS_ADIESTRAMIENTO_FLAT.find((t) => t.id === id)?.nombre || id;
}

// Selector de temas agrupado por categoría — mismo botón-pastilla que ya
// usa TAGS_TEMPERAMENTO en mascotas, pero con encabezado de grupo. Se
// reusa tanto en la ficha de ingreso (temasObjetivo) como al marcar una
// clase (temas trabajados ese día).
function SelectorTemas({ seleccionados, onToggle, compacto = false }) {
  return (
    <>
      {TEMARIO_ADIESTRAMIENTO.map((grupo) => (
        <div key={grupo.grupo} style={{ marginBottom: compacto ? 6 : 10 }}>
          <p style={{ margin: "0 0 5px", fontSize: compacto ? 11.5 : 12.5, fontWeight: 600, color: INK }}>{grupo.grupo}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: compacto ? 5 : 6 }}>
            {grupo.temas.map((t) => {
              const activo = seleccionados.includes(t.id);
              return (
                <button key={t.id} type="button" onClick={() => onToggle(t.id)} aria-pressed={activo}
                  style={{ padding: compacto ? "4px 10px" : "6px 12px", borderRadius: 20, fontSize: compacto ? 11 : 12, cursor: "pointer",
                    border: activo ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                    background: activo ? NAVY : "#FFFFFF", color: activo ? CREAM : INK }}>
                  {t.nombre}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

function FormularioIngresoAlumno({ inicial, entrenadores, esEntrenador, nombreActual, onGuardar, onCancelar }) {
  const [form, setForm] = useState(() => inicial
    ? { id: inicial.id, nombre: inicial.nombre || "", perro: inicial.perro || "", telefono: inicial.telefono || "", email: inicial.email || "",
        comuna: inicial.comuna || "", edad: inicial.edad || "", adiestradorNombre: inicial.adiestradorNombre || (esEntrenador ? nombreActual : ""),
        temasObjetivo: inicial.temasObjetivo || [], fotoUrl: inicial.fotoUrl || null }
    : { nombre: "", perro: "", telefono: "", email: "", comuna: "", edad: "", adiestradorNombre: esEntrenador ? nombreActual : "", temasObjetivo: [], fotoUrl: null });
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const formInvalido = !form.nombre.trim() || !form.perro.trim();

  function toggleTema(id) {
    setForm((prev) => ({ ...prev, temasObjetivo: prev.temasObjetivo.includes(id) ? prev.temasObjetivo.filter((t) => t !== id) : [...prev.temasObjetivo, id] }));
  }

  async function subirFotoAlumno(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fotoUrl = await comprimirImagen(file);
    setForm((f) => ({ ...f, fotoUrl }));
  }

  function guardar() {
    setIntentoGuardar(true);
    if (formInvalido) return;
    onGuardar(form);
  }

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>{inicial ? "Editar ficha" : "Ficha de ingreso"}</h2>
      <p style={hint}>Datos del alumno y con qué objetivo llega — se usan para armar su caso de adiestramiento.</p>

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 16 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", flex: "none", background: form.fotoUrl ? `url(${form.fotoUrl}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
          {!form.fotoUrl && "Foto"}
        </div>
        <label style={{ ...botonSecundario, display: "inline-block", padding: "7px 12px", fontSize: 12, cursor: "pointer" }}>
          Subir foto
          <input type="file" accept="image/*" onChange={subirFotoAlumno} style={{ display: "none" }} />
        </label>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
        <div>
          <label style={label} htmlFor="alumno-perro">Nombre del perro</label>
          <input id="alumno-perro" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-tutor">Tutor</label>
          <input id="alumno-tutor" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={label} htmlFor="alumno-telefono">Teléfono</label>
          <input id="alumno-telefono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-email">Correo</label>
          <input id="alumno-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>
      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
        <div>
          <label style={label} htmlFor="alumno-comuna">Comuna</label>
          <input id="alumno-comuna" value={form.comuna} onChange={(e) => setForm({ ...form, comuna: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
        <div>
          <label style={label} htmlFor="alumno-edad">Edad del perro</label>
          <input id="alumno-edad" placeholder="Ej. 3 meses, 2 años" value={form.edad} onChange={(e) => setForm({ ...form, edad: e.target.value })} style={{ ...input, marginBottom: 0 }} />
        </div>
      </div>

      <p style={{ ...label, marginTop: 16 }}>Entrenador asignado</p>
      <select value={form.adiestradorNombre} disabled={esEntrenador} onChange={(e) => setForm({ ...form, adiestradorNombre: e.target.value })} style={{ ...input, marginBottom: 16 }}>
        <option value="">Sin asignar</option>
        {entrenadores.map((en) => <option key={en.id} value={en.nombre}>{en.nombre}</option>)}
      </select>

      <p style={label}>Servicio / objetivo de ingreso</p>
      <SelectorTemas seleccionados={form.temasObjetivo} onToggle={toggleTema} />

      {intentoGuardar && formInvalido && (
        <p style={{ color: RUST, fontSize: 12.5, margin: "10px 0 0" }}>Falta el nombre del perro y/o del tutor — son obligatorios para guardar.</p>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, marginTop: 0, opacity: intentoGuardar && formInvalido ? 0.6 : 1 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

function BarraProgreso({ pct }) {
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 4, background: "#EDE4CE", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", background: pct >= 100 ? "#2F6A46" : GOLD, borderRadius: 4 }} />
    </div>
  );
}

// Una fila del checklist ("Evaluación" o "Clase N") — el casillero es un
// toggle directo (clic = marcar hecha hoy / clic de nuevo = deshacer, sin
// pedir confirmación, como cualquier casillero de una lista de tareas).
// "+ Detalle" es aparte y opcional, para quien quiera anotar fecha
// distinta, qué se trabajó o alguna nota — no es obligatorio completarlo.
function FilaChecklist({ etiqueta, existente, onMarcarRapido, onDeshacer, onAbrirDetalle }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "6px 2px" }}>
      <button onClick={() => (existente ? onDeshacer() : onMarcarRapido())} aria-pressed={!!existente}
        title={existente ? "Deshacer" : "Marcar realizada"}
        style={{ width: 20, height: 20, borderRadius: 5, marginTop: 1, border: existente ? "none" : "1.5px solid #C9BE9E",
          background: existente ? "#2F6A46" : "#FFFFFF", color: "#FFFFFF", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", flex: "none", fontSize: 12, lineHeight: 1, padding: 0 }}>
        {existente ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, color: existente ? "#2F6A46" : INK, fontWeight: existente ? 600 : 400 }}>{etiqueta}</span>
        {existente && <span style={{ marginLeft: 8, fontSize: 11, color: "#8A7E5C" }}>{existente.fechaRealizada}</span>}
        {existente?.temas?.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
            {existente.temas.map((id) => <span key={id} style={{ fontSize: 10.5, padding: "1px 7px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>{nombreTema(id)}</span>)}
          </div>
        )}
        {existente?.notas && <p style={{ margin: "3px 0 0", fontSize: 11, color: "#8A7E5C" }}>{existente.notas}</p>}
      </div>
      <button onClick={onAbrirDetalle} title="Qué vio el entrenador, fecha, notas (opcional)"
        style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 11, flex: "none" }}>
        {existente ? "Editar" : "+ Detalle"}
      </button>
    </div>
  );
}

// Un plan de clases (planes_clases) con su checklist — "Evaluación" usa
// numero_clase=0 si el plan la incluye, "Clase 1..N" según numClases. El
// número de clases y si incluye evaluación se editan en cualquier
// momento (no dependen de una factura); vincular/desvincular una
// factura ya enviada es aparte, solo para referencia contable.
function PlanClases({ plan, boletasDisponibles, clasesDelPlan, marcarClase, deshacerClase, actualizarPlan, nombreActual }) {
  const [editando, setEditando] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(null);
  const [fechaForm, setFechaForm] = useState("");
  const [temasForm, setTemasForm] = useState([]);
  const [notasForm, setNotasForm] = useState("");

  const total = (plan.numClases || 0) + (plan.incluyeEvaluacion ? 1 : 0);
  const hechas = clasesDelPlan.length;
  const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
  const boletaVinculada = boletasDisponibles.find((b) => b._dbId === plan.boletaAdiestramientoId);

  function itemDe(numero) {
    return clasesDelPlan.find((cr) => cr.numeroClase === numero);
  }
  async function marcarRapido(numero) {
    await marcarClase(plan._dbId, numero, { fechaRealizada: new Date().toISOString().slice(0, 10), temas: [], notas: "", creadoPor: nombreActual });
  }
  function abrirDetalle(numero) {
    const existente = itemDe(numero);
    setDetalleAbierto(numero);
    setFechaForm(existente?.fechaRealizada || new Date().toISOString().slice(0, 10));
    setTemasForm(existente?.temas || []);
    setNotasForm(existente?.notas || "");
  }
  function toggleTemaForm(id) {
    setTemasForm((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  }
  async function guardarDetalle() {
    await marcarClase(plan._dbId, detalleAbierto, { fechaRealizada: fechaForm, temas: temasForm, notas: notasForm, creadoPor: nombreActual });
    setDetalleAbierto(null);
  }

  if (!plan._dbId) {
    return <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12 }}><p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Guardando plan…</p></div>;
  }

  return (
    <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY }}>{plan.nombre || `Plan de ${plan.numClases} clases`}</p>
          <p style={{ margin: "2px 0 0", fontSize: 11.5, color: "#8A7E5C" }}>
            {hechas}/{total} completado · {pct}%{boletaVinculada ? ` · vinculado a N°${String(boletaVinculada.numero).padStart(3, "0")}` : ""}
          </p>
        </div>
        <button onClick={() => setEditando((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600, flex: "none" }}>
          {editando ? "Cerrar" : "Editar"}
        </button>
      </div>
      <div style={{ marginTop: 8 }}>
        <BarraProgreso pct={pct} />
      </div>

      {editando && (
        <div style={{ marginTop: 12, background: CREAM_SOFT, borderRadius: 6, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <label style={{ fontSize: 12, color: "#6B6248" }}>Número de clases:</label>
            <button onClick={() => actualizarPlan({ numClases: Math.max(0, (plan.numClases || 0) - 1) })} style={{ ...botonSecundario, padding: "4px 10px" }}>−</button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 20, textAlign: "center" }}>{plan.numClases}</span>
            <button onClick={() => actualizarPlan({ numClases: (plan.numClases || 0) + 1 })} style={{ ...botonSecundario, padding: "4px 10px" }}>+</button>
            <span style={{ fontSize: 11, color: "#8A7E5C" }}>agregá una si el cliente compró clases de más</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: INK, cursor: "pointer" }}>
            <input type="checkbox" checked={!!plan.incluyeEvaluacion} onChange={(e) => actualizarPlan({ incluyeEvaluacion: e.target.checked })} />
            Incluye evaluación
          </label>
          <div>
            <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6B6248" }}>Vincular a factura ya enviada</p>
            <select value={plan.boletaAdiestramientoId || ""} onChange={(e) => actualizarPlan({ boletaAdiestramientoId: e.target.value || null })} style={{ ...input, marginBottom: 0 }}>
              <option value="">Sin vincular</option>
              {boletasDisponibles.map((b) => (
                <option key={b._dbId} value={b._dbId}>N°{String(b.numero).padStart(3, "0")} · {b.cliente}{b.perro ? ` (${b.perro})` : ""} · {b.numClases} clases · {fmtCLP(b.total)}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column" }}>
        {plan.incluyeEvaluacion && (
          <FilaChecklist etiqueta="Evaluación" existente={itemDe(0)} onMarcarRapido={() => marcarRapido(0)} onDeshacer={() => deshacerClase(plan._dbId, 0)} onAbrirDetalle={() => abrirDetalle(0)} />
        )}
        {Array.from({ length: plan.numClases || 0 }, (_, i) => i + 1).map((n) => (
          <FilaChecklist key={n} etiqueta={`Clase ${n}`} existente={itemDe(n)} onMarcarRapido={() => marcarRapido(n)} onDeshacer={() => deshacerClase(plan._dbId, n)} onAbrirDetalle={() => abrirDetalle(n)} />
        ))}
        {detalleAbierto !== null && (
          <div style={{ marginTop: 6, background: CREAM_SOFT, borderRadius: 6, padding: 10 }}>
            <input type="date" value={fechaForm} onChange={(e) => setFechaForm(e.target.value)} style={{ ...input, marginBottom: 8, width: 160 }} />
            <SelectorTemas seleccionados={temasForm} onToggle={toggleTemaForm} compacto />
            <input placeholder="Qué vio el entrenador / notas (opcional)" value={notasForm} onChange={(e) => setNotasForm(e.target.value)} style={{ ...input, marginBottom: 8, marginTop: 6 }} />
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={guardarDetalle} style={{ ...botonPrincipal, width: "auto", padding: "7px 14px", marginTop: 0 }}>Guardar</button>
              <button onClick={() => setDetalleAbierto(null)} style={botonSecundario}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormularioNuevoPlan({ boletasDisponibles, onCrear, onCancelar }) {
  const [nombre, setNombre] = useState("");
  const [numClases, setNumClases] = useState(4);
  const [incluyeEvaluacion, setIncluyeEvaluacion] = useState(false);
  const [boletaId, setBoletaId] = useState("");

  function crear() {
    onCrear({ nombre: nombre.trim() || null, numClases: Number(numClases) || 0, incluyeEvaluacion, boletaAdiestramientoId: boletaId || null });
  }

  return (
    <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, padding: 14, marginBottom: 12, background: CREAM_SOFT }}>
      <p style={{ ...label, marginBottom: 8 }}>Nuevo plan de clases</p>
      <input placeholder="Nombre (opcional, ej. Obediencia básica)" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...input, marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 12.5, color: "#6B6248" }}>Número de clases:</label>
        <input type="number" min="0" value={numClases} onChange={(e) => setNumClases(e.target.value)} style={{ ...input, marginBottom: 0, width: 80 }} />
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: INK, cursor: "pointer" }}>
          <input type="checkbox" checked={incluyeEvaluacion} onChange={(e) => setIncluyeEvaluacion(e.target.checked)} /> Incluye evaluación
        </label>
      </div>
      <p style={{ margin: "0 0 4px", fontSize: 12, color: "#6B6248" }}>Vincular a factura ya enviada (opcional)</p>
      <select value={boletaId} onChange={(e) => setBoletaId(e.target.value)} style={{ ...input, marginBottom: 12 }}>
        <option value="">Sin vincular</option>
        {boletasDisponibles.map((b) => (
          <option key={b._dbId} value={b._dbId}>N°{String(b.numero).padStart(3, "0")} · {b.cliente}{b.perro ? ` (${b.perro})` : ""} · {b.numClases} clases · {fmtCLP(b.total)}</option>
        ))}
      </select>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={crear} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Crear plan</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

function CasoAlumno({ cliente, planes, boletasAdiestramiento, clasesRealizadas, marcarClase, deshacerClase, actualizarPlan, crearPlan, nombreActual, esAdmin, onEditar, onEliminar, onToggleAccesoRapido, onVolver }) {
  const [creandoPlan, setCreandoPlan] = useState(false);
  const [confirmandoEliminar, setConfirmandoEliminar] = useState(false);

  // No se filtra por "es de este cliente" — Javier pidió ver las
  // facturas de adiestramiento recientes en general y elegir a mano,
  // porque el match automático por nombre/id puede fallar (ej. el
  // alumno se cargó con la ficha nueva y la factura se generó aparte
  // con el nombre escrito distinto). Se muestran las últimas ~30 sin
  // vincular a ningún plan todavía.
  const idsVinculados = new Set(planes.map((p) => p.boletaAdiestramientoId).filter(Boolean));
  const boletasRecientesSinVincular = boletasAdiestramiento
    .filter((b) => b._dbId && !idsVinculados.has(b._dbId))
    .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO))
    .slice(0, 30);

  return (
    <div>
      <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18 }}>← Volver a Alumnos</button>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", flex: "none", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, border: `2px solid ${CREAM_SOFT}` }} />
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 22, marginBottom: 2 }}>{cliente.perro}</h2>
              <p style={{ margin: 0, color: "#8A7E5C" }}>Tutor: {cliente.nombre} {cliente.telefono ? `· ${cliente.telefono}` : ""}</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cliente._dbId && (
              <button onClick={onToggleAccesoRapido} style={{ ...botonSecundario, color: cliente.accesoRapido ? GOLD : INK, borderColor: cliente.accesoRapido ? GOLD : "#DCD2B4" }}>
                {cliente.accesoRapido ? "★ Quitar de Inicio" : "☆ Agregar a Inicio"}
              </button>
            )}
            <button onClick={onEditar} style={botonSecundario}>Editar ficha</button>
            {esAdmin && cliente._dbId && (
              <button onClick={() => setConfirmandoEliminar(true)} style={{ ...botonSecundario, borderColor: RUST, color: RUST }}>Eliminar alumno</button>
            )}
          </div>
        </div>

        {confirmandoEliminar && (
          <ModalConfirmacion
            titulo={`¿Eliminar a ${cliente.perro}?`}
            mensaje={`Se borra la ficha de ${cliente.perro} y de su tutor ${cliente.nombre} — sus planes de clases, historial y datos de contacto quedan asociados a un alumno que ya no vas a poder ver ni editar.`}
            textoConfirmar="Eliminar alumno"
            onConfirmar={() => { onEliminar(); setConfirmandoEliminar(false); }}
            onCancelar={() => setConfirmandoEliminar(false)}
          />
        )}

        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20 }}>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Comuna</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.comuna || "Sin dato"}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Edad</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.edad || "Sin dato"}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
            <p style={{ ...label, marginBottom: 6 }}>Entrenador</p>
            <p style={{ margin: 0, color: NAVY, fontWeight: 600 }}>{cliente.adiestradorNombre || "Sin asignar"}</p>
          </div>
        </div>

        {(cliente.temasObjetivo || []).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <p style={label}>Objetivo de ingreso</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {cliente.temasObjetivo.map((id) => <span key={id} style={{ fontSize: 11.5, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: CREAM_SOFT, color: NAVY }}>{nombreTema(id)}</span>)}
            </div>
          </div>
        )}

        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <p style={{ ...label, margin: 0 }}>Planes de clases</p>
            {cliente._dbId && (
              <button onClick={() => setCreandoPlan((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {creandoPlan ? "Cancelar" : "+ Nuevo plan"}
              </button>
            )}
          </div>
          {!cliente._dbId ? (
            <p style={{ ...hint, marginTop: 8 }}>Guardando alumno…</p>
          ) : (
            <>
              {creandoPlan && (
                <FormularioNuevoPlan boletasDisponibles={boletasRecientesSinVincular}
                  onCrear={(datos) => { crearPlan(datos); setCreandoPlan(false); }}
                  onCancelar={() => setCreandoPlan(false)} />
              )}
              {planes.length === 0 && !creandoPlan ? (
                <p style={{ ...hint, marginTop: 8 }}>Todavía no tiene ningún plan de clases — usa "+ Nuevo plan".</p>
              ) : (
                planes.map((plan) => (
                  <PlanClases key={plan._dbId || plan.id} plan={plan}
                    boletasDisponibles={plan.boletaAdiestramientoId ? [...boletasRecientesSinVincular, ...boletasAdiestramiento.filter((b) => b._dbId === plan.boletaAdiestramientoId)] : boletasRecientesSinVincular}
                    clasesDelPlan={clasesRealizadas.filter((cr) => cr.planId === plan._dbId)}
                    marcarClase={marcarClase} deshacerClase={deshacerClase}
                    actualizarPlan={(cambios) => actualizarPlan(plan._dbId, cambios)}
                    nombreActual={nombreActual} />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Colores por tipo en el calendario — evaluación/clase vienen de
// citas_agenda, paseo es un ítem "virtual" derivado de
// clientes.diasHabituales (los paseos no viven en citas_agenda, son
// recurrentes por día de semana, no fechas puntuales).
const TIPOS_CALENDARIO_VISTA = [
  { id: "evaluacion", nombre: "Evaluaciones", bg: "#F3E3B4", color: "#8A6A1E" },
  { id: "clase", nombre: "Clases", bg: "#D8ECDE", color: "#2F6A46" },
  { id: "paseo", nombre: "Paseos", bg: "#D6E6EE", color: "#1E5A7A" },
];

// Convierte un cliente con paseo agendado un día dado en un ítem con la
// misma forma que una cita real, para poder mostrarlo y abrirlo en el
// mismo ModalDetalleCita — sin _dbId (no vive en citas_agenda), así que
// el modal nunca le ofrece el botón de eliminar. Se guarda lat/lng para
// poder ordenar el itinerario del día por cercanía geográfica.
function paseoComoItem(cliente, key, registroPaseos) {
  const registro = registroPaseos[`${cliente.id}_${key}`];
  return {
    id: `paseo-${cliente.id}-${key}`,
    clienteId: cliente.id,
    tipo: "paseo",
    clienteNombre: cliente.nombre,
    perro: cliente.perro,
    email: cliente.email,
    telefono: cliente.telefono,
    direccion: cliente.direccion,
    adiestrador: cliente.paseadorNombre,
    lat: cliente.lat,
    lng: cliente.lng,
    horaHabitual: cliente.horaHabitual || null,
    fechaISO: `${key}T00:00:00`,
    estado: registro?.realizado ? "realizada" : registro?.cancelado ? "cancelada" : "pendiente",
    notas: registro?.nota || "",
  };
}

function minutosDesdeHora(str) {
  const [h, m] = (str || "09:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function horaDesdeMinutos(mins) {
  const total = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function minutosDeISO(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

// Agrupa los ítems de un día por persona responsable (adiestrador o
// paseador — mismo campo "adiestrador" en el ítem) y arma un itinerario
// cronológico por persona: evaluaciones/clases usan su hora real; los
// paseos no tienen hora fija en el sistema (solo día de la semana), así
// que se apilan de forma estimada — ordenados por cercanía geográfica
// (mismo criterio que MapaRutas, ordenarRutaCercanoMasProximo) a partir
// de una hora de inicio configurable, con duración y trayecto fijos
// entre cliente y cliente.
function construirItinerarioDia(items, { horaInicioPaseos, duracionPaseoMin, trayectoMin }) {
  const porPersona = {};
  items.forEach((it) => {
    const persona = it.adiestrador || "Sin asignar";
    (porPersona[persona] = porPersona[persona] || []).push(it);
  });

  const grupos = Object.entries(porPersona).map(([persona, itemsPersona]) => {
    const citasReales = itemsPersona
      .filter((it) => it.tipo !== "paseo")
      .map((it) => ({ ...it, _inicioMin: minutosDeISO(it.fechaISO), _finMin: minutosDeISO(it.fechaISO) + (it.duracionMin || 60), _estimado: false }));

    const paseos = itemsPersona.filter((it) => it.tipo === "paseo");

    // Los paseos con hora habitual ya configurada en la ficha del cliente
    // (mismo campo cliente.horaHabitual que ya usa Mis paseos para ordenar
    // y marcar atrasos) van directo a esa hora, sin pasar por la estimación.
    const conHoraFija = paseos
      .filter((p) => p.horaHabitual)
      .map((p) => {
        const inicio = minutosDesdeHora(p.horaHabitual);
        return { ...p, _inicioMin: inicio, _finMin: inicio + duracionPaseoMin, _estimado: false };
      });

    // El resto se ordena por cercanía geográfica y se apila desde la
    // hora de inicio — misma estimación de siempre, marcada "estimado"
    // hasta que alguien le fije una hora real (arrastrando o con el +).
    const sinHora = paseos.filter((p) => !p.horaHabitual);
    const conGeo = sinHora.filter((p) => p.lat && p.lng);
    const sinGeo = sinHora.filter((p) => !(p.lat && p.lng));
    const paseosOrdenados = [...ordenarRutaCercanoMasProximo(conGeo), ...sinGeo];

    let cursor = minutosDesdeHora(horaInicioPaseos);
    const paseosEstimados = paseosOrdenados.map((p) => {
      const inicio = cursor;
      const fin = inicio + duracionPaseoMin;
      cursor = fin + trayectoMin;
      return { ...p, _inicioMin: inicio, _finMin: fin, _estimado: true };
    });

    const todos = [...citasReales, ...conHoraFija, ...paseosEstimados].sort((a, b) => a._inicioMin - b._inicioMin);
    return { persona, items: todos, inicioMin: todos[0]?._inicioMin ?? 0 };
  });

  return grupos.sort((a, b) => a.inicioMin - b.inicioMin);
}

// Ventana con el itinerario del día apilado por horario, agrupado por
// persona (paseador/adiestrador) — clic en un día del calendario. Las
// horas de paseo son una estimación (el sistema no guarda hora fija por
// cliente, solo el día de la semana), por eso quedan editables arriba.
function ModalItinerarioDia({ fechaLabel, diaKey, grupos, citasAgenda, setCitas, setClientes, horaInicioPaseos, setHoraInicioPaseos, duracionPaseoMin, setDuracionPaseoMin, trayectoMin, setTrayectoMin, onVerDetalle, onCerrar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 280, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-itinerario-titulo"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 640, width: "100%", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 4 }}>
          <h3 id="modal-itinerario-titulo" style={{ margin: 0, textTransform: "capitalize", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{fechaLabel}</h3>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ background: "none", border: "none", color: "#8A7E5C", fontSize: 18, cursor: "pointer", lineHeight: 1, padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: "0 0 16px", fontSize: 12, color: "#8A7E5C" }}>Evaluaciones y clases van a su hora agendada. Los paseos sin hora configurada se estiman en orden de cercanía a partir de la hora de inicio — arrastralos o tocá el + para fijarles una hora real, así queda guardada para la próxima vez.</p>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 18, padding: "10px 12px", background: CREAM_SOFT, borderRadius: 8 }}>
          <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
            Inicio paseos
            <input type="time" value={horaInicioPaseos} onChange={(e) => setHoraInicioPaseos(e.target.value)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 100 }} />
          </label>
          <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
            Duración paseo (min)
            <input type="number" min={5} step={5} value={duracionPaseoMin} onChange={(e) => setDuracionPaseoMin(Number(e.target.value) || 45)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 70 }} />
          </label>
          <label style={{ fontSize: 11.5, color: "#6B6248", display: "flex", flexDirection: "column", gap: 3 }}>
            Trayecto (min)
            <input type="number" min={0} step={5} value={trayectoMin} onChange={(e) => setTrayectoMin(Number(e.target.value) || 0)} style={{ ...input, margin: 0, padding: "5px 8px", fontSize: 13, width: 70 }} />
          </label>
        </div>

        {grupos.length === 0 ? (
          <p style={hint}>Sin actividades este día.</p>
        ) : (
          <GrillaHorariaDia grupos={grupos} onVerDetalle={onVerDetalle} diaKey={diaKey} citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes} />
        )}
      </div>
    </div>
  );
}

// Bloque individual arrastrable dentro de la grilla — mismos sensores
// (distancia mínima antes de activar el arrastre) que ya usa MapaRutas,
// así que un simple clic sigue abriendo el detalle normal y solo un
// arrastre de verdad mueve el horario.
function BloqueItinerario({ it, top, alto, tono, arrastrable, onVerDetalle }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: it.id, disabled: !arrastrable });
  return (
    <button ref={setNodeRef} {...(arrastrable ? { ...listeners, ...attributes } : {})} onClick={() => onVerDetalle(it)}
      style={{ position: "absolute", top, height: alto, left: 3, right: 3, border: "none", borderRadius: 6,
        background: tono?.bg || "#EDE4CE", color: tono?.color || INK, textAlign: "left",
        cursor: arrastrable ? (isDragging ? "grabbing" : "grab") : "pointer",
        padding: "3px 6px", overflow: "hidden", fontSize: 10.5, lineHeight: 1.3,
        boxShadow: isDragging ? "0 4px 12px rgba(0,0,0,0.3)" : "0 1px 2px rgba(0,0,0,0.1)",
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        zIndex: isDragging ? 5 : 1, touchAction: "none" }}>
      <div style={{ fontWeight: 700 }}>{horaDesdeMinutos(it._inicioMin)}–{horaDesdeMinutos(it._finMin)}</div>
      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🐾 {it.perro} · {it.clienteNombre}</div>
      {it._estimado && <div style={{ fontStyle: "italic", opacity: 0.8 }}>estimado</div>}
    </button>
  );
}

// Grilla de horario tipo calendario de día — una columna por persona,
// filas de una hora, cada actividad se dibuja como un bloque posicionado
// y alto según su hora de inicio y duración (mismo lenguaje visual que
// un Google Calendar de un día, para que se entienda de un vistazo).
// Cada bloque se puede arrastrar verticalmente para reacomodar el
// horario: una evaluación/clase agendada se reprograma de verdad
// (persiste en citas_agenda, validando choque de horario); un paseo sin
// hora configurada (bloque "estimado") arrastra o suma con el + para
// fijarle una hora habitual — eso se guarda en cliente.horaHabitual,
// el mismo campo que ya usa Mis paseos para ordenar y marcar atrasos,
// así queda configurado en el sistema y deja de depender de la
// estimación automática.
function GrillaHorariaDia({ grupos, onVerDetalle, diaKey, citasAgenda = [], setCitas, setClientes }) {
  const PX_POR_HORA = 56;
  const SNAP_MIN = 5;
  const [editandoHoraId, setEditandoHoraId] = useState(null);
  const sensoresGrilla = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const todosItems = grupos.flatMap((g) => g.items);
  const minInicio = todosItems.length ? Math.min(...todosItems.map((it) => it._inicioMin)) : 9 * 60;
  const maxFin = todosItems.length ? Math.max(...todosItems.map((it) => it._finMin)) : 18 * 60;
  const horaGridInicio = Math.min(8, Math.floor(minInicio / 60));
  const horaGridFin = Math.max(20, Math.ceil(maxFin / 60));
  const horas = [];
  for (let h = horaGridInicio; h < horaGridFin; h++) horas.push(h);
  const altoGrid = horas.length * PX_POR_HORA;

  function fijarHoraPaseo(clienteId, horaStr) {
    if (!setClientes || !clienteId || !horaStr) return;
    setClientes((prev) => prev.map((c) => (c.id === clienteId ? { ...c, horaHabitual: horaStr } : c)));
    showToast(`Hora de paseo guardada: ${horaStr}.`, "exito");
  }

  function onDragEnd(event) {
    const { active, delta } = event;
    if (!delta) return;
    const deltaMin = Math.round((delta.y / PX_POR_HORA) * 60 / SNAP_MIN) * SNAP_MIN;
    if (!deltaMin) return;

    const it = todosItems.find((x) => x.id === active.id);
    if (!it) return;
    const duracion = it._finMin - it._inicioMin;
    const nuevoInicio = Math.max(0, Math.min(it._inicioMin + deltaMin, 24 * 60 - duracion));
    if (nuevoInicio === it._inicioMin) return;

    if (it.tipo === "paseo") {
      fijarHoraPaseo(it.clienteId, horaDesdeMinutos(nuevoInicio));
      return;
    }

    if (!setCitas || !diaKey) return;
    const nuevaFecha = new Date(`${diaKey}T00:00:00`);
    nuevaFecha.setMinutes(nuevoInicio);
    const nuevaISO = nuevaFecha.toISOString();
    const otras = citasAgenda.filter((c) => c.id !== it.id);
    if (hayChoqueHorario(otras, it.adiestrador, nuevaISO, duracion)) {
      showToast(`${it.adiestrador} ya tiene otra cita agendada en ese horario.`);
      return;
    }
    setCitas((prev) => prev.map((c) => (c.id === it.id ? { ...c, fechaISO: nuevaISO } : c)));
    showToast(`Movido a las ${horaDesdeMinutos(nuevoInicio)}.`, "exito");
  }

  return (
    <DndContext sensors={sensoresGrilla} onDragEnd={onDragEnd}>
      <p style={{ margin: "0 0 10px", fontSize: 11, color: "#8A7E5C" }}>Arrastrá un bloque hacia arriba o abajo para moverlo de horario.</p>
      <div style={{ display: "flex", overflowX: "auto" }}>
        <div style={{ flex: "none", width: 42 }}>
          <div style={{ height: 26 }} />
          {horas.map((h) => (
            <div key={h} style={{ height: PX_POR_HORA, borderTop: "1px solid #EDE4CE", fontSize: 10.5, color: "#8A7E5C", paddingTop: 2 }}>
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {grupos.map((g) => (
          <div key={g.persona} style={{ flex: "1 0 150px", minWidth: 150, borderLeft: "1px solid #EDE4CE" }}>
            <div style={{ height: 26, fontSize: 11.5, fontWeight: 700, color: NAVY, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "0 4px" }}>
              {g.persona}
            </div>
            <div style={{ position: "relative", height: altoGrid, background: `repeating-linear-gradient(to bottom, transparent, transparent ${PX_POR_HORA - 1}px, #EDE4CE ${PX_POR_HORA - 1}px, #EDE4CE ${PX_POR_HORA}px)` }}>
              {g.items.map((it) => {
                const arrastrable = it.tipo === "paseo" || ["agendada", "pendiente"].includes(it.estado);
                const top = (it._inicioMin / 60 - horaGridInicio) * PX_POR_HORA;
                const puedeConfigurar = it.tipo === "paseo" && it._estimado && setClientes;
                return (
                  <div key={it.id}>
                    <BloqueItinerario it={it}
                      top={top}
                      alto={Math.max(((it._finMin - it._inicioMin) / 60) * PX_POR_HORA, 22)}
                      tono={TIPOS_CALENDARIO_VISTA.find((t) => t.id === it.tipo)}
                      arrastrable={arrastrable}
                      onVerDetalle={onVerDetalle} />
                    {puedeConfigurar && (
                      editandoHoraId === it.id ? (
                        <input type="time" step={300} autoFocus defaultValue={horaDesdeMinutos(it._inicioMin)}
                          onChange={(e) => { if (e.target.value) { fijarHoraPaseo(it.clienteId, e.target.value); setEditandoHoraId(null); } }}
                          onBlur={() => setEditandoHoraId(null)}
                          onKeyDown={(e) => { if (e.key === "Escape") setEditandoHoraId(null); }}
                          style={{ position: "absolute", top: top - 2, right: 3, width: 78, fontSize: 10, padding: "1px 2px", zIndex: 6, border: `1.5px solid ${NAVY}`, borderRadius: 4 }} />
                      ) : (
                        <button onClick={() => setEditandoHoraId(it.id)} title="Fijar hora real de este paseo"
                          style={{ position: "absolute", top: top - 5, right: 2, width: 17, height: 17, borderRadius: "50%", zIndex: 6,
                            border: `1.5px solid ${NAVY}`, background: "#FFFFFF", color: NAVY, fontSize: 11, fontWeight: 700, lineHeight: 1, cursor: "pointer", padding: 0 }}>
                          +
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </DndContext>
  );
}

// Calendario del mes con evaluaciones, clases y paseos — se usa tanto
// como sub-vista de Alumnos (con "onVolver") como pestaña propia
// "Calendario" en el menú (sin "onVolver", vista completa y celdas más
// grandes para que se divise bien). Los 3 tipos se pueden mostrar u
// ocultar por separado con las pastillas de arriba; con las 3 activas se
// ven todos juntos en el mismo calendario.
export function CalendarioAlumnos({ citasAgenda, setCitas, clientes = [], setClientes, registroPaseos = {}, rolActual, nombreActual, onVolver }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mesIdx, setMesIdx] = useState(hoy.getMonth());
  const [diaSel, setDiaSel] = useState(null);
  const [citaSel, setCitaSel] = useState(null);
  const [tiposVisibles, setTiposVisibles] = useState({ evaluacion: true, clase: true, paseo: true });
  const esEntrenador = rolActual === "entrenador";

  // Config del itinerario del día (hora de inicio de paseos, duración y
  // trayecto entre cliente y cliente) — se guarda en localStorage, mismo
  // criterio que howria_filtros_clientes, para no reconfigurar cada vez.
  const configItinerarioGuardada = (() => {
    try { return JSON.parse(localStorage.getItem("howria_itinerario_calendario") || "{}"); } catch { return {}; }
  })();
  const [horaInicioPaseos, setHoraInicioPaseos] = useState(configItinerarioGuardada.horaInicioPaseos || "09:00");
  const [duracionPaseoMin, setDuracionPaseoMin] = useState(configItinerarioGuardada.duracionPaseoMin || 45);
  const [trayectoMin, setTrayectoMin] = useState(configItinerarioGuardada.trayectoMin ?? 15);

  useEffect(() => {
    try { localStorage.setItem("howria_itinerario_calendario", JSON.stringify({ horaInicioPaseos, duracionPaseoMin, trayectoMin })); } catch {}
  }, [horaInicioPaseos, duracionPaseoMin, trayectoMin]);

  function toggleTipoVisible(id) {
    setTiposVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  const porDiaCitas = useMemo(() => {
    const filtradas = citasAgenda.filter((c) =>
      ((c.tipo === "evaluacion" && tiposVisibles.evaluacion) || (c.tipo === "clase" && tiposVisibles.clase)) &&
      (!esEntrenador || c.adiestrador === nombreActual));
    const mapa = {};
    filtradas.forEach((c) => {
      const key = fechaKey(new Date(c.fechaISO));
      (mapa[key] = mapa[key] || []).push(c);
    });
    return mapa;
  }, [citasAgenda, esEntrenador, nombreActual, tiposVisibles.evaluacion, tiposVisibles.clase]);

  // Mismo criterio que "Paseos de hoy" en Inicio: cualquier cliente con
  // ese día en diasHabituales, sin filtrar por estadoCliente.
  const clientesPaseo = useMemo(() =>
    clientes.filter((c) => c.tipoServicio?.includes("paseos") && (!esEntrenador || c.paseadorNombre === nombreActual)),
    [clientes, esEntrenador, nombreActual]);

  function itemsDelDia(key) {
    const dow = (new Date(key + "T00:00:00").getDay() + 6) % 7;
    const paseosDia = tiposVisibles.paseo ? clientesPaseo.filter((c) => c.diasHabituales?.includes(dow)).map((c) => paseoComoItem(c, key, registroPaseos)) : [];
    const citasDia = porDiaCitas[key] || [];
    return [...paseosDia, ...citasDia].sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  }

  const primerDiaMes = new Date(anio, mesIdx, 1);
  const diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
  const offset = (primerDiaMes.getDay() + 6) % 7; // 0 = lunes
  const celdas = [...Array(offset).fill(null), ...Array.from({ length: diasEnMes }, (_, i) => i + 1)];
  const nombreMes = primerDiaMes.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
  const gruposItinerario = diaSel ? construirItinerarioDia(itemsDelDia(diaSel), { horaInicioPaseos, duracionPaseoMin, trayectoMin }) : [];

  function cambiarMes(delta) {
    let m = mesIdx + delta, a = anio;
    if (m < 0) { m = 11; a--; } else if (m > 11) { m = 0; a++; }
    setMesIdx(m); setAnio(a); setDiaSel(null);
  }

  return (
    <div>
      {onVolver && <button onClick={onVolver} style={{ ...botonSecundario, marginBottom: 18 }}>← Volver a Alumnos</button>}
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ ...sectionTitle, textTransform: "capitalize", fontSize: 20 }}>{nombreMes}</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => cambiarMes(-1)} style={botonSecundario}>←</button>
            <button onClick={() => cambiarMes(1)} style={botonSecundario}>→</button>
          </div>
        </div>
        <p style={{ ...hint, marginTop: -8, marginBottom: 14 }}>Clientes por atender este mes — clic en un día para ver el itinerario completo, o directo en un nombre para ver ese detalle.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {TIPOS_CALENDARIO_VISTA.map((t) => {
            const activo = tiposVisibles[t.id];
            return (
              <button key={t.id} onClick={() => toggleTipoVisible(t.id)}
                style={{ padding: "6px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                  border: activo ? `1.5px solid ${t.color}` : "1px solid #DCD2B4",
                  background: activo ? t.bg : "#FFFFFF", color: activo ? t.color : "#8A7E5C", fontWeight: activo ? 600 : 400 }}>
                {t.nombre}
              </button>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, fontSize: 12, color: "#8A7E5C", textAlign: "center", marginBottom: 8 }}>
          {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => <span key={d}>{d}</span>)}
        </div>
        <div className="howria-cal-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {celdas.map((dia, i) => {
            if (!dia) return <div key={`vacio-${i}`} />;
            const key = fechaKey(new Date(anio, mesIdx, dia));
            const itemsDia = itemsDelDia(key);
            const esHoy = key === fechaKey(hoy);
            return (
              <div key={key} className="howria-cal-celda" role="button" tabIndex={0}
                onClick={() => setDiaSel(key)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDiaSel(key); } }}
                style={{ borderRadius: 8, border: diaSel === key ? `1.5px solid ${NAVY}` : esHoy ? `1.5px solid ${GOLD}` : "1px solid #EDE4CE",
                  background: itemsDia.length > 0 ? "#FBF6E9" : "#FFFFFF", padding: 6, display: "flex", flexDirection: "column", gap: 3, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 12, fontWeight: esHoy ? 700 : 400, color: esHoy ? GOLD : INK }}>{dia}</span>
                  {itemsDia.length > 0 && <span className="howria-cal-punto" style={{ width: 7, height: 7, borderRadius: "50%", background: GOLD, flex: "none" }} />}
                </div>
                <div className="howria-cal-nombres" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                  {itemsDia.slice(0, 2).map((c) => {
                    const tono = TIPOS_CALENDARIO_VISTA.find((t) => t.id === c.tipo);
                    return (
                      <button key={c.id} onClick={(e) => { e.stopPropagation(); setCitaSel(c); }}
                        style={{ border: "none", background: tono?.bg || "#EDE4CE", color: tono?.color || INK,
                          borderRadius: 4, padding: "2px 5px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.perro}
                      </button>
                    );
                  })}
                  {itemsDia.length > 2 && (
                    <span style={{ fontSize: 10, color: "#8A7E5C", paddingLeft: 5 }}>+{itemsDia.length - 2} más</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {diaSel && (
        <ModalItinerarioDia
          fechaLabel={new Date(diaSel + "T00:00:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}
          diaKey={diaSel}
          grupos={gruposItinerario}
          citasAgenda={citasAgenda} setCitas={setCitas} setClientes={setClientes}
          horaInicioPaseos={horaInicioPaseos} setHoraInicioPaseos={setHoraInicioPaseos}
          duracionPaseoMin={duracionPaseoMin} setDuracionPaseoMin={setDuracionPaseoMin}
          trayectoMin={trayectoMin} setTrayectoMin={setTrayectoMin}
          onVerDetalle={(it) => setCitaSel(it)}
          onCerrar={() => setDiaSel(null)}
        />
      )}
      {citaSel && <ModalDetalleCita cita={citaSel} onCerrar={() => setCitaSel(null)} onEliminar={setCitas ? (dbId) => eliminarCita(setCitas, dbId) : undefined} />}
    </div>
  );
}

// Una fila de la lista de alumnos — foto chica, comuna, último tema
// trabajado y barra de progreso. Función normal (no componente JSX vía
// tag) para que no se re-monte en cada render, mismo criterio que
// renderFilaFactura en Facturas.
function renderFilaAlumno(a, onAbrir) {
  const c = a.cliente;
  return (
    <button key={c.id} onClick={() => onAbrir(c)}
      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", padding: "10px 14px", borderRadius: 8, border: "1px solid #EDE4CE", background: "#FFFFFF", marginBottom: 8, cursor: "pointer", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontWeight: 600, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.perro} <span style={{ fontWeight: 400, color: "#8A7E5C" }}>· {c.nombre}</span></p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>{c.comuna || "Sin comuna"}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 12.5, flex: "none" }}>
        <span style={{ color: "#8A7E5C" }}>{a.ultimaClase?.temas?.[0] ? nombreTema(a.ultimaClase.temas[0]) : a.total > 0 ? "Sin clases aún" : "Sin plan"}</span>
        {a.total > 0 && (
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 46 }}><BarraProgreso pct={a.pct} /></span>
            <span style={{ minWidth: 30, textAlign: "right" }}>{a.pct}%</span>
          </span>
        )}
      </div>
    </button>
  );
}

export function Alumnos({ clientes, setClientes, boletasAdiestramiento, usuarios, citasAgenda, setCitas, registroPaseos = {}, planesClases, setPlanesClases, cargandoPlanesClases, clasesRealizadas, marcarClase, deshacerClase, cargandoClasesRealizadas, rolActual, nombreActual, esAdmin, saltarAlumnoDbId, limpiarSaltoAlumno }) {
  const [vista, setVista] = useState("lista"); // "lista" | "ingreso" | "caso" | "calendario"
  const [clienteSelId, setClienteSelId] = useState(null);
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const esEntrenador = rolActual === "entrenador";
  const entrenadores = usuarios.filter((u) => u.rol === "entrenador");

  const misAlumnos = useMemo(() => {
    return clientes.filter((c) => c.tipoServicio?.includes("clases"))
      .filter((c) => !esEntrenador || c.adiestradorNombre === nombreActual)
      .sort((a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es"));
  }, [clientes, esEntrenador, nombreActual]);

  const clienteSel = clientes.find((c) => c.id === clienteSelId) || null;

  // Salto desde "Accesos directos" en el Inicio del entrenador — mismo
  // patrón que saltarClienteDbId (Mail → Clientes).
  useEffect(() => {
    if (!saltarAlumnoDbId) return;
    const c = clientes.find((x) => x._dbId === saltarAlumnoDbId);
    if (c) { setClienteSelId(c.id); setVista("caso"); }
    limpiarSaltoAlumno?.();
  }, [saltarAlumnoDbId, clientes]);

  function guardarAlumno(datos) {
    const id = datos.id || Date.now();
    if (datos.id) {
      setClientes((prev) => prev.map((c) => (c.id === datos.id ? { ...c, ...datos } : c)));
    } else {
      const nuevo = {
        nombre: "", perro: "", telefono: "", email: "", comuna: "", edad: "", adiestradorNombre: "", temasObjetivo: [],
        diasHabituales: [], tipoServicio: ["clases"], estadoCliente: "activo",
        ...datos, id,
      };
      setClientes((prev) => [...prev, nuevo]);
    }
    setClienteSelId(id);
    setVista("caso");
  }

  function actualizarPlan(planDbId, cambios) {
    setPlanesClases((prev) => prev.map((p) => (p._dbId === planDbId ? { ...p, ...cambios } : p)));
  }
  function crearPlan(cliente, datos) {
    setPlanesClases((prev) => [...prev, { ...datos, clienteId: cliente._dbId, creadoPor: nombreActual, id: Date.now() }]);
  }
  function toggleAccesoRapido(cliente) {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, accesoRapido: !c.accesoRapido } : c)));
  }
  function eliminarAlumno(cliente) {
    setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
    setVista("lista");
  }

  if (vista === "ingreso") {
    return <FormularioIngresoAlumno inicial={clienteSel} entrenadores={entrenadores} esEntrenador={esEntrenador} nombreActual={nombreActual}
      onGuardar={guardarAlumno} onCancelar={() => setVista(clienteSel ? "caso" : "lista")} />;
  }
  if (vista === "caso" && clienteSel) {
    return <CasoAlumno cliente={clienteSel}
      planes={planesClases.filter((p) => p.clienteId === clienteSel._dbId)}
      boletasAdiestramiento={boletasAdiestramiento}
      clasesRealizadas={clasesRealizadas} marcarClase={marcarClase} deshacerClase={deshacerClase}
      actualizarPlan={actualizarPlan} crearPlan={(datos) => crearPlan(clienteSel, datos)}
      nombreActual={nombreActual} esAdmin={esAdmin}
      onToggleAccesoRapido={() => toggleAccesoRapido(clienteSel)}
      onEliminar={() => eliminarAlumno(clienteSel)}
      onEditar={() => setVista("ingreso")} onVolver={() => setVista("lista")} />;
  }
  if (vista === "calendario") {
    return <CalendarioAlumnos citasAgenda={citasAgenda} setCitas={setCitas} clientes={clientes} setClientes={setClientes} registroPaseos={registroPaseos} rolActual={rolActual} nombreActual={nombreActual} onVolver={() => setVista("lista")} />;
  }

  const alumnosConProgreso = misAlumnos.map((c) => {
    const planes = planesClases.filter((p) => p.clienteId === c._dbId);
    const clases = clasesRealizadas.filter((cr) => planes.some((p) => p._dbId === cr.planId));
    const total = planes.reduce((acc, p) => acc + (p.numClases || 0) + (p.incluyeEvaluacion ? 1 : 0), 0);
    const hechas = clases.length;
    const pct = total > 0 ? Math.round((hechas / total) * 100) : 0;
    const completo = planes.length > 0 && total > 0 && hechas >= total;
    const ultimaClase = [...clases].sort((x, y) => new Date(y.fechaRealizada) - new Date(x.fechaRealizada))[0];
    return { cliente: c, total, hechas, pct, completo, ultimaClase };
  });
  const alumnosActivos = alumnosConProgreso.filter((a) => !a.completo);
  const alumnosHistorial = alumnosConProgreso.filter((a) => a.completo);
  const abrirCaso = (c) => { setClienteSelId(c.id); setVista("caso"); };

  return (
    <div className="howria-card" style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={sectionTitle}>Alumnos</h2>
          <p style={hint}>Seguimiento de clases de adiestramiento — quiénes son tus alumnos actuales y qué se ha trabajado con cada uno.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flex: "none" }}>
          <button onClick={() => setVista("calendario")} style={botonSecundario}>Calendario</button>
          <button onClick={() => { setClienteSelId(null); setVista("ingreso"); }} style={botonPrincipal}>+ Nuevo alumno</button>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {(cargandoClasesRealizadas || cargandoPlanesClases) ? (
          <p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando…</p>
        ) : alumnosConProgreso.length === 0 ? (
          <p style={hint}>No hay alumnos todavía — usa "+ Nuevo alumno" para cargar el primero.</p>
        ) : (
          <>
            {alumnosActivos.length === 0 ? (
              <p style={hint}>No hay alumnos activos — todos están en el historial de abajo.</p>
            ) : (
              alumnosActivos.map((a) => renderFilaAlumno(a, abrirCaso))
            )}

            {alumnosHistorial.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <button onClick={() => setHistorialAbierto((v) => !v)} style={{ ...botonSecundario, width: "auto" }}>
                  {historialAbierto ? "▾" : "▸"} Historial de alumnos ({alumnosHistorial.length})
                </button>
                {historialAbierto && (
                  <div style={{ marginTop: 10 }}>
                    {alumnosHistorial.map((a) => renderFilaAlumno(a, abrirCaso))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Seguimiento de prospectos (ventas) ----------
const PROSPECTO_VACIO = { nombre: "", telefono: "", perro: "", direccion: "", origen: "Instagram", tipoServicio: ["paseos"], estado: "nuevo", proximoSeguimiento: "", asignadoA: "", bitacora: [] };

export function Prospectos({ prospectos, setProspectos, setClientes, usuarios, permisosRoles, cargando, correos = [], enfoqueEmail, limpiarEnfoque, rolActual }) {
  // El entrenador ve y da seguimiento a los prospectos de sus propias
  // citas (RLS scoped, ver database/055), pero no crea prospectos nuevos
  // a mano ni los elimina — eso sigue siendo trabajo de coordinador/
  // administrador. Sin esto, tocar esos botones fallaría en silencio
  // contra la política de Postgres en vez de explicar por qué.
  const puedeCrearYEliminar = rolActual !== "entrenador";
  // Solo tiene sentido ofrecer como "responsable" a alguien que de verdad
  // puede entrar a esta pestaña — si permisosRoles todavía no cargó, se
  // muestra la lista completa para no dejar el selector vacío mientras tanto.
  const usuariosConAccesoSeguimiento = permisosRoles ? usuarios.filter((u) => permisosRoles[u.rol]?.includes("seguimiento")) : usuarios;
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(PROSPECTO_VACIO);
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [busqueda, setBusqueda] = useState("");
  const [intentoCrear, setIntentoCrear] = useState(false);

  useEffect(() => {
    if (!enfoqueEmail) return;
    setBusqueda(enfoqueEmail);
    limpiarEnfoque();
  }, [enfoqueEmail]);

  function crearProspecto() {
    setIntentoCrear(true);
    if (!form.nombre.trim() || !form.telefono.trim()) return;
    setProspectos((prev) => [...prev, { ...form, id: Date.now(), nombre: form.nombre.trim() }]);
    setForm(PROSPECTO_VACIO);
    setMostrarForm(false);
    setIntentoCrear(false);
  }

  function actualizarCampo(id, campo, valor) {
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  function agregarNotaProspecto(id, texto) {
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, bitacora: [...p.bitacora, { creadoEn: new Date().toISOString(), texto }] } : p)));
  }

  function eliminarProspecto(id) {
    setProspectos((prev) => prev.filter((p) => p.id !== id));
  }

  function convertirACliente(p) {
    setClientes((prev) => [...prev, {
      id: Date.now(), nombre: p.nombre, perro: p.perro || "Sin nombre", telefono: p.telefono, email: p.email || null,
      valorPaseoRef: 0, raza: "", pesoKg: 0, fotoUrl: null, diasHabituales: [], planHabitual: "LV",
      objetivos: "", paseadorNombre: "", tarifaPaseador: 0, direccion: p.direccion || "", lat: null, lng: null, tipoServicio: p.tipoServicio,
    }]);
    setProspectos((prev) => prev.filter((x) => x.id !== p.id));
  }

  const hoyStr = fechaKey(new Date());
  const esVencido = (p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido";
  const busquedaLimpia = busqueda.trim().toLowerCase();

  const listaFiltrada = prospectos
    .filter((p) => {
      if (busquedaLimpia) {
        return p.nombre.toLowerCase().includes(busquedaLimpia)
          || (p.telefono || "").toLowerCase().includes(busquedaLimpia)
          || (p.perro || "").toLowerCase().includes(busquedaLimpia)
          || (p.email || "").toLowerCase().includes(busquedaLimpia);
      }
      if (filtroEstado === "todos") return true;
      if (filtroEstado === "activos") return p.estado !== "ganado" && p.estado !== "perdido";
      if (filtroEstado === "vencidos") return esVencido(p);
      return p.estado === filtroEstado;
    })
    .sort((a, b) => (a.proximoSeguimiento || "9999").localeCompare(b.proximoSeguimiento || "9999"));

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando prospectos…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Seguimiento de prospectos</h2>
            <p style={hint}>Para no perder el hilo de una conversación de venta — cada contacto de campaña queda con su estado y notas.</p>
          </div>
          {puedeCrearYEliminar && (
            <button onClick={() => { setMostrarForm((v) => !v); setIntentoCrear(false); }} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>
              {mostrarForm ? "Cancelar" : "+ Nuevo prospecto"}
            </button>
          )}
        </div>

        {mostrarForm && puedeCrearYEliminar && (
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 18, margin: "16px 0" }}>
            <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <input placeholder="Nombre" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <input placeholder="Teléfono / WhatsApp" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <input placeholder="Nombre del perro (si lo sabes)" value={form.perro} onChange={(e) => setForm({ ...form, perro: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <select value={form.origen} onChange={(e) => setForm({ ...form, origen: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                {ORIGENES_PROSPECTO.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
              <input type="date" value={form.proximoSeguimiento} onChange={(e) => setForm({ ...form, proximoSeguimiento: e.target.value })} style={{ ...input, marginBottom: 0 }} />
              <select value={form.asignadoA} onChange={(e) => setForm({ ...form, asignadoA: e.target.value })} style={{ ...input, marginBottom: 0 }}>
                <option value="">Sin asignar</option>
                {usuariosConAccesoSeguimiento.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
              <input placeholder="Dirección (si la sabes)" value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                style={{ ...input, marginBottom: 0, gridColumn: "1 / -1" }} />
            </div>
            <p style={{ ...label, marginTop: 12 }} id="prospecto-interes-label">Interés en</p>
            <div role="group" aria-labelledby="prospecto-interes-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {TIPOS_SERVICIO.map((t) => (
                <button key={t.id} type="button" onClick={() => setForm((f) => ({ ...f, tipoServicio: f.tipoServicio.includes(t.id) ? f.tipoServicio.filter((x) => x !== t.id) : [...f.tipoServicio, t.id] }))} aria-pressed={form.tipoServicio.includes(t.id)}
                  style={{ padding: "7px 13px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                    border: form.tipoServicio.includes(t.id) ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                    background: form.tipoServicio.includes(t.id) ? NAVY : "#FFFFFF", color: form.tipoServicio.includes(t.id) ? CREAM : INK }}>
                  {t.nombre}
                </button>
              ))}
            </div>
            {intentoCrear && (!form.nombre.trim() || !form.telefono.trim()) && (
              <p style={{ color: RUST, fontSize: 12.5, margin: "0 0 10px" }}>
                {!form.nombre.trim() ? "Falta el nombre del prospecto" : "Falta el teléfono"} — es obligatorio para guardar, así queda alguna forma de contactarlo después.
              </p>
            )}
            <button onClick={crearProspecto} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px", marginTop: 0, opacity: intentoCrear && (!form.nombre.trim() || !form.telefono.trim()) ? 0.6 : 1 }}>Guardar prospecto</button>
          </div>
        )}

        <div style={{ position: "relative", marginTop: 16, maxWidth: 340 }}>
          <Search size={15} color="#B0A587" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
          <input placeholder="Buscar por nombre, teléfono o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            style={{ ...input, margin: 0, width: "100%", paddingLeft: 34 }} />
        </div>
        <p style={{ ...hint, marginTop: 6 }}>La búsqueda revisa todos los prospectos guardados, sin importar su estado — útil para encontrar un contacto o cliente pasado.</p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10, opacity: busquedaLimpia ? 0.4 : 1, pointerEvents: busquedaLimpia ? "none" : "auto" }}>
          <button onClick={() => setFiltroEstado("activos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "activos" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: filtroEstado === "activos" ? NAVY : "#FFFFFF", color: filtroEstado === "activos" ? CREAM : INK }}>
            Activos ({prospectos.filter((p) => p.estado !== "ganado" && p.estado !== "perdido").length})
          </button>
          <button onClick={() => setFiltroEstado("vencidos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "vencidos" ? `1.5px solid ${RUST}` : "1px solid #DCD2B4",
              background: filtroEstado === "vencidos" ? RUST : "#FFFFFF", color: filtroEstado === "vencidos" ? "#FFFFFF" : RUST, fontWeight: 600 }}>
            ⚠️ Vencidos ({prospectos.filter(esVencido).length})
          </button>
          <button onClick={() => setFiltroEstado("todos")}
            style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
              border: filtroEstado === "todos" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
              background: filtroEstado === "todos" ? NAVY : "#FFFFFF", color: filtroEstado === "todos" ? CREAM : INK }}>
            Todos ({prospectos.length})
          </button>
          {ESTADOS_PROSPECTO.map((e) => (
            <button key={e.id} onClick={() => setFiltroEstado(e.id)}
              style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
                border: filtroEstado === e.id ? `1.5px solid ${e.color}` : "1px solid #DCD2B4",
                background: filtroEstado === e.id ? e.bg : "#FFFFFF", color: e.color }}>
              {e.nombre} ({prospectos.filter((p) => p.estado === e.id).length})
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {listaFiltrada.map((p) => {
          const est = ESTADOS_PROSPECTO.find((e) => e.id === p.estado) || ESTADOS_PROSPECTO[0];
          const vencido = esVencido(p);
          return (
            <div key={p.id} className="howria-card" style={{ ...tarjeta, borderLeft: vencido ? `4px solid ${RUST}` : "4px solid transparent" }}>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                <div>
                  <b style={{ color: NAVY, fontSize: 15 }}>{p.nombre}</b>
                  <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: est.bg, color: est.color }}>{est.nombre}</span>
                  <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8A7E5C" }}>
                    {p.telefono || "sin teléfono"} {p.email && `· ${p.email}`} {p.perro && `· 🐾 ${p.perro}`} · {p.origen}
                    {p.tipoServicio?.length > 0 && ` · interés: ${p.tipoServicio.map((t) => TIPOS_SERVICIO.find((x) => x.id === t)?.nombre).join(", ")}`}
                  </p>
                  {p.direccion && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>📍 {p.direccion}</p>}
                  <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>
                    Responsable: <b style={{ color: p.asignadoA ? NAVY : "#8A7E5C" }}>{p.asignadoA || "sin asignar"}</b>
                  </p>
                  {p.proximoSeguimiento && (
                    <p style={{ margin: "4px 0 0", fontSize: 12.5, fontWeight: 600, color: vencido ? RUST : "#8A7E5C" }}>
                      {vencido ? "⚠️ Seguimiento vencido" : "Próximo seguimiento"}: {new Date(p.proximoSeguimiento + "T00:00:00").toLocaleDateString("es-CL")}
                    </p>
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                  <select value={p.estado} onChange={(e) => actualizarCampo(p.id, "estado", e.target.value)}
                    style={{ border: "none", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: est.bg, color: est.color }}>
                    {ESTADOS_PROSPECTO.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  <input type="date" value={p.proximoSeguimiento || ""} onChange={(e) => actualizarCampo(p.id, "proximoSeguimiento", e.target.value)}
                    style={{ ...input, marginBottom: 0, padding: "6px 10px", fontSize: 12.5, width: 150 }} />
                  <select value={p.asignadoA || ""} onChange={(e) => actualizarCampo(p.id, "asignadoA", e.target.value)}
                    style={{ ...input, marginBottom: 0, padding: "6px 10px", fontSize: 12.5, width: 150 }}>
                    <option value="">Sin asignar</option>
                    {usuariosConAccesoSeguimiento.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14, background: CREAM_SOFT, borderRadius: 8, padding: 12 }}>
                <p style={{ ...label, marginBottom: 8 }}>Historial — notas y correos</p>
                <HistorialUnificado notas={p.bitacora} onAgregarNota={(texto) => agregarNotaProspecto(p.id, texto)}
                  correos={p._dbId ? correos.filter((c) => c.prospectoId === p._dbId) : []}
                  placeholderNota="Ej. quedó en confirmar el jueves..." />
              </div>

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {p.estado === "ganado" && puedeCrearYEliminar && (
                  <button onClick={() => convertirACliente(p)} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Convertir a cliente</button>
                )}
                {puedeCrearYEliminar && (
                  <BotonEliminar onConfirm={() => eliminarProspecto(p.id)} label="Eliminar prospecto" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
                )}
              </div>
            </div>
          );
        })}
        {listaFiltrada.length === 0 && (
          <div className="howria-card" style={tarjeta}><p style={{ ...hint, margin: 0 }}>No hay prospectos en este filtro.</p></div>
        )}
      </div>
    </div>
  );
}
// ---------- Acciones compartidas sobre boletas (paseo o adiestramiento) ----------
// Identifican la boleta por _dbId (id interno, estable) y no por "numero"
// — ese campo es editable a mano y no está garantizado único en la base,
// así que dos boletas con el mismo número habrían aplicado la acción a
// ambas a la vez si se matcheaba por numero. Sin dbId no hay manera
// confiable de saber a cuál boleta se refiere (ej. recién creada, todavía
// sin volver de Supabase) — mejor no hacer nada que arriesgar matchear de
// más (varias boletas sin _dbId, todas comparando undefined === undefined).
function aceptarBoleta(setBoletas, dbId) {
  if (!dbId) return;
  setBoletas((prev) => prev.map((b) => (b._dbId === dbId ? { ...b, estado: "pendiente_pago" } : b)));
}

function eliminarBoleta(setBoletas, dbId) {
  if (!dbId) return;
  setBoletas((prev) => prev.filter((b) => b._dbId !== dbId));
}

function eliminarCita(setCitas, dbId) {
  if (!dbId) return;
  setCitas((prev) => prev.filter((c) => c._dbId !== dbId));
}

function editarBoleta(setBoletas, dbId, cambios) {
  if (!dbId) return;
  setBoletas((prev) => prev.map((b) => (b._dbId === dbId ? { ...b, ...cambios } : b)));
}

// Genera el PDF de una boleta (paseo o adiestramiento) al vuelo, sobre un
// canvas descartable — no hay archivos guardados en ningún lado, se arma
// desde los datos de la boleta cada vez que se pide.
async function descargarPdfBoleta(boleta, tipo, sufijo = "") {
  const logoImg = new Image();
  const huellaImg = new Image();
  await Promise.all([
    new Promise((resolve) => { logoImg.onload = resolve; logoImg.onerror = resolve; logoImg.src = LOGO_B64; }),
    new Promise((resolve) => { huellaImg.onload = resolve; huellaImg.onerror = resolve; huellaImg.src = HUELLA_B64; }),
  ]);
  const fuentes = tipo === "paseo"
    ? ["700 23px Fraunces", "600 19px Fraunces", "600 14px Fraunces", "13px Inter", "600 13px Inter"]
    : ["700 27px Fraunces", "700 19px Fraunces", "13px Inter"];
  if (document.fonts?.ready) {
    await Promise.all(fuentes.map((f) => document.fonts.load(f))).then(() => document.fonts.ready).catch(() => {});
  }
  const canvas = document.createElement("canvas");
  if (tipo === "paseo") dibujarBoleta(canvas, boleta, logoImg, huellaImg);
  else dibujarBoletaAdiestramiento(canvas, boleta, logoImg, huellaImg);
  const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  const prefijo = tipo === "paseo" ? "Boleta" : "Boleta-Adiestramiento";
  const link = document.createElement("a");
  link.download = `${prefijo}-${String(boleta.numero).padStart(3, "0")}-${boleta.cliente.replace(/\s+/g, "-")}${sufijo}.pdf`;
  link.href = URL.createObjectURL(doc.output("blob"));
  link.click();
}

function EditorBoletaBasico({ boleta, tipo, onGuardar, onCancelar }) {
  const [total, setTotal] = useState(boleta.total);
  const [mensaje, setMensaje] = useState(boleta.mensajePersonalizado || "");
  const [mes, setMes] = useState(boleta.mes || MESES[0]);
  const [anio, setAnio] = useState(boleta.anio || new Date().getFullYear());
  const [montoResponsable, setMontoResponsable] = useState(boleta.montoResponsable ?? boleta.total);

  function guardar() {
    const cambios = { total: Number(total) || 0, mensajePersonalizado: mensaje.trim() || null };
    if (tipo === "paseo") { cambios.mes = mes; cambios.anio = Number(anio) || boleta.anio; }
    if (tipo === "adiestramiento") { cambios.montoResponsable = Number(montoResponsable) || 0; }
    onGuardar(cambios);
  }

  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 140px" }}>
          <label style={label} htmlFor={`editar-boleta-total-${tipo}-${boleta.numero}`}>Total</label>
          <input id={`editar-boleta-total-${tipo}-${boleta.numero}`} type="number" min="0" value={total}
            onChange={(e) => setTotal(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>
        {tipo === "paseo" && (
          <>
            <div style={{ flex: "1 1 140px" }}>
              <label style={label} htmlFor={`editar-boleta-mes-${boleta.numero}`}>Mes</label>
              <select id={`editar-boleta-mes-${boleta.numero}`} value={mes} onChange={(e) => setMes(e.target.value)} style={{ ...input, marginBottom: 0 }}>
                {MESES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div style={{ flex: "0 1 100px" }}>
              <label style={label} htmlFor={`editar-boleta-anio-${boleta.numero}`}>Año</label>
              <input id={`editar-boleta-anio-${boleta.numero}`} type="number" value={anio}
                onChange={(e) => setAnio(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
          </>
        )}
        {tipo === "adiestramiento" && (
          <div style={{ flex: "1 1 200px" }}>
            <label style={label} htmlFor={`editar-boleta-monto-responsable-${boleta.numero}`}>Monto para el responsable</label>
            <input id={`editar-boleta-monto-responsable-${boleta.numero}`} type="number" min="0" value={montoResponsable}
              onChange={(e) => setMontoResponsable(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            <p style={{ ...hint, margin: "4px 0 0" }}>Para Howria: {fmtCLP((Number(total) || 0) - (Number(montoResponsable) || 0))}</p>
          </div>
        )}
      </div>
      <div>
        <label style={label} htmlFor={`editar-boleta-mensaje-${tipo}-${boleta.numero}`}>Mensaje personalizado</label>
        <input id={`editar-boleta-mensaje-${tipo}-${boleta.numero}`} type="text" value={mensaje}
          onChange={(e) => setMensaje(e.target.value)} style={{ ...input, marginBottom: 0 }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Guardar</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// Fila de una venta (boleta de paseo o de adiestramiento) con acciones: aceptar, marcar pagada, editar, eliminar.
function FilaBoletaVenta({ boleta, tipo, setBoletasEmitidas, setBoletasAdiestramiento, nombreUsuario }) {
  const [editando, setEditando] = useState(false);
  const [pagoPendiente, setPagoPendiente] = useState(false);
  const [fechaPagoForm, setFechaPagoForm] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);
  const [generandoComprobante, setGenerandoComprobante] = useState(false);
  const setBoletas = tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  const est = ESTADOS_FACTURA.find((e) => e.id === boleta.estado) || ESTADOS_FACTURA[0];

  function confirmarPago() {
    editarBoleta(setBoletas, boleta._dbId, { estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm });
    setPagoPendiente(false);
  }

  // Comprobante bajo demanda: no hace falta mantener un canvas montado
  // por cada fila del historial — se arma uno descartable solo cuando
  // de verdad se pide descargar.
  async function descargarComprobante() {
    setGenerandoComprobante(true);
    try {
      await descargarPdfBoleta(boleta, tipo, boleta.editadaPor ? "-corregida" : "");
    } catch {
      showToast("No se pudo generar el PDF. Intenta de nuevo.");
    } finally {
      setGenerandoComprobante(false);
    }
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #EDE4CE" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13.5 }}>
        <span style={{ color: INK }}>
          N°{String(boleta.numero).padStart(3, "0")} · {tipo === "paseo" ? `${boleta.mes} ${boleta.anio} · ${boleta.cantidad} paseos` : `Adiestramiento · ${boleta.modalidad}`}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: est.bg, color: est.color }}>{est.nombre}</span>
          {boleta.estado === "pagada" && boleta.formaPago && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#8A7E5C" }}>{boleta.formaPago} · {boleta.fechaPago}</span>
          )}
          {boleta.editadaPor && (
            <span title={`Corregida por ${boleta.editadaPor} el ${new Date(boleta.editadaEn).toLocaleString("es-CL")}`} style={{ marginLeft: 8, fontSize: 11.5, color: GOLD, cursor: "help" }}>
              ✎ corregida
            </span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ color: NAVY }}>{fmtCLP(boleta.total)}</b>
          {!boleta._dbId ? (
            // Todavía no vuelve el id real de Supabase (recién se creó) —
            // sin él, aceptar/editar/eliminar no tienen forma confiable de
            // saber a cuál boleta se refieren, así que se espera a que
            // termine de guardarse antes de habilitar las acciones.
            <span style={{ fontSize: 12, color: "#8A7E5C" }}>Guardando…</span>
          ) : (
            <>
              {boleta.estado === "no_enviada" && (
                <button onClick={() => aceptarBoleta(setBoletas, boleta._dbId)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Aceptar</button>
              )}
              {boleta.estado !== "pagada" && boleta.estado !== "cancelada" && (
                <button onClick={() => setPagoPendiente(true)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Marcar pagada</button>
              )}
              <button onClick={descargarComprobante} disabled={generandoComprobante}
                style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, opacity: generandoComprobante ? 0.5 : 1 }}>
                {generandoComprobante ? "Generando..." : boleta.editadaPor ? "Descargar comprobante actualizado" : "Descargar PDF"}
              </button>
              <button onClick={() => setEditando((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Editar</button>
              <BotonEliminar onConfirm={() => eliminarBoleta(setBoletas, boleta._dbId)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
            </>
          )}
        </div>
      </div>
      {pagoPendiente && (
        <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, padding: 12, marginTop: 8, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" value={fechaPagoForm} onChange={(e) => setFechaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 150 }} />
          <select value={formaPagoForm} onChange={(e) => setFormaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 170 }}>
            {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={confirmarPago} style={{ ...botonPrincipal, width: "auto", padding: "8px 16px", marginTop: 0 }}>Confirmar</button>
          <button onClick={() => setPagoPendiente(false)} style={botonSecundario}>Cancelar</button>
        </div>
      )}
      {editando && (
        <EditorBoletaBasico boleta={boleta} tipo={tipo}
          onGuardar={(cambios) => { editarBoleta(setBoletas, boleta._dbId, { ...cambios, editadaPor: nombreUsuario, editadaEn: new Date().toISOString() }); setEditando(false); }}
          onCancelar={() => setEditando(false)} />
      )}
    </div>
  );
}
