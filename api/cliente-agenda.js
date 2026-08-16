// Función serverless de Vercel: agenda de citas SIN login. Hay dos formas
// de llegar acá:
//   - howria.cl/agendaadiestrador?c=<clienteId> — el equipo lo comparte
//     desde la ficha de un cliente que ya existe (nombre/perro precargados).
//   - howria.cl/agendaadiestrador (sin ?c=) — link genérico, público, para
//     cualquier persona que todavía no es cliente; deja sus datos de
//     contacto y eso crea un prospecto (pestaña Seguimiento) en vez de
//     reservar a nombre de un cliente.
// Ninguno de los dos depende de Supabase Auth — todo pasa por acá, con la
// service role key (nunca expuesta al navegador); esta función valida
// todo del lado servidor.
//
// GET  ?clienteId=X (opcional)             -> datos del cliente (si hay id) + adiestradores + tarifas
// GET  ?clienteId=X&adiestrador=Y          -> lo mismo, más el mapa de disponibilidad por fecha de Y (para pintar el calendario)
// GET  ?clienteId=X&adiestrador=Y&fecha=Z  -> lo mismo, más los horarios libres ese día puntual
// POST { clienteId, adiestrador, tipo, fechaISO }                              -> cita a nombre de un cliente existente
// POST { nombre, email, telefono, perro, adiestrador, tipo, fechaISO }         -> crea un prospecto + la cita
import { createClient } from "@supabase/supabase-js";
import { enviarNotificacionPush } from "./_lib/enviarPush.js";

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

// Fecha/hora de Chile (no UTC) de un instante — el servidor corre en UTC,
// así que un fechaISO de la noche puede caer en otro día calendario si se
// lee con .slice()/getUTCDate() directo.
function fechaChile(fechaISO) {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_CHILE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(fechaISO));
  const obj = {};
  partes.forEach((p) => { obj[p.type] = p.value; });
  return `${obj.year}-${obj.month}-${obj.day}`;
}
function horaChile(fechaISO) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_CHILE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(fechaISO)) + ":00";
}

