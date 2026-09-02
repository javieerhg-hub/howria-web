// Pestaña Boletas — generador de boletas de paseo y de adiestramiento
// (selector de tipo + los dos formularios). Ver src/HowriaAdmin.jsx
// (React.lazy) por la lista completa de pestañas y src/tabs/_compartido.jsx
// para lo compartido.
import { useState, useRef, useMemo, useEffect } from "react";
import { jsPDF } from "jspdf";
import { Receipt, GraduationCap } from "lucide-react";
import { supabase } from "../lib/supabaseClient.js";
import {
  NAVY, CREAM, CREAM_SOFT, GOLD, INK, RUST, PANEL_BG, PLANES, MESES, DIAS_SEMANA, DIAS_SEMANA_LARGO,
  LOGO_B64, HUELLA_B64, tarjeta, sectionTitle, hint, label, input, botonPrincipal, botonSecundario,
  fmtCLP, fechaKey, showToast, boletaToDb, dbToBoleta, boletaAdiestramientoToDb, dbToBoletaAdiestramiento,
  textoClienteEnLista,
} from "../HowriaAdmin.jsx";
import {
  diasDelMes, esFinDeSemanaOFeriado, valorConRecargo, diasSegunPlan,
  calcularBoletaPaseos, calcularBoletaAdiestramiento,
  cicloDeFecha,
} from "../lib/calculosBoletas.js";
import { dibujarBoleta, dibujarBoletaAdiestramiento } from "./_compartido_pdf.jsx";

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

