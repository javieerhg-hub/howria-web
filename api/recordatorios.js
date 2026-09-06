// Función serverless de Vercel: los dos recordatorios automáticos del día.
// La disparan los crons declarados en vercel.json — nadie la llama a mano.
//
//   ?momento=manana   8:30  "sal a tu ruta"
//   ?momento=tarde   18:00  "¿marcaste tus paseos?"
//
// Un solo archivo para los dos, con ?momento=, por el mismo motivo que
// api/citas.js: el plan Hobby de Vercel permite 12 funciones y vamos en 10
// con esta. Dos endpoints separados serían 11.
//
// TRES COSAS QUE MANDAN SOBRE EL DISEÑO, las tres de la documentación de
// Vercel y las tres verificadas antes de escribir esto:
//
//  1. "The timezone is always UTC". Los crons no saben de Chile, y Chile
//     cambia la hora dos veces al año. Por eso hay DOS crons por horario
//     —uno para cada temporada— y esta función revisa la hora REAL de
//     Chile y solo actúa dentro de su ventana. El cron de la otra
//     temporada cae fuera y se va sin hacer nada.
//
//  2. Precisión de ±59 minutos en Hobby: "a cron job configured as 0 1 ***
//     will trigger anywhere between 1:00 am and 1:59 am". Por eso la
//     ventana es de horas y no de minutos, y por eso el aviso de la mañana
//     puede llegar entre 8:30 y 9:29. No hay forma de afinarlo sin pasar
//     a Pro.
//
//  3. "Cron delivery can occasionally invoke the same scheduled run more
//     than once". La función tiene que aguantar que la llamen dos veces.
//     Lo resuelve la tabla recordatorios_enviados (database/127): se
//     RESERVA el día antes de mandar nada, y si la reserva falla porque
//     ya existe, se va en silencio.
import { createClient } from "@supabase/supabase-js";
import { enviarNotificacionPushAEmails } from "./_lib/enviarPush.js";
import { estaProgramadoEnFecha } from "../src/lib/programacion.js";

const ZONA = "America/Santiago";

// Hoy en Chile, "YYYY-MM-DD". El servidor corre en UTC, así que cerca de
// medianoche la fecha del servidor y la de Chile no son la misma — y de
// eso depende a quién le toca paseo.
export function fechaDeChile(ahora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(ahora);
}

// La hora de Chile ahora mismo, 0-23.
export function horaDeChile(ahora = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA, hour: "2-digit", hourCycle: "h23",
  }).format(ahora));
}

export const MOMENTOS = {
  manana: {
    // El cron correcto cae entre 8:30 y 9:29 de Chile. El de la otra
    // temporada cae entre 9:30 y 10:29: se pisa con la hora 9, y ahí lo
    // detiene la reserva del día, no esta ventana.
    horas: [8, 9],
    titulo: "Hora de salir 🐾",
    // El texto lo arma cada momento con lo que encontró.
    cuerpo: (n) => `Tienes ${n} paseo${n === 1 ? "" : "s"} hoy. Toca "Iniciar ruta" cuando salgas.`,
    tag: "recordatorio-manana",
  },
  tarde: {
    // Acá la ventana es de una hora sola: el cron de la otra temporada cae
    // en la 17 o en la 19, así que no se pisan.
    horas: [18],
    titulo: "¿Marcaste tus paseos?",
    cuerpo: (n) => `Te ${n === 1 ? "queda" : "quedan"} ${n} paseo${n === 1 ? "" : "s"} de hoy sin marcar.`,
    tag: "recordatorio-tarde",
  },
};

// Las filas de clientes, con los nombres que usa estaProgramadoEnFecha.
// Se reusa la función de verdad (src/lib/programacion.js) en vez de
// reescribir la regla acá: es la misma pregunta que contesta Coordinación,
// y ya se pagó una vez el precio de tenerla contestada en varios lugares
// con reglas distintas (ver la memoria del proyecto).
function aClienteDelFrontend(row) {
  return {
    _dbId: row.id,
    nombre: row.nombre,
    paseadorNombre: row.paseador_nombre,
    tipoServicio: row.tipo_servicio,
    estadoCliente: row.estado_cliente,
    diasHabituales: row.dias_habituales,
    diasPuntuales: row.dias_puntuales,
  };
}