// `bloques` es la lista de horas de inicio ("09:00") que el adiestrador
// habilitó para esa fecha puntual (disponibilidad_fecha) — cada una es un
// slot fijo de duracionMin, no un rango a trocear.
function calcularSlotsDisponibles({ fecha, bloques, ocupados, duracionMin = DURACION_MIN }) {
  if (!fecha || !bloques || bloques.length === 0) return [];
  const offset = offsetChileISO(fecha);
  const ahora = Date.now();
  const slots = [];
  bloques.forEach((horaInicio) => {
    const inicio = new Date(`${fecha}T${horaInicio}${offset}`);
    const inicioSlot = inicio.getTime();
    const finSlot = inicioSlot + duracionMin * 60000;
    const choca = ocupados.some((o) => {
      const oIni = new Date(o.fecha_hora).getTime();
      const oFin = oIni + (o.duracion_min || 60) * 60000;
      return inicioSlot < oFin && finSlot > oIni;
    });
    if (!choca && inicioSlot > ahora) slots.push(inicio.toISOString());
  });
  return slots.sort();
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

    let cliente = null;
    let puedeAgendar = true;
    if (clienteId) {
      const { data: clienteRow, error: clienteErr } = await admin
        .from("clientes")
        .select("id, nombre, perro, tipo_servicio, direccion")
        .eq("id", clienteId)
        .maybeSingle();
      if (clienteErr || !clienteRow) {
        res.status(404).json({ error: "Link inválido — no encontramos tu ficha de cliente" });
        return;
      }
      cliente = clienteRow;
      puedeAgendar = (cliente.tipo_servicio || []).some((t) => t === "clases" || t === "evaluacion");
    }

    const { data: usuarios } = await admin.from("usuarios").select("nombre").eq("rol", "entrenador");
    const { data: tarifas } = await admin
      .from("tarifas_adiestrador")
      .select("adiestrador, precio_evaluacion, precio_clase");

    let slots;
    let disponibilidadFechas;
    if (adiestrador) {
      const hoyStr = fechaChile(new Date().toISOString());
      const limite = new Date(); limite.setDate(limite.getDate() + DIAS_ADELANTE_MAX);
      const limiteStr = fechaChile(limite.toISOString());
      const { data: filasDisponibilidad } = await admin
        .from("disponibilidad_fecha")
        .select("fecha, hora_inicio")
        .eq("adiestrador", adiestrador)
        .gte("fecha", hoyStr)
        .lte("fecha", limiteStr);
      // Cada fecha con al menos un bloque habilitado cuenta como
      // "disponible" para pintar el calendario — el detalle de cuáles
      // bloques exactos sigue abajo, cuando se pide un día puntual.
      disponibilidadFechas = {};
      (filasDisponibilidad || []).forEach((f) => { disponibilidadFechas[f.fecha] = true; });

      if (fecha) {
        const bloquesDia = (filasDisponibilidad || []).filter((f) => f.fecha === fecha).map((f) => f.hora_inicio);
        const { data: ocupados } = await admin
          .from("citas_agenda")
          .select("fecha_hora, duracion_min")
          .eq("adiestrador", adiestrador)
          .in("estado", ["pendiente", "agendada"])
          .gte("fecha_hora", `${fecha}T00:00:00${offsetChileISO(fecha)}`)
          .lt("fecha_hora", `${fecha}T23:59:59${offsetChileISO(fecha)}`);
        slots = calcularSlotsDisponibles({ fecha, bloques: bloquesDia, ocupados: ocupados || [] });
      }
    }

    res.status(200).json({
      cliente: cliente ? { nombre: cliente.nombre, perro: cliente.perro, tipoServicio: cliente.tipo_servicio || [], direccion: cliente.direccion || "" } : null,
      puedeAgendar,
      adiestradores: (usuarios || []).map((u) => u.nombre),
      disponibilidadFechas,
      tarifas: (tarifas || []).map((t) => ({ adiestrador: t.adiestrador, precioEvaluacion: t.precio_evaluacion, precioClase: t.precio_clase })),
      slots,
      diasAdelanteMax: DIAS_ADELANTE_MAX,
    });
    return;
  }

  if (req.method === "POST") {
    const { clienteId, nombre, email, telefono, perro, direccion, adiestrador, tipo, fechaISO } = req.body || {};
    if (!adiestrador || !tipo || !fechaISO) {
      res.status(400).json({ error: "Faltan datos de la solicitud" });
      return;
    }
    if (!clienteId && (!nombre?.trim() || !email?.trim() || !telefono?.trim() || !perro?.trim() || !direccion?.trim())) {
      res.status(400).json({ error: "Faltan tus datos de contacto (nombre, correo, teléfono, perro y dirección)" });
      return;
    }
    if (clienteId && !direccion?.trim()) {
      res.status(400).json({ error: "Falta confirmar tu dirección" });
      return;
    }
    if (!clienteId && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      res.status(400).json({ error: "El correo no parece válido" });
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

    let cliente = null;
    if (clienteId) {
      const { data: clienteRow, error: clienteErr } = await admin
        .from("clientes")
        .select("id, nombre, perro, tipo_servicio, email, telefono")
        .eq("id", clienteId)
        .maybeSingle();
      if (clienteErr || !clienteRow) {
        res.status(404).json({ error: "Link inválido — no encontramos tu ficha de cliente" });
        return;
      }
      if (!(clienteRow.tipo_servicio || []).some((t) => t === "clases" || t === "evaluacion")) {
        res.status(403).json({ error: "Esta ficha no tiene adiestramiento habilitado" });
        return;
      }
      cliente = clienteRow;
      // Guarda la dirección confirmada/editada en el formulario — así queda
      // al día para geocodificar en Mapa aunque el cliente nunca pise el
      // panel de administración.
      await admin.from("clientes").update({ direccion: direccion.trim() }).eq("id", clienteId);
    }

    const { data: entrenador } = await admin.from("usuarios").select("nombre").eq("nombre", adiestrador).eq("rol", "entrenador").maybeSingle();
    if (!entrenador) {
      res.status(400).json({ error: "Adiestrador inválido" });
      return;
    }

    // el precio queda "congelado" en la cita al momento de la solicitud —
    // si el adiestrador cambia su tarifa después, no afecta lo que ya se
    // vio y reservó. Si no hay tarifa cargada para este adiestrador/tipo,
    // se rechaza en vez de guardar la cita con precio $0 en silencio.
    const { data: tarifa } = await admin
      .from("tarifas_adiestrador")
      .select("precio_evaluacion, precio_clase")
      .eq("adiestrador", adiestrador)
      .maybeSingle();
    const precio = tipo === "evaluacion" ? tarifa?.precio_evaluacion : tarifa?.precio_clase;
    if (precio == null) {
      res.status(409).json({ error: "Este adiestrador todavía no tiene una tarifa configurada para este tipo de cita — contáctanos directamente para coordinar." });
      return;
    }

    // re-chequeo de que el bloque pedido esté realmente habilitado — el
    // calendario público ya no debería dejar elegir un bloque cerrado o sin
    // marcar, pero se valida también acá por si acaso (mismo criterio de
    // defensa que el re-chequeo de choque de horario de más abajo).
    const fechaSolicitada = fechaChile(fechaISO);
    const horaSolicitada = horaChile(fechaISO);
    const { data: bloqueHabilitado } = await admin
      .from("disponibilidad_fecha")
      .select("id")
      .eq("adiestrador", adiestrador)
      .eq("fecha", fechaSolicitada)
      .eq("hora_inicio", horaSolicitada)
      .maybeSingle();
    if (!bloqueHabilitado) {
      res.status(409).json({ error: "Ese día u horario ya no está disponible — elige otro" });
      return;
    }

    // re-chequeo de choque de horario (defensa contra condiciones de carrera
    // entre que se vieron los horarios libres y se envió la solicitud)
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

    let prospectoId = null;
    let clienteNuevoId = null;
    if (!cliente) {
      // link genérico: quien reserva todavía no es cliente — sus datos
      // quedan como prospecto para que el equipo le dé seguimiento (venta/
      // marketing) Y, además, se crea un cliente real de una vez —
      // incompleto a propósito (sin paseador, sin tarifa, sin plan; el
      // coordinador lo completa después si el trato avanza) — para que
      // apenas se acepte la cita ya aparezca solo en "Clientes por
      // atender" del entrenador (ver InicioPaseador en HowriaAdmin.jsx,
      // que ya filtra citas agendadas con cliente_id), sin depender de que
      // el entrenador tenga acceso a Seguimiento.
      const { data: nuevoProspecto, error: prospectoErr } = await admin
        .from("prospectos")
        .insert({
          nombre: nombre.trim(),
          email: email.trim(),
          telefono: telefono.trim(),
          perro: perro.trim(),
          direccion: direccion.trim(),
          origen: "Agenda pública",
          tipo_servicio: [tipo === "evaluacion" ? "evaluacion" : "clases"],
          estado: "nuevo",
        })
        .select("id")
        .single();
      if (prospectoErr || !nuevoProspecto) {
        res.status(500).json({ error: "No se pudieron guardar tus datos" });
        return;
      }
      prospectoId = nuevoProspecto.id;

      const { data: nuevoCliente, error: clienteErr } = await admin
        .from("clientes")
        .insert({
          nombre: nombre.trim(),
          perro: perro.trim(),
          telefono: telefono.trim(),
          email: email.trim(),
          valor_paseo_ref: 0,
          raza: null,
          peso_kg: null,
          foto_url: null,
          dias_habituales: [],
          hora_habitual: null,
          plan_habitual: null,
          objetivos: null,
          paseador_nombre: null,
          tarifa_paseador: 0,
          adiestrador_nombre: adiestrador,
          direccion: direccion.trim(),
          lat: null,
          lng: null,
          tipo_servicio: [tipo === "evaluacion" ? "evaluacion" : "clases"],
          estado_cliente: "activo",
          fecha_inicio: null,
        })
        .select("id")
        .single();
      if (clienteErr || !nuevoCliente) {
        res.status(500).json({ error: "No se pudieron guardar tus datos" });
        return;
      }
      clienteNuevoId = nuevoCliente.id;
    }

    const { error: insertErr } = await admin.from("citas_agenda").insert({
      cliente_id: cliente ? cliente.id : clienteNuevoId,
      prospecto_id: prospectoId,
      cliente_nombre: cliente ? cliente.nombre : nombre.trim(),
      perro: cliente ? cliente.perro : perro.trim(),
      // Copia redundante (mismo criterio que cliente_nombre/perro) — así
      // el adiestrador ve en Agenda lo que se dejó al pedir la cita, sin
      // necesitar acceso a la tabla prospectos (coordinador/admin only).
      email: cliente ? cliente.email : email.trim(),
      telefono: cliente ? cliente.telefono : telefono.trim(),
      direccion: direccion.trim(),
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

    const nombreSolicitante = cliente ? cliente.nombre : nombre.trim();
    const tipoTexto = tipo === "evaluacion" ? "una evaluación" : "una clase";
    await enviarNotificacionPush(admin, {
      titulo: "Nueva solicitud de cita",
      cuerpo: `${nombreSolicitante} pidió ${tipoTexto} con ${adiestrador}`,
      url: "/admin",
      evento: "cita",
    });

    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Método no permitido" });
}
