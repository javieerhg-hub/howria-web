// Función serverless de Vercel: agenda de citas SIN login. El tutor recibe
// un link (howria.cl/agendar?c=<clienteId>) que el equipo le manda a mano
// por WhatsApp/correo — no depende del login por link mágico de Supabase
// Auth (ese quedó solo para que el cliente vea sus boletas).
//
// GET  ?clienteId=X                       -> datos del cliente + adiestradores + disponibilidad
// GET  ?clienteId=X&adiestrador=Y&fecha=Z -> lo mismo, más los horarios libres ese día
// POST { clienteId, adiestrador, tipo, fechaISO } -> crea la cita "pendiente"
//
// Todo pasa por la service role key (nunca expuesta al navegador) — el
// cliente nunca tiene una sesión de Supabase, así que no puede leer/escribir
// nada directo contra la base; esta función valida todo del lado servidor.
import { createClient } from "@supabase/supabase-js";

const DURACION_MIN = 60;
const DIAS_ADELANTE_MAX = 45;
const ZONA_CHILE = "America/Santiago";

// El horario del adiestrador (ej. "09:00") es hora de Chile, pero esta
// función corre en el servidor de Vercel (UTC) — hay que anclar el offset
// explícitamente o "09:00" se interpreta como 09:00 UTC (5 horas antes de
// lo que corresponde). Se calcula con Intl en vez de un offset fijo porque
// Chile tiene horario de verano y el desfase cambia según la fecha.
function offsetChileISO(fechaStr) {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_CHILE, timeZoneName: "longOffset" })
    .formatToParts(new Date(`${fechaStr}T12:00:00Z`));
  const gmt = partes.find((p) => p.type === "timeZoneName").value; // "GMT-04:00" o "GMT-03:00"
  return gmt.replace("GMT", "");
}

function calcularSlotsDisponibles({ diaSemana, rango, ocupados, duracionMin = DURACION_MIN }) {
  if (!rango) return [];
  const [fecha] = rango.fecha.split("T");
  const offset = offsetChileISO(fecha);
  const slots = [];
  let cursor = new Date(`${fecha}T${rango.horaInicio}${offset}`);
  const fin = new Date(`${fecha}T${rango.horaFin}${offset}`);
  const ahora = Date.now();
  while (cursor.getTime() + duracionMin * 60000 <= fin.getTime()) {
    const inicioSlot = cursor.getTime();
    const finSlot = inicioSlot + duracionMin * 60000;
    const choca = ocupados.some((o) => {
      const oIni = new Date(o.fecha_hora).getTime();
      const oFin = oIni + (o.duracion_min || 60) * 60000;
      return inicioSlot < oFin && finSlot > oIni;
    });
    if (!choca && inicioSlot > ahora) slots.push(new Date(cursor).toISOString());
    cursor = new Date(cursor.getTime() + duracionMin * 60000);
  }
  return slots;
}

