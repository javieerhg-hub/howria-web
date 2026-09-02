// Dibujo de boletas en canvas + descarga como PDF — separado del resto de
// _compartido.jsx a propósito: jsPDF es pesada y la mayoría de lo que vive
// en _compartido.jsx (SeccionPlegable, HistorialUnificado, helpers de
// citas, etc.) la usan pestañas que nunca generan un PDF (Coordinación,
// Inventario, Prospección, Agenda, Itinerario, Mapa de rutas, Alumnos) —
// si esto quedaba mezclado ahí, todas esas pestañas pagaban el peso de
// jsPDF sin necesitarlo. Solo Boletas, Facturas y Clientes (vía
// FilaBoletaVenta, en _compartido.jsx) lo importan.
import { jsPDF } from "jspdf";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, NAVY_LOGO, MESES, DIAS_SEMANA,
  LOGO_B64, HUELLA_B64, fmtCLP,
} from "../HowriaAdmin.jsx";
import { diasDelMes, esFinDeSemanaOFeriado, valorConRecargo, calcularBoletaAdiestramiento } from "../lib/calculosBoletas.js";

export function dibujarBoleta(canvas, emitida, logoImg, huellaImg) {
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

export function wrapTextInline(ctx, text, x, y, maxWidth) {
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

export function dibujarCalendarioBoleta(ctx, x, yTop, width, mesIdx, anio, diasMarcados, recargoPct = 30) {
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

// ---------- Generador de boletas: formulario de paseos ----------

export function dibujarBoletaAdiestramiento(canvas, emitida, logoImg, huellaImg) {
  const ctx = canvas.getContext("2d");

  const { subtotalClases, montoDescuento } = calcularBoletaAdiestramiento({
    numClases: emitida.numClases, precioClase: emitida.precioClase,
    descuentoPackPct: emitida.descuentoPackPct, descuentoPackMonto: emitida.descuentoPackMonto,
    evaluacion: emitida.evaluacion, precioEvaluacion: emitida.precioEvaluacion, transporte: emitida.transporte,
    packPrecioManual: emitida.packPrecioManual, packPrecio: emitida.total,
  });
  // Un pack armado a mano se cobra como una sola cosa: el nombre del
  // pack lleva el precio, y lo que trae se lista debajo sin monto (ya
  // está dentro del precio). Poner un valor al lado de cada línea daría
  // a entender que se suman.
  // Una boleta de evaluación suelta se emite con numClases en 0 — sin
  // este guardia la boleta diría "0 clase(s) de adiestramiento (x $0)".
  const tieneClases = Number(emitida.numClases || 0) > 0;
  const filas = emitida.packPrecioManual ? [
    { texto: emitida.packNombre || "Pack de adiestramiento", valor: fmtCLP(emitida.total), color: INK },
    ...[
      ...(tieneClases ? [`${emitida.numClases} clase(s) de adiestramiento ${emitida.modalidad}`] : []),
      ...(emitida.evaluacion !== "ninguna" ? [`Evaluación ${emitida.evaluacion}`] : []),
      ...(emitida.packIncluye || []),
    ].map((linea) => ({ texto: `· ${linea}`, valor: "", color: INK })),
  ] : tieneClases ? [
    { texto: `${emitida.numClases} clase(s) de adiestramiento ${emitida.modalidad} (x ${fmtCLP(emitida.precioClase)})`, valor: fmtCLP(subtotalClases), color: INK },
  ] : [];
  if (!emitida.packPrecioManual && montoDescuento > 0) {
    const etiqueta = emitida.descuentoPackPct > 0 ? ` (-${emitida.descuentoPackPct}%)` : "";
    filas.push({ texto: `Descuento pack de ${emitida.numClases} clases${etiqueta}`, valor: `- ${fmtCLP(montoDescuento)}`, color: RUST });
  }
  if (!emitida.packPrecioManual && emitida.evaluacion !== "ninguna" && emitida.precioEvaluacion > 0) {
    filas.push({ texto: `Evaluación ${emitida.evaluacion === "presencial" ? "presencial" : "online"}`, valor: fmtCLP(emitida.precioEvaluacion), color: INK });
  }
  if (!emitida.packPrecioManual && emitida.transporte > 0) {
    filas.push({ texto: "Transporte", valor: fmtCLP(emitida.transporte), color: INK });
  }

  const W = 560;
  const M = 34;
  // 820px alcanzaban justo para las 4 filas como máximo que podía tener
  // una boleta calculada. Un pack a mano puede listar todo lo que uno
  // quiera, así que la boleta crece 36px (el alto de una fila) por cada
  // línea de más — si no, lo último quedaba cortado fuera del canvas.
  const H = 820 + Math.max(0, filas.length - 4) * 36;
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


// Genera el PDF de una boleta (paseo o adiestramiento) al vuelo, sobre un
// canvas descartable — no hay archivos guardados en ningún lado, se arma
// desde los datos de la boleta cada vez que se pide.
// ---------- Liquidación de pago de un paseador -----------------------
//
// El comprobante que se le entrega al paseador cuando se le paga: qué
// perros paseó, cuántas veces cada uno, a qué tarifa, y cuánto suma.
// Existe para que el pago se pueda revisar y entender sin tener que
// creerle a un número suelto.
//
// Los datos salen de los mismos helpers que alimentan "Detalle del mes"
// en pantalla (filasDetalleMes / detalleMesCliente en _compartido.jsx),
// así que el papel y la pantalla no pueden discrepar.
export function dibujarLiquidacionPaseador(canvas, datos, logoImg, huellaImg) {
  const { paseador, etiquetaPeriodo, filas, ajuste, ajusteMotivo, total } = datos;
  const ctx = canvas.getContext("2d");
  const W = 620;
  const M = 34;
  const ALTO_FILA = 30;
  // Crece con la cantidad de perros; el resto del papel es fijo.
  const H = 360 + filas.length * ALTO_FILA + (ajuste ? 34 : 0);
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  if (huellaImg) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    const hW = 20, hH = 20 * (huellaImg.height / huellaImg.width);
    let i = 0;
    for (let wy = 170; wy < H - 40; wy += 66) {
      const izquierda = i % 2 === 0;
      ctx.save();
      ctx.translate(izquierda ? 16 : W - 16, wy);
      ctx.rotate(izquierda ? -0.3 : 0.3);
      ctx.drawImage(huellaImg, -hW / 2, -hH / 2, hW, hH);
      ctx.restore();
      i++;
    }
    ctx.restore();
  }

  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(0, 0, W, 120);
  if (logoImg) {
    const logoH = 84, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, M, 16, logoW, logoH);
  }
  ctx.fillStyle = CREAM;
  ctx.textAlign = "right";
  ctx.font = "600 18px 'Fraunces', Georgia";
  ctx.fillText("Liquidación de paseos", W - M, 52);
  ctx.font = "12.5px 'Inter', Helvetica";
  ctx.fillText(etiquetaPeriodo, W - M, 74);

  let y = 156;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = "700 19px 'Fraunces', Georgia";
  ctx.fillText(paseador, M, y);
  ctx.font = "12.5px 'Inter', Helvetica";
  ctx.fillStyle = "#8A7E5C";
  ctx.fillText(`Emitida el ${new Date().toLocaleDateString("es-CL")}`, M, y + 20);

  y += 46;
  ctx.fillStyle = CREAM_SOFT;
  ctx.fillRect(M, y, W - M * 2, 32);
  ctx.fillStyle = "#6B6248";
  ctx.font = "700 11.5px 'Inter', Helvetica";
  ctx.fillText("PERRO", M + 12, y + 20);
  ctx.textAlign = "center";
  ctx.fillText("PASEOS", M + 300, y + 20);
  ctx.textAlign = "right";
  ctx.fillText("POR PASEO", W - M - 130, y + 20);
  ctx.fillText("SUBTOTAL", W - M - 12, y + 20);
  ctx.textAlign = "left";
  y += 32;

  filas.forEach((f, idx) => {
    const fy = y + ALTO_FILA * idx;
    ctx.strokeStyle = "#EFEAD9";
    ctx.beginPath(); ctx.moveTo(M, fy); ctx.lineTo(W - M, fy); ctx.stroke();
    const base = fy + 20;

    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Inter', Helvetica";
    // El nombre del perro es lo que el paseador reconoce; el del tutor va
    // chico al lado, para desambiguar cuando hay perros con el mismo nombre.
    const texto = f.compartido ? `${f.perro} (compartido)` : f.perro;
    wrapTextInline(ctx, texto, M + 12, base, 190);
    ctx.fillStyle = "#8A7E5C";
    ctx.font = "11px 'Inter', Helvetica";
    wrapTextInline(ctx, f.cliente, M + 12, base + 12, 190);

    ctx.fillStyle = INK;
    ctx.font = "600 13px 'Inter', Helvetica";
    ctx.textAlign = "center";
    ctx.fillText(String(f.realizados), M + 300, base);
    ctx.textAlign = "right";
    ctx.font = "13px 'Inter', Helvetica";
    ctx.fillText(fmtCLP(f.tarifa), W - M - 130, base);
    ctx.font = "700 13.5px 'Inter', Helvetica";
    ctx.fillText(fmtCLP(f.monto), W - M - 12, base);
    ctx.textAlign = "left";
  });
  y += ALTO_FILA * filas.length + 6;

  ctx.strokeStyle = "#DCD2B4";
  ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
  y += 24;

  const totalPaseos = filas.reduce((acc, f) => acc + f.realizados, 0);
  ctx.fillStyle = "#6B6248";
  ctx.font = "13px 'Inter', Helvetica";
  ctx.fillText(`${totalPaseos} paseo(s) en total`, M + 12, y);

  if (ajuste) {
    y += 26;
    ctx.fillStyle = ajuste < 0 ? RUST : "#2F6A46";
    ctx.font = "600 13px 'Inter', Helvetica";
    ctx.fillText(`Ajuste: ${ajusteMotivo || "sin motivo anotado"}`, M + 12, y);
    ctx.textAlign = "right";
    ctx.fillText(`${ajuste > 0 ? "+" : ""}${fmtCLP(ajuste)}`, W - M - 12, y);
    ctx.textAlign = "left";
  }

  y += 22;
  const altoTotal = 62;
  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(M, y, W - M * 2, altoTotal);
  ctx.fillStyle = CREAM;
  ctx.font = "600 13.5px 'Inter', Helvetica";
  ctx.fillText("TOTAL A RECIBIR", M + 16, y + altoTotal - 36);
  ctx.font = "700 26px 'Fraunces', Georgia";
  ctx.textAlign = "right";
  ctx.fillText(fmtCLP(total), W - M - 16, y + altoTotal - 20);
  ctx.textAlign = "left";
  y += altoTotal + 26;

  ctx.fillStyle = "#B0A587";
  ctx.font = "11.5px 'Inter', Helvetica";
  ctx.textAlign = "center";
  ctx.fillText("Gracias por tu trabajo — Howria", W / 2, Math.min(y, H - 16));
  ctx.textAlign = "left";
}


// Liquidacion personal (pestana Finanzas personales) — el resumen del mes
// del DUENO, no de un trabajador: de donde salio cada peso que gana, que
// gasto, y cuanto le queda limpio.
//
// Es generica a proposito (una lista de secciones con filas) y no una
// plantilla fija: la pestana ya tiene tres fuentes de ingreso distintas y
// es probable que aparezca una cuarta. Asi agregarla no obliga a tocar
// este dibujo.
export function dibujarLiquidacionPersonal(canvas, datos, logoImg, huellaImg) {
  const { titulo, periodo, secciones, ganare, gastos, limpio, yaEntro } = datos;
  const ctx = canvas.getContext("2d");
  const W = 620;
  const M = 34;
  const ALTO_FILA = 28;

  const altoSeccion = (sec) => 34 + sec.filas.length * ALTO_FILA + 30;
  const H = 190 + secciones.reduce((acc, sec) => acc + altoSeccion(sec), 0) + 160;
  canvas.width = W;
  canvas.height = H;

  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);

  if (huellaImg) {
    ctx.save();
    ctx.globalAlpha = 0.06;
    const hW = 20, hH = 20 * (huellaImg.height / huellaImg.width);
    let i = 0;
    for (let wy = 180; wy < H - 40; wy += 72) {
      const izquierda = i % 2 === 0;
      ctx.save();
      ctx.translate(izquierda ? 16 : W - 16, wy);
      ctx.rotate(izquierda ? -0.3 : 0.3);
      ctx.drawImage(huellaImg, -hW / 2, -hH / 2, hW, hH);
      ctx.restore();
      i++;
    }
    ctx.restore();
  }

  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(0, 0, W, 120);
  if (logoImg) {
    const logoH = 84, logoW = logoImg.width * (logoH / logoImg.height);
    ctx.drawImage(logoImg, M, 16, logoW, logoH);
  }
  ctx.fillStyle = CREAM;
  ctx.textAlign = "right";
  ctx.font = "600 18px 'Fraunces', Georgia";
  ctx.fillText(titulo, W - M, 52);
  ctx.font = "12.5px 'Inter', Helvetica";
  ctx.fillText(periodo, W - M, 74);
  ctx.textAlign = "left";

  let y = 150;
  ctx.fillStyle = "#8A7E5C";
  ctx.font = "11.5px 'Inter', Helvetica";
  ctx.fillText(`Generada el ${new Date().toLocaleDateString("es-CL")} \u00b7 documento interno`, M, y);
  y += 26;

  secciones.forEach((sec) => {
    ctx.fillStyle = CREAM_SOFT;
    ctx.fillRect(M, y, W - M * 2, 30);
    ctx.fillStyle = INK;
    ctx.font = "700 12.5px 'Inter', Helvetica";
    ctx.fillText(sec.titulo.toUpperCase(), M + 12, y + 20);
    if (sec.detalle) {
      ctx.textAlign = "right";
      ctx.fillStyle = "#8A7E5C";
      ctx.font = "11px 'Inter', Helvetica";
      ctx.fillText(sec.detalle, W - M - 12, y + 20);
      ctx.textAlign = "left";
    }
    y += 34;

    sec.filas.forEach((f) => {
      ctx.strokeStyle = "#EFEAD9";
      ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
      const base = y + 18;
      ctx.fillStyle = INK;
      ctx.font = "600 12.5px 'Inter', Helvetica";
      wrapTextInline(ctx, f.izq, M + 12, base, 300);
      if (f.sub) {
        ctx.fillStyle = "#8A7E5C";
        ctx.font = "10.5px 'Inter', Helvetica";
        wrapTextInline(ctx, f.sub, M + 12, base + 11, 320);
      }
      ctx.fillStyle = f.negativo ? RUST : INK;
      ctx.font = "700 13px 'Inter', Helvetica";
      ctx.textAlign = "right";
      ctx.fillText(f.der, W - M - 12, base);
      ctx.textAlign = "left";
      y += ALTO_FILA;
    });

    ctx.strokeStyle = "#DCD2B4";
    ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke();
    y += 20;
    ctx.fillStyle = "#6B6248";
    ctx.font = "600 12.5px 'Inter', Helvetica";
    ctx.fillText(sec.etiquetaTotal || "Subtotal", M + 12, y);
    ctx.textAlign = "right";
    ctx.fillStyle = sec.totalNegativo ? RUST : "#2F6A46";
    ctx.font = "700 14px 'Inter', Helvetica";
    ctx.fillText(sec.total, W - M - 12, y);
    ctx.textAlign = "left";
    y += 24;
  });

  y += 6;
  ctx.fillStyle = INK;
  ctx.font = "13px 'Inter', Helvetica";
  ctx.fillText("Vas a ganar", M + 12, y);
  ctx.textAlign = "right";
  ctx.font = "600 13px 'Inter', Helvetica";
  ctx.fillText(ganare, W - M - 12, y);
  ctx.textAlign = "left";
  y += 22;
  ctx.fillStyle = INK;
  ctx.font = "13px 'Inter', Helvetica";
  ctx.fillText("Tus gastos", M + 12, y);
  ctx.textAlign = "right";
  ctx.fillStyle = RUST;
  ctx.font = "600 13px 'Inter', Helvetica";
  ctx.fillText(gastos, W - M - 12, y);
  ctx.textAlign = "left";
  y += 18;

  const altoTotal = 66;
  ctx.fillStyle = NAVY_LOGO;
  ctx.fillRect(M, y, W - M * 2, altoTotal);
  ctx.fillStyle = CREAM;
  ctx.font = "600 13.5px 'Inter', Helvetica";
  ctx.fillText("TE QUEDA LIMPIO", M + 16, y + 26);
  ctx.font = "11px 'Inter', Helvetica";
  ctx.fillStyle = "#B9C4D2";
  ctx.fillText(`De eso ya lo tienes en la mano: ${yaEntro}`, M + 16, y + 46);
  ctx.fillStyle = CREAM;
  ctx.font = "700 26px 'Fraunces', Georgia";
  ctx.textAlign = "right";
  ctx.fillText(limpio, W - M - 16, y + 40);
  ctx.textAlign = "left";
  y += altoTotal + 24;

  ctx.fillStyle = "#B0A587";
  ctx.font = "11px 'Inter', Helvetica";
  ctx.textAlign = "center";
  ctx.fillText("Howria \u2014 uso interno, no es un documento tributario", W / 2, Math.min(y, H - 14));
  ctx.textAlign = "left";
}

export async function descargarLiquidacionPersonal(datos) {
  const logoImg = new Image();
  const huellaImg = new Image();
  await Promise.all([
    new Promise((resolve) => { logoImg.onload = resolve; logoImg.onerror = resolve; logoImg.src = LOGO_B64; }),
    new Promise((resolve) => { huellaImg.onload = resolve; huellaImg.onerror = resolve; huellaImg.src = HUELLA_B64; }),
  ]);
  if (document.fonts?.ready) {
    await Promise.all(["700 19px Fraunces", "600 18px Fraunces", "700 26px Fraunces", "13px Inter", "600 13px Inter"]
      .map((f) => document.fonts.load(f))).then(() => document.fonts.ready).catch(() => {});
  }
  const canvas = document.createElement("canvas");
  dibujarLiquidacionPersonal(canvas, datos, logoImg, huellaImg);
  const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  const link = document.createElement("a");
  link.download = `Mi-liquidacion-${datos.periodo.replace(/\s+/g, "-")}.pdf`;
  link.href = URL.createObjectURL(doc.output("blob"));
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function descargarLiquidacionPaseador(datos) {
  const logoImg = new Image();
  const huellaImg = new Image();
  await Promise.all([
    new Promise((resolve) => { logoImg.onload = resolve; logoImg.onerror = resolve; logoImg.src = LOGO_B64; }),
    new Promise((resolve) => { huellaImg.onload = resolve; huellaImg.onerror = resolve; huellaImg.src = HUELLA_B64; }),
  ]);
  if (document.fonts?.ready) {
    await Promise.all(["700 19px Fraunces", "600 18px Fraunces", "700 26px Fraunces", "13px Inter", "600 13px Inter"]
      .map((f) => document.fonts.load(f))).then(() => document.fonts.ready).catch(() => {});
  }
  const canvas = document.createElement("canvas");
  dibujarLiquidacionPaseador(canvas, datos, logoImg, huellaImg);
  const doc = new jsPDF({ orientation: "portrait", unit: "px", format: [canvas.width, canvas.height] });
  doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
  const link = document.createElement("a");
  link.download = `Liquidacion-${datos.paseador.replace(/\s+/g, "-")}-${datos.etiquetaPeriodo.replace(/\s+/g, "-")}.pdf`;
  link.href = URL.createObjectURL(doc.output("blob"));
  link.click();
  URL.revokeObjectURL(link.href);
}

export async function descargarPdfBoleta(boleta, tipo, sufijo = "") {
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