function FormularioBoletaPaseo({ clientes, boletasEmitidas, onRegistrarBoleta, recargoPct, actualizarRecargoPct, registroPaseos = {} }) {
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
  const resultadoRef = useRef(null);
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

  // Antes la boleta se reconstruía a mano cada mes (plan + cuántos se
  // cancelaron, escrito de memoria) aunque el sistema ya sabe, día por
  // día, qué paseos se marcaron realizados/cancelados en Mis paseos —
  // mismo dato que ya usa Pago trabajadores para calcular lo que se le
  // paga al paseador. Esto arma la misma sugerencia acá, para el cliente.
  const sugerenciaPaseos = useMemo(() => {
    if (!cliente || !cliente.diasHabituales?.length) return null;
    const diasDelPlan = diasSegunPlan(mesIdx, anio, cliente.diasHabituales);
    if (diasDelPlan.length === 0) return null;
    const realizados = [], cancelados = [], sinMarcar = [];
    diasDelPlan.forEach((d) => {
      const registro = registroPaseos[`${cliente.id}_${fechaKey(new Date(anio, mesIdx, d))}`];
      if (registro?.realizado) realizados.push(d);
      else if (registro?.cancelado) cancelados.push(d);
      else sinMarcar.push(d);
    });
    const totalRealizados = calcularBoletaPaseos({ dias: realizados, mesIdx, anio, valorPaseo, recargoPct }).total;
    return { realizados, cancelados, sinMarcar, totalRealizados };
  }, [cliente, mesIdx, anio, registroPaseos, valorPaseo, recargoPct]);

  const [sugerenciaAplicada, setSugerenciaAplicada] = useState(false);

  function usarSugerencia() {
    if (!sugerenciaPaseos) return;
    setDias(sugerenciaPaseos.realizados);
    setPlanId("PERSONALIZADO");
    setPaseosCancelados(0);
    setEmitida(null);
    setSugerenciaAplicada(true);
  }

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

  // Fechas sueltas del cliente que caen en el mes elegido — para el que
  // no tiene días fijos sino los que el tutor avisa mes a mes. Van como
  // números de día porque es lo que espera el calendario de la boleta.
  function diasPuntualesDelMes(cliente, mIdx = mesIdx, a = anio) {
    const prefijo = `${a}-${String(mIdx + 1).padStart(2, "0")}-`;
    return (cliente?.diasPuntuales || [])
      .filter((k) => k.startsWith(prefijo))
      .map((k) => Number(k.slice(-2)))
      .sort((x, y) => x - y);
  }

  function seleccionarCliente(id) {
    const c = clientes.find((x) => x.id === Number(id));
    setClienteId(Number(id));
    // Si el cliente trabaja con fechas sueltas, esas mandan: son las que
    // el tutor confirmó para ESTE mes, no un patrón que se repite.
    const puntuales = diasPuntualesDelMes(c);
    if (puntuales.length > 0) {
      setValorPaseo(c?.valorPaseoRef ?? 0);
      setPlanId("PERSONALIZADO");
      setDias(puntuales);
      setEmitida(null);
      setSugerenciaAplicada(false);
      return;
    }
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
    setSugerenciaAplicada(false);
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
    // Un cliente de fechas sueltas tiene otras en cada mes: al cambiar de
    // mes hay que traer las de ese mes, no recalcular un patrón semanal.
    const puntualesOtroMes = diasPuntualesDelMes(cliente, mIdx);
    if (puntualesOtroMes.length > 0) {
      setPlanId("PERSONALIZADO");
      setDias(puntualesOtroMes);
      setEmitida(null);
      setSugerenciaAplicada(false);
      return;
    }
    if (planId === "PERSONALIZADO" && diasSemanaPersonalizado.length > 0) {
      setDias(diasSegunPlan(mIdx, anio, diasSemanaPersonalizado));
      setEmitida(null);
    } else {
      aplicarPlan(planId, mIdx);
    }
    setSugerenciaAplicada(false);
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
    // En el celular la boleta emitida queda debajo del formulario entero y
    // de la imagen: había que scrollear media pantalla para llegar a
    // "Enviar por WhatsApp", que es lo que uno quiere hacer justo después
    // de emitirla. El timeout deja que React pinte el bloque antes de
    // buscarlo.
    setTimeout(() => {
      resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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
    // El ciclo que se está facturando: el cobro de un mes se genera entre
    // el 20 del anterior y el 5 de ese mes. Solo sirve para AVISAR, nunca
    // para decidir — Howria emite boletas de dos meses distintos el mismo
    // día (unas por adelantado, otras por los días ya caminados), así que
    // adivinar el mes sería adivinar mal la mitad de las veces.
    const cicloSugerido = cicloDeFecha(new Date());
    const mesElegidoIdx = MESES.indexOf(String(p.mes || "").toLowerCase());
    const calzaConElCiclo = cicloSugerido && mesElegidoIdx === cicloSugerido.getMonth() && Number(p.anio) === cicloSugerido.getFullYear();
    return (
      <div className="howria-card" style={{ ...tarjeta, maxWidth: 560, margin: "0 auto" }}>
        <h2 style={sectionTitle}>Confirmar antes de emitir</h2>
        <p style={hint}>Revisa que todo esté bien — al confirmar, la boleta queda registrada con su número definitivo y ya no se puede deshacer desde acá.</p>

        <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14, fontSize: 14, color: INK, display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Cliente</span><b>{p.cliente}{p.perro ? ` · 🐾 ${p.perro}` : ""}</b></div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ color: "#8A7E5C" }}>¿A qué mes corresponde?</span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <select
                value={mesElegidoIdx >= 0 ? mesElegidoIdx : ""}
                onChange={(e) => setParaConfirmar({ ...p, mes: MESES[Number(e.target.value)] })}
                style={{ ...input, marginBottom: 0, width: "auto", padding: "6px 10px", fontSize: 13.5 }}>
                {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
              </select>
              <select
                value={p.anio}
                onChange={(e) => setParaConfirmar({ ...p, anio: Number(e.target.value) })}
                style={{ ...input, marginBottom: 0, width: "auto", padding: "6px 10px", fontSize: 13.5 }}>
                {[p.anio - 1, p.anio, p.anio + 1].map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
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

        {/* El mes decide en qué período aparece la boleta en Finanzas y es
            lo que el cliente lee en el documento. Es también donde se
            cuela el error más caro: dejar el que venía por omisión. */}
        {!calzaConElCiclo && cicloSugerido && (
          <p style={{ margin: "12px 0 0", fontSize: 12.5, color: "#8A6A1E", background: "#F3E3B4", border: "1px solid #E0CB84", borderRadius: 8, padding: "10px 12px" }}>
            Estamos facturando el ciclo de <b>{MESES[cicloSugerido.getMonth()]} {cicloSugerido.getFullYear()}</b> y esta boleta dice <b>{p.mes} {p.anio}</b>.
            Está bien si le estás cobrando los paseos que ya hizo — solo confírmalo antes de emitir.
          </p>
        )}
        {(p.dias || []).length > 0 && (
          <p style={{ margin: "8px 0 0", fontSize: 12, color: "#8A7E5C" }}>
            Cubre {p.cantidad} día(s) de {p.mes}: del {Math.min(...p.dias)} al {Math.max(...p.dias)}.
          </p>
        )}

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
                  <option key={c.id} value={c.id}>{textoClienteEnLista(c)}</option>
                ))}
              </optgroup>
            ))
          ) : (
            clientesFiltrados.map((c) => <option key={c.id} value={c.id}>{textoClienteEnLista(c)}</option>)
          )}
        </select>
        <label style={label} htmlFor="boleta-mes">Mes a facturar</label>
        <select id="boleta-mes" value={mesIdx} onChange={(e) => cambiarMes(Number(e.target.value))} style={input}>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        {clienteTieneHistorial && (
          <p style={{ ...hint, marginTop: -10 }}>Se reutilizó el valor y el patrón de días de la última boleta de este cliente — puedes ajustarlos si cambiaron.</p>
        )}

        {sugerenciaPaseos && (
          <div style={{ background: "#D8ECDE", borderRadius: 10, padding: 16, marginTop: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 15 }}>🐾</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: "#2F6A46" }}>Calculado desde los paseos registrados</span>
            </div>
            <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 12 }}>
              <div style={{ background: "#FFFFFF", borderRadius: 8, padding: "8px 10px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C" }}>Realizados</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: NAVY }}>{sugerenciaPaseos.realizados.length}</p>
              </div>
              <div style={{ background: "#FFFFFF", borderRadius: 8, padding: "8px 10px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C" }}>Cancelados</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: NAVY }}>{sugerenciaPaseos.cancelados.length}</p>
              </div>
              <div style={{ background: "#FFFFFF", borderRadius: 8, padding: "8px 10px" }}>
                <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C" }}>Sin marcar aún</p>
                <p style={{ margin: 0, fontSize: 18, fontWeight: 700, color: NAVY }}>{sugerenciaPaseos.sinMarcar.length}</p>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <span style={{ fontSize: 12.5, color: "#5C5442" }}>{sugerenciaPaseos.realizados.length} paseo(s) × {fmtCLP(valorPaseo)}</span>
              <span style={{ fontSize: 19, fontWeight: 700, color: "#2F6A46" }}>{fmtCLP(sugerenciaPaseos.totalRealizados)}</span>
            </div>
            {sugerenciaPaseos.realizados.length === 0 ? (
              <p style={{ ...hint, margin: 0 }}>Ningún paseo marcado como realizado todavía este mes — usa el plan de abajo mientras tanto.</p>
            ) : (
              <button type="button" onClick={usarSugerencia} style={{ ...botonSecundario, width: "auto", padding: "8px 16px", borderColor: "#2F6A46", color: "#2F6A46" }}>
                Usar este cálculo
              </button>
            )}
            {sugerenciaAplicada && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#2F6A46", display: "flex", alignItems: "center", gap: 6 }}>
                ✓ Aplicado — el plan de abajo quedó con esos {sugerenciaPaseos.realizados.length} días, ajústalos si hace falta.
              </p>
            )}
          </div>
        )}

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
        <div style={{ marginBottom: 16, padding: "14px 16px", background: CREAM_SOFT, borderRadius: 8, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "#6B6248" }}>⚙️ Recargo por fin de semana / feriado:</span>
          <input type="number" min="0" max="100" value={recargoPct}
            onChange={(e) => actualizarRecargoPct(Number(e.target.value) || 0)}
            style={{ width: 70, padding: "6px 8px", border: "1px solid #DCD2B4", borderRadius: 6, fontSize: 14, textAlign: "center" }} />
          <span style={{ fontSize: 13, color: "#6B6248" }}>%</span>
          <span style={{ fontSize: 11.5, color: "#9A9179" }}>(se aplica a las boletas nuevas — las ya generadas no cambian)</span>
        </div>
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

        <div style={{ padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8 }}>
          <label style={{ ...label, marginBottom: 8, color: "#8A6A1E" }} htmlFor="boleta-mensaje">💬 Mensaje personalizado para esta boleta</label>
          <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 10px" }}>Cualquier trabajador puede agregar aquí una nota para el tutor — aparece en cursiva dorada dentro de la boleta.</p>
          <input id="boleta-mensaje" type="text" placeholder="ej. ¡Gracias por otro mes con nosotros!" value={mensajePersonalizado} onChange={(e) => { setMensajePersonalizado(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
        </div>

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
          <div ref={resultadoRef}>
            {/* Las acciones van ARRIBA de la imagen: enviarla es lo que uno
                quiere hacer justo después de emitirla, y la imagen es
                larga — dejarlas abajo obligaba a scrollear la boleta
                entera para llegar al botón. */}
            <div style={{ background: "#D8ECDE", border: "1px solid #A9CDB6", borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#2F6A46" }}>
                Boleta N°{String(emitida.numero).padStart(3, "0")} emitida · {fmtCLP(emitida.total)}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#2E5C41" }}>
                {emitida.cliente}{emitida.perro ? ` · 🐾 ${emitida.perro}` : ""} — {emitida.mes} {emitida.anio}
              </p>
              <button onClick={enviarWhatsapp}
                style={{ ...botonPrincipal, marginTop: 0, width: "100%", background: "#2F6A46", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                Enviar a {(emitida.cliente || "").split(/[,\s]/)[0]} por WhatsApp
              </button>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={descargarPNG} style={{ ...botonSecundario, flex: 1, margin: 0, padding: "8px 10px", fontSize: 12.5 }}>Descargar PNG</button>
                <button onClick={imprimirPDF} style={{ ...botonSecundario, flex: 1, margin: 0, padding: "8px 10px", fontSize: 12.5 }}>Guardar PDF</button>
              </div>
              {!cliente?.telefono && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#8A6A1E" }}>
                  Este cliente no tiene teléfono en su ficha: se abrirá WhatsApp sin destinatario.
                </p>
              )}
            </div>

            <div style={{ border: "1px solid #EDE4CE", borderRadius: 8, overflow: "hidden" }}>
              <canvas ref={canvasRef} style={{ width: "100%", display: "block" }} />
            </div>
            <p style={{ ...hint, marginTop: 8 }}>
              En el celular, &ldquo;Enviar por WhatsApp&rdquo; comparte el PDF ya adjunto. En el computador WhatsApp no deja adjuntarlo solo: se descarga el PDF y se abre el chat con el mensaje listo para adjuntarlo.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Formulario de registro / edición de cliente ----------

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
  // Tres formas de cobrar una boleta de adiestramiento:
  //   "clase"      — N clases x precio, con descuentos (lo de siempre)
  //   "pack"       — se describe qué trae y se escribe el precio, que ES
  //                  el total (ver database/105_boletas_adiestramiento_pack.sql)
  //   "evaluacion" — evaluación suelta, sin clases de por medio
  const [modo, setModo] = useState("clase");
  const modoPack = modo === "pack";
  const soloEvaluacion = modo === "evaluacion";
  const [packNombre, setPackNombre] = useState("");
  const [packIncluye, setPackIncluye] = useState([""]); // arranca con una línea vacía visible
  const [packPrecio, setPackPrecio] = useState(0);
  const [mensajePersonalizado, setMensajePersonalizado] = useState("");
  const [emitida, setEmitida] = useState(null);
  const resultadoRef = useRef(null);
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

  const clientesAdiestramiento = useMemo(
    () => clientes.filter((c) => c.tipoServicio?.includes("clases")),
    [clientes]
  );

  // El <select> lista solo a los clientes con "Clases" marcado, pero
  // clienteId arrancaba apuntando al primero de TODOS los clientes —
  // casi siempre uno de paseos, que no está entre las opciones. El
  // desplegable igual mostraba el primer nombre de la lista (así se
  // comporta un select cuyo value no existe entre sus opciones), pero el
  // formulario creía que no había nadie elegido y "Generar boleta"
  // quedaba gris hasta que uno seleccionaba a mano. Es el mismo arreglo
  // que el formulario de paseos ya hace en cambiarFiltroPaseador; acá el
  // disparador es que los clientes terminen de cargar.
  useEffect(() => {
    if (clienteManual || clientesAdiestramiento.length === 0) return;
    if (clientesAdiestramiento.some((c) => c.id === Number(clienteId))) return;
    setClienteId(clientesAdiestramiento[0].id);
  }, [clientesAdiestramiento, clienteId, clienteManual]);
  const cliente = clienteManual
    ? { nombre: nombreManual.trim(), perro: perroManual.trim(), telefono: "", _dbId: null }
    : clientesAdiestramiento.find((c) => c.id === Number(clienteId));

  // En "solo evaluación" no hay clases que cobrar ni que describir: se
  // fuerzan a 0 en vez de arrastrar lo que hubiera quedado escrito en
  // los campos de clases antes de cambiar de modo.
  const clasesEfectivas = soloEvaluacion ? 0 : Number(numClases || 0);

  const { subtotalClases, montoDescuento, montoEvaluacion, total } = calcularBoletaAdiestramiento({
    numClases: clasesEfectivas,
    precioClase: soloEvaluacion ? 0 : precioClase,
    descuentoPackPct: soloEvaluacion ? 0 : descuentoPackPct,
    descuentoPackMonto: soloEvaluacion ? 0 : descuentoPackMonto,
    evaluacion, precioEvaluacion, transporte,
    packPrecioManual: modoPack, packPrecio,
  });

  // Las líneas en blanco no se guardan — la lista se edita con inputs
  // sueltos, así que casi siempre queda alguna a medio llenar.
  const incluyeLimpio = packIncluye.map((linea) => linea.trim()).filter(Boolean);

  // Un pack sin precio escrito emitiría una boleta en $0 sin avisar. Lo
  // mismo con la evaluación suelta, porque su precio arranca en 0. En el
  // modo por clase no hace falta el chequeo: el precio por clase ya
  // viene con un valor por defecto.
  const faltaPrecioPack = modoPack && !(Number(packPrecio) > 0);
  const faltaPrecioEvaluacion = soloEvaluacion && !(Number(precioEvaluacion) > 0);
  const puedeGenerar = Boolean(cliente && cliente.nombre) && !faltaPrecioPack && !faltaPrecioEvaluacion;

  function cambiarModo(nuevo) {
    setModo(nuevo);
    // Una boleta de "solo evaluación" sin evaluación elegida no tendría
    // nada que cobrar, así que se elige una apenas se entra al modo.
    if (nuevo === "evaluacion" && evaluacion === "ninguna") setEvaluacion("presencial");
    setEmitida(null);
  }

  function elegirPack(n, descuentoPct, descuentoMonto = 0) {
    setNumClases(n);
    setDescuentoPackPct(descuentoPct);
    setDescuentoPackMonto(descuentoMonto);
    setEmitida(null);
  }

  function cambiarIncluye(idx, valor) {
    setPackIncluye((prev) => prev.map((linea, i) => (i === idx ? valor : linea)));
    setEmitida(null);
  }
  function agregarIncluye() {
    setPackIncluye((prev) => [...prev, ""]);
    setEmitida(null);
  }
  function quitarIncluye(idx) {
    // Nunca se queda sin ninguna línea: si se borra la última, vuelve a
    // dejar una vacía para poder seguir escribiendo.
    setPackIncluye((prev) => (prev.length === 1 ? [""] : prev.filter((_, i) => i !== idx)));
    setEmitida(null);
  }

  function revisar() {
    if (!puedeGenerar) return;
    // No se inserta todavía — se muestra la pantalla de confirmación con
    // una foto de lo calculado ahora. Recién al confirmar se crea la
    // boleta de verdad.
    setParaConfirmar({
      clienteId: cliente._dbId,
      cliente: cliente.nombre,
      perro: cliente.perro,
      modalidad,
      numClases: clasesEfectivas,
      // En un pack a mano el precio escrito ya ES el total, así que los
      // montos que lo compondrían se guardan en 0. Si quedaran con lo
      // que hubiera en pantalla, cualquier vista que sume las partes
      // (el PDF, un informe futuro) cobraría dos veces lo mismo. En
      // "solo evaluación" pasa lo mismo con lo de clases.
      precioClase: modoPack || soloEvaluacion ? 0 : Number(precioClase),
      descuentoPackPct: modoPack || soloEvaluacion ? 0 : Number(descuentoPackPct || 0),
      descuentoPackMonto: modoPack || soloEvaluacion ? 0 : Number(descuentoPackMonto || 0),
      evaluacion, // en modo pack queda como descripción: qué evaluación trae
      precioEvaluacion: modoPack ? 0 : montoEvaluacion,
      transporte: modoPack ? 0 : Number(transporte || 0),
      packNombre: modoPack ? (packNombre.trim() || "Pack a medida") : null,
      packIncluye: modoPack ? incluyeLimpio : [],
      packPrecioManual: modoPack,
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
    // Igual que en la boleta de paseos: llevar la vista al resultado para
    // no tener que buscar el botón de enviar.
    setTimeout(() => {
      resultadoRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
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
          {p.packPrecioManual ? (
            <>
              <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Pack</span><b>{p.packNombre}</b></div>
              <div>
                <span style={{ color: "#8A7E5C" }}>Incluye</span>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18, lineHeight: 1.6 }}>
                  {p.numClases > 0 && <li>{p.numClases} clase(s) de adiestramiento {p.modalidad}</li>}
                  {p.evaluacion !== "ninguna" && <li>Evaluación {p.evaluacion}</li>}
                  {p.packIncluye.map((linea, i) => <li key={i}>{linea}</li>)}
                </ul>
              </div>
            </>
          ) : (
            <>
              {p.numClases > 0 && (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Clases</span><b>{p.numClases} × {fmtCLP(p.precioClase)}</b></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Subtotal clases</span><b>{fmtCLP(p.subtotalClases)}</b></div>
                </>
              )}
              {p.montoDescuento > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", color: RUST }}><span>Descuento pack{p.descuentoPackPct > 0 ? ` (-${p.descuentoPackPct}%)` : ""}</span><b>- {fmtCLP(p.montoDescuento)}</b></div>
              )}
              {p.evaluacion !== "ninguna" && (
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Evaluación {p.evaluacion}</span><b>{fmtCLP(p.precioEvaluacion)}</b></div>
              )}
              {p.transporte > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ color: "#8A7E5C" }}>Transporte</span><b>{fmtCLP(p.transporte)}</b></div>
              )}
            </>
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
              {clientesAdiestramiento.map((c) => <option key={c.id} value={c.id}>{textoClienteEnLista(c)}</option>)}
            </select>
          </>
        )}

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>{soloEvaluacion ? "2. Modalidad" : "2. Clases"}</h2>
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

        <p style={label} id="badiestramiento-modo-label">Cómo se cobra</p>
        <div role="group" aria-labelledby="badiestramiento-modo-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {[
            { valor: "clase", texto: "Por clase" },
            { valor: "pack", texto: "Pack con precio propio" },
            { valor: "evaluacion", texto: "Solo evaluación" },
          ].map((m) => (
            <button key={m.valor} type="button" onClick={() => cambiarModo(m.valor)} aria-pressed={modo === m.valor}
              style={{
                padding: "8px 16px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                border: modo === m.valor ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                background: modo === m.valor ? NAVY : "#FFFFFF",
                color: modo === m.valor ? CREAM : INK, fontWeight: modo === m.valor ? 600 : 400,
              }}>
              {m.texto}
            </button>
          ))}
        </div>
        <p style={{ ...hint, marginTop: 0, marginBottom: 16 }}>
          {soloEvaluacion
            ? "Boleta de una evaluación suelta: sin clases de por medio."
            : modoPack
              ? "Armas el pack como quieras y escribes el precio: ese es el total, tal cual."
              : "El total se calcula solo: clases × precio, menos descuentos, más evaluación y transporte."}
        </p>

        {!soloEvaluacion && (
          <>
            <label style={label} htmlFor="badiestramiento-num-clases">Número de clases</label>
            <input id="badiestramiento-num-clases" type="number" min="1" value={numClases} onChange={(e) => { setNumClases(e.target.value); setEmitida(null); }} style={input} />
          </>
        )}

        {soloEvaluacion ? null : modoPack ? (
          <>
            <label style={label} htmlFor="badiestramiento-pack-nombre">Nombre del pack</label>
            <input id="badiestramiento-pack-nombre" type="text" placeholder="ej. Pack Cachorro Feliz" value={packNombre}
              onChange={(e) => { setPackNombre(e.target.value); setEmitida(null); }} style={input} />

            <p style={label} id="badiestramiento-incluye-label">Qué más incluye (una línea por cosa)</p>
            <div aria-labelledby="badiestramiento-incluye-label" style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
              {packIncluye.map((linea, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="text" aria-label={`Qué incluye, línea ${idx + 1}`} placeholder="ej. 2 sesiones a domicilio" value={linea}
                    onChange={(e) => cambiarIncluye(idx, e.target.value)} style={{ ...input, marginBottom: 0, flex: 1 }} />
                  <button type="button" onClick={() => quitarIncluye(idx)} aria-label={`Quitar la línea ${idx + 1}`}
                    style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "8px 10px", minHeight: 44 }}>×</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={agregarIncluye} style={{ ...botonSecundario, marginBottom: 16 }}>+ Agregar línea</button>

            <label style={label} htmlFor="badiestramiento-pack-precio">Precio del pack (este es el total)</label>
            <input id="badiestramiento-pack-precio" type="number" min="0" value={packPrecio}
              onChange={(e) => { setPackPrecio(e.target.value); setEmitida(null); }} style={input} />
          </>
        ) : (
          <>
            <p style={label}>Pack (sugerencias) — o edita a mano abajo</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
              <button type="button" onClick={() => elegirPack(4, 0, 20000)} style={botonSecundario}>Pack 4 clases — ahorra $20.000</button>
              <button type="button" onClick={() => elegirPack(8, 10)} style={botonSecundario}>8 clases — ahorra 10%</button>
              <button type="button" onClick={() => elegirPack(12, 15)} style={botonSecundario}>12 clases — ahorra 15%</button>
            </div>

            <label style={label} htmlFor="badiestramiento-precio-clase">Precio por clase</label>
            <input id="badiestramiento-precio-clase" type="number" min="0" value={precioClase} onChange={(e) => { setPrecioClase(e.target.value); setEmitida(null); }} style={input} />
            <label style={label} htmlFor="badiestramiento-descuento-pct">Descuento por pack (%)</label>
            <input id="badiestramiento-descuento-pct" type="number" min="0" max="100" value={descuentoPackPct} onChange={(e) => { setDescuentoPackPct(e.target.value); setEmitida(null); }} style={input} />
            <label style={label} htmlFor="badiestramiento-descuento-monto">Descuento por pack (monto fijo, opcional)</label>
            <input id="badiestramiento-descuento-monto" type="number" min="0" value={descuentoPackMonto} onChange={(e) => { setDescuentoPackMonto(e.target.value); setEmitida(null); }} style={input} />
          </>
        )}

        <h2 style={{ ...sectionTitle, marginTop: 26 }}>{modoPack ? "3. Evaluación" : "3. Evaluación y transporte"}</h2>
        <p style={label} id="badiestramiento-evaluacion-label">
          {modoPack ? "Evaluación que trae el pack (va en el precio que pusiste)" : "Evaluación"}
        </p>
        <div role="group" aria-labelledby="badiestramiento-evaluacion-label" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
          {[...(soloEvaluacion ? [] : [{ id: "ninguna", label: "Sin evaluación" }]), { id: "presencial", label: "Presencial" }, { id: "online", label: "Online" }].map((e) => (
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
        {/* En un pack a mano la evaluación y el transporte no se cobran
            aparte: van dentro del precio que se escribió. Se ocultan los
            campos de monto para que no quede la duda de si se suman. */}
        {!modoPack && evaluacion !== "ninguna" && (
          <>
            <label style={label} htmlFor="badiestramiento-precio-evaluacion">Precio de la evaluación</label>
            <input id="badiestramiento-precio-evaluacion" type="number" min="0" value={precioEvaluacion} onChange={(e) => { setPrecioEvaluacion(e.target.value); setEmitida(null); }} style={input} />
          </>
        )}
        {!modoPack && (
          <>
            <label style={label} htmlFor="badiestramiento-precio-transporte">Precio de transporte (opcional)</label>
            <input id="badiestramiento-precio-transporte" type="number" min="0" value={transporte} onChange={(e) => { setTransporte(e.target.value); setEmitida(null); }} style={input} />
          </>
        )}

        <div style={{ marginTop: 20, padding: "14px 16px", background: "#FBF6E9", border: `1px solid ${GOLD}`, borderRadius: 8 }}>
          <label style={{ ...label, marginBottom: 8, color: "#8A6A1E" }} htmlFor="badiestramiento-mensaje">💬 Mensaje personalizado para esta boleta</label>
          <input id="badiestramiento-mensaje" type="text" placeholder="ej. ¡Nos vemos en la próxima clase!" value={mensajePersonalizado} onChange={(e) => { setMensajePersonalizado(e.target.value); setEmitida(null); }} style={{ ...input, marginBottom: 0 }} />
        </div>

        <div style={{ marginTop: 20, padding: "18px 20px", background: PANEL_BG, borderRadius: 14 }}>
          {modoPack ? (
            <>
              <p style={{ margin: "0 0 6px", fontSize: 15, fontWeight: 700, color: NAVY }}>{packNombre.trim() || "Pack a medida"}</p>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, color: INK, lineHeight: 1.7 }}>
                {clasesEfectivas > 0 && <li>{clasesEfectivas} clase(s) de adiestramiento {modalidad}</li>}
                {evaluacion !== "ninguna" && <li>Evaluación {evaluacion}</li>}
                {incluyeLimpio.map((linea, i) => <li key={i}>{linea}</li>)}
              </ul>
            </>
          ) : (
            <>
              {clasesEfectivas > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: INK }}>
                  <span>{clasesEfectivas} clase(s) × {fmtCLP(precioClase)}</span>
                  <span>{fmtCLP(subtotalClases)}</span>
                </div>
              )}
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
            </>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 16, color: NAVY, marginTop: 8, fontWeight: 700, borderTop: "1px solid #DCD2B4", paddingTop: 8 }}>
            <span>Total</span>
            <span>{fmtCLP(total)}</span>
          </div>
        </div>

        {faltaPrecioPack && (
          <p style={{ ...hint, color: RUST, marginTop: 10, marginBottom: 0 }}>
            Ponle un precio al pack para poder generar la boleta.
          </p>
        )}
        {faltaPrecioEvaluacion && (
          <p style={{ ...hint, color: RUST, marginTop: 10, marginBottom: 0 }}>
            Ponle un precio a la evaluación para poder generar la boleta.
          </p>
        )}

        <button onClick={revisar} disabled={!puedeGenerar}
          style={{ ...botonPrincipal, marginTop: 20, opacity: puedeGenerar ? 1 : 0.45 }}>
          Generar boleta
        </button>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Vista previa</h2>
        {!emitida ? (
          <p style={hint}>Completa el formulario y genera la boleta para verla aquí.</p>
        ) : (
          <div ref={resultadoRef}>
            {/* Mismo criterio que la boleta de paseos: enviar es lo que uno
                quiere hacer justo después de emitir, así que va arriba de
                la imagen y no debajo. */}
            <div style={{ background: "#D8ECDE", border: "1px solid #A9CDB6", borderRadius: 10, padding: 14, marginBottom: 12 }}>
              <p style={{ margin: "0 0 2px", fontSize: 14, fontWeight: 700, color: "#2F6A46" }}>
                Boleta N°{String(emitida.numero).padStart(3, "0")} emitida · {fmtCLP(emitida.total)}
              </p>
              <p style={{ margin: "0 0 10px", fontSize: 12, color: "#2E5C41" }}>
                {emitida.cliente}{emitida.perro ? ` · 🐾 ${emitida.perro}` : ""} — adiestramiento
              </p>
              <button onClick={enviarWhatsapp}
                style={{ ...botonPrincipal, marginTop: 0, width: "100%", background: "#2F6A46" }}>
                Enviar a {(emitida.cliente || "").split(" ")[0]} por WhatsApp
              </button>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={descargarPNG} style={{ ...botonSecundario, flex: 1, margin: 0, padding: "8px 10px", fontSize: 12.5 }}>Descargar PNG</button>
                <button onClick={descargarPDF} style={{ ...botonSecundario, flex: 1, margin: 0, padding: "8px 10px", fontSize: 12.5 }}>Descargar PDF</button>
              </div>
              {!cliente?.telefono && (
                <p style={{ margin: "8px 0 0", fontSize: 11.5, color: "#8A6A1E" }}>
                  Este cliente no tiene teléfono en su ficha: se abrirá WhatsApp sin destinatario.
                </p>
              )}
            </div>
            <canvas ref={canvasRef} style={{ width: "100%", maxWidth: 380, border: "1px solid #EDE4CE", borderRadius: 8, display: "block", margin: "0 auto" }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Boletas: selector de tipo (paseo/adiestramiento) ----------
export function Boletas({ clientes, boletasEmitidas, boletasAdiestramiento, onRegistrarBoleta, onRegistrarBoletaAdiestramiento, recargoPct, actualizarRecargoPct, rolActual, registroPaseos = {} }) {
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
        <FormularioBoletaPaseo clientes={clientes} boletasEmitidas={boletasEmitidas} onRegistrarBoleta={onRegistrarBoleta} recargoPct={recargoPct} actualizarRecargoPct={actualizarRecargoPct} registroPaseos={registroPaseos} />
      ) : (
        <FormularioBoletaAdiestramiento clientes={clientes} onRegistrarBoleta={onRegistrarBoletaAdiestramiento} />
      )}
    </div>
  );
}