export default async function handler(req, res) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)" });
    return;
  }
  const admin = createClient(supabaseUrl, serviceRoleKey);

  if (req.method === "GET") {
    const { clienteId, adiestrador, fecha } = req.query || {};
    if (!clienteId) {
      res.status(400).json({ error: "Falta clienteId" });
      return;
    }

    const { data: cliente, error: clienteErr } = await admin
      .from("clientes")
      .select("id, nombre, perro, tipo_servicio")
      .eq("id", clienteId)
      .maybeSingle();
    if (clienteErr || !cliente) {
      res.status(404).json({ error: "Link inválido — no encontramos tu ficha de cliente" });
      return;
    }

    const puedeAgendar = (cliente.tipo_servicio || []).some((t) => t === "clases" || t === "evaluacion");

    const { data: usuarios } = await admin.from("usuarios").select("nombre").eq("rol", "entrenador");
    const { data: disponibilidad } = await admin
      .from("disponibilidad_adiestrador")
      .select("adiestrador, dia_semana, hora_inicio, hora_fin")
      .eq("activo", true);
    const { data: tarifas } = await admin
      .from("tarifas_adiestrador")
      .select("adiestrador, precio_evaluacion, precio_clase");

    let slots;
    if (adiestrador && fecha) {
      const dow = (new Date(`${fecha}T00:00:00Z`).getUTCDay() + 6) % 7; // 0=lunes
      const rangoRow = (disponibilidad || []).find((d) => d.adiestrador === adiestrador && d.dia_semana === dow);
      const { data: ocupados } = await admin
        .from("citas_agenda")
        .select("fecha_hora, duracion_min")
        .eq("adiestrador", adiestrador)
        .in("estado", ["pendiente", "agendada"])
        .gte("fecha_hora", `${fecha}T00:00:00${offsetChileISO(fecha)}`)
        .lt("fecha_hora", `${fecha}T23:59:59${offsetChileISO(fecha)}`);
      slots = calcularSlotsDisponibles({
        rango: rangoRow ? { fecha, horaInicio: rangoRow.hora_inicio, horaFin: rangoRow.hora_fin } : null,
        ocupados: ocupados || [],
      });
    }

    res.status(200).json({
      cliente: { nombre: cliente.nombre, perro: cliente.perro, tipoServicio: cliente.tipo_servicio || [] },
      puedeAgendar,
      adiestradores: (usuarios || []).map((u) => u.nombre),
      disponibilidad: (disponibilidad || []).map((d) => ({ adiestrador: d.adiestrador, diaSemana: d.dia_semana, horaInicio: d.hora_inicio, horaFin: d.hora_fin })),
      tarifas: (tarifas || []).map((t) => ({ adiestrador: t.adiestrador, precioEvaluacion: t.precio_evaluacion, precioClase: t.precio_clase })),
      slots,
      diasAdelanteMax: DIAS_ADELANTE_MAX,
    });
    return;
  }

  if (req.method === "POST") {
    const { clienteId, adiestrador, tipo, fechaISO } = req.body || {};
    if (!clienteId || !adiestrador || !tipo || !fechaISO) {
      res.status(400).json({ error: "Faltan datos de la solicitud" });
      return;
    }
    if (!["evaluacion", "clase"].includes(tipo)) {
      res.status(400).json({ error: "Tipo de cita inválido" });
      return;
    }
    if (new Date(fechaISO).getTime() <= Date.now()) {
      res.status(400).json({ error: "La fecha debe ser futura" });
      return;
    }

    const { data: cliente, error: clienteErr } = await admin
      .from("clientes")
      .select("id, nombre, perro, tipo_servicio")
      .eq("id", clienteId)
      .maybeSingle();
    if (clienteErr || !cliente) {
      res.status(404).json({ error: "Link inválido — no encontramos tu ficha de cliente" });
      return;
    }
    if (!(cliente.tipo_servicio || []).some((t) => t === "clases" || t === "evaluacion")) {
      res.status(403).json({ error: "Esta ficha no tiene adiestramiento habilitado" });
      return;
    }

    const { data: entrenador } = await admin.from("usuarios").select("nombre").eq("nombre", adiestrador).eq("rol", "entrenador").maybeSingle();
    if (!entrenador) {
      res.status(400).json({ error: "Adiestrador inválido" });
      return;
    }

    // re-chequeo de choque de horario (defensa contra condiciones de carrera
    // entre que el cliente vio los horarios libres y envió la solicitud)
    const inicioNuevo = new Date(fechaISO).getTime();
    const finNuevo = inicioNuevo + DURACION_MIN * 60000;
    const { data: ocupados } = await admin
      .from("citas_agenda")
      .select("fecha_hora, duracion_min")
      .eq("adiestrador", adiestrador)
      .in("estado", ["pendiente", "agendada"]);
    const choca = (ocupados || []).some((o) => {
      const oIni = new Date(o.fecha_hora).getTime();
      const oFin = oIni + (o.duracion_min || 60) * 60000;
      return inicioNuevo < oFin && finNuevo > oIni;
    });
    if (choca) {
      res.status(409).json({ error: "Ese horario ya no está disponible — elige otro" });
      return;
    }

    // el precio queda "congelado" en la cita al momento de la solicitud —
    // si el adiestrador cambia su tarifa después, no afecta lo que el
    // cliente ya vio y reservó.
    const { data: tarifa } = await admin
      .from("tarifas_adiestrador")
      .select("precio_evaluacion, precio_clase")
      .eq("adiestrador", adiestrador)
      .maybeSingle();
    const precio = tipo === "evaluacion" ? (tarifa?.precio_evaluacion ?? 0) : (tarifa?.precio_clase ?? 0);

    const { error: insertErr } = await admin.from("citas_agenda").insert({
      cliente_id: cliente.id,
      cliente_nombre: cliente.nombre,
      perro: cliente.perro,
      tipo,
      adiestrador,
      fecha_hora: fechaISO,
      estado: "pendiente",
      origen: "cliente",
      duracion_min: DURACION_MIN,
      precio,
    });
    if (insertErr) {
      res.status(500).json({ error: "No se pudo guardar la solicitud" });
      return;
    }

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método no permitido" });
}