export default async function handler(req, res) {
  const momento = MOMENTOS[req.query?.momento];
  if (!momento) {
    res.status(400).json({ error: "Momento desconocido. Usa ?momento=manana o ?momento=tarde." });
    return;
  }

  // Vercel manda este encabezado cuando CRON_SECRET está configurado. Sin
  // esto, cualquiera con la URL podría dispararle notificaciones al equipo.
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.authorization !== `Bearer ${secreto}`) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: "Falta configuración del servidor" });
    return;
  }

  // FUERA DE VENTANA: es el cron de la otra temporada. No es un error.
  const hora = horaDeChile();
  if (!momento.horas.includes(hora)) {
    res.status(200).json({ ok: true, omitido: `Son las ${hora} en Chile, fuera de la ventana` });
    return;
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const hoy = fechaDeChile();
  const clave = `${req.query.momento}-${hoy}`;

  // RESERVAR ANTES DE MANDAR. Si dos invocaciones llegan a la vez, solo una
  // gana el insert; la otra choca con la llave primaria y se va. Al revés
  // —mandar y después anotar— las dos mandarían.
  const { error: errReserva } = await admin.from("recordatorios_enviados").insert({ clave });
  if (errReserva) {
    // 23505 = llave duplicada: ya salió hoy. Cualquier otro error sí es un
    // problema, pero tampoco se manda: sin poder anotar, no hay forma de
    // evitar el duplicado.
    res.status(200).json({ ok: true, omitido: errReserva.code === "23505" ? "Ya se envió hoy" : "No se pudo reservar" });
    return;
  }

  const [{ data: filasClientes }, { data: repro }, { data: fases }, { data: usuarios }] = await Promise.all([
    admin.from("clientes").select("id, nombre, paseador_nombre, tipo_servicio, estado_cliente, dias_habituales, dias_puntuales"),
    admin.from("paseos_reprogramados").select("cliente_id, fecha_nueva").eq("fecha_nueva", hoy),
    admin.from("fase_dia_paseador").select("paseador_nombre, fase, ausente_motivo").eq("fecha", hoy),
    admin.from("usuarios").select("nombre, email, rol"),
  ]);

  // Mediodía UTC de la fecha chilena: así getDay() y fechaKey() —que leen
  // la hora local, y en el servidor local es UTC— dan el día de la semana y
  // la fecha de CHILE, no los del servidor.
  const fecha = new Date(`${hoy}T12:00:00Z`);
  const reprogramaciones = (repro || []).map((r) => ({ clienteId: r.cliente_id, fechaNueva: r.fecha_nueva }));

  const deHoy = (filasClientes || [])
    .map(aClienteDelFrontend)
    .filter((c) => c.paseadorNombre && estaProgramadoEnFecha(c, fecha, reprogramaciones));

  // Cuántos paseos le tocan hoy a cada persona.
  const porPaseador = new Map();
  for (const c of deHoy) {
    if (!porPaseador.has(c.paseadorNombre)) porPaseador.set(c.paseadorNombre, []);
    porPaseador.get(c.paseadorNombre).push(c);
  }

  const estadoPorPaseador = new Map((fases || []).map((f) => [f.paseador_nombre, f]));

  let aAvisar = [];
  if (req.query.momento === "manana") {
    // Solo a quien le toca trabajar y todavía no arrancó. A alguien con el
    // día libre no se le manda nada: un aviso que no aplica es la forma más
    // rápida de enseñarle a la gente a ignorar las notificaciones.
    aAvisar = [...porPaseador.entries()]
      .filter(([nombre]) => {
        const f = estadoPorPaseador.get(nombre);
        if (f?.ausente_motivo) return false;              // ya justificó ausencia
        return !f?.fase || f.fase === "pendiente";        // todavía no sale
      })
      .map(([nombre, clientes]) => ({ nombre, cuantos: clientes.length }));
  } else {
    // De tarde importa lo que quedó SIN MARCAR: ni realizado ni cancelado.
    const idsDeHoy = deHoy.map((c) => c._dbId);
    const { data: registros } = idsDeHoy.length
      ? await admin.from("registro_paseos").select("cliente_id, estado").eq("fecha", hoy).in("cliente_id", idsDeHoy)
      : { data: [] };
    const resueltos = new Set((registros || [])
      .filter((r) => r.estado === "realizado" || r.estado === "cancelado")
      .map((r) => r.cliente_id));

    aAvisar = [...porPaseador.entries()]
      .map(([nombre, clientes]) => ({ nombre, cuantos: clientes.filter((c) => !resueltos.has(c._dbId)).length }))
      .filter((x) => x.cuantos > 0);
  }

  const emailPorNombre = new Map((usuarios || []).map((u) => [u.nombre, u.email]));
  let enviados = 0;
  const detalle = [];
  for (const { nombre, cuantos } of aAvisar) {
    const email = emailPorNombre.get(nombre);
    if (!email) continue;
    // Uno por persona, con SU número: "tienes 4 paseos" le sirve a quien lo
    // lee; "hay 12 paseos hoy" no le dice qué hacer.
    const n = await enviarNotificacionPushAEmails(admin, [email], {
      titulo: momento.titulo,
      cuerpo: momento.cuerpo(cuantos),
      url: "/admin?tab=mis-paseos",
      tag: momento.tag,
    });
    enviados += n;
    detalle.push(`${nombre}: ${cuantos} paseo(s)${n === 0 ? " — sin notificaciones activadas" : ""}`);
  }

  await admin.from("recordatorios_enviados")
    .update({ a_cuantos: enviados, detalle: detalle.join(" · ").slice(0, 500) })
    .eq("clave", clave);

  res.status(200).json({ ok: true, momento: req.query.momento, personas: aAvisar.length, suscripciones: enviados });
}
