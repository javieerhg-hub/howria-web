import React, { useState, useRef, useMemo, useEffect, Suspense } from "react";
import {
  Bell, BellOff, Home, Footprints, MapPinned, Map as MapIcon, Calendar, CalendarDays, Route, Mail as MailIcon, Dog, Receipt,
  FileText, TrendingUp, Banknote, Users, ShieldCheck, Target, LayoutGrid, CircleCheck, CircleX,
  GraduationCap, KeyRound,
} from "lucide-react";
import { supabase } from "./lib/supabaseClient.js";
import { soportaPush, suscripcionActiva, suscribirNotificaciones, desuscribirNotificaciones, esIOSFueraDeApp } from "./lib/pushNotificaciones.js";
import { RECARGO_FIN_SEMANA_FERIADO_DEFAULT, diasSegunPlan, esVenta, esPorCobrar } from "./lib/calculosBoletas.js";

// Todo menos Inicio/Mis paseos vive en un archivo aparte, cargado solo
// cuando de verdad se entra a esa pestaña — así un paseador (que solo ve
// Inicio/Mis paseos/Finanzas) no descarga el código de las otras 14
// pestañas que nunca usa. Los 14 nombres son componentes React normales
// una vez resueltos; el resto del archivo los usa igual que si estuvieran
// definidos acá mismo.
const Boletas = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Boletas })));
const Facturas = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Facturas })));
const Clientes = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Clientes })));
const Finanzas = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Finanzas })));
const PagoTrabajadores = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.PagoTrabajadores })));
const Coordinacion = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Coordinacion })));
const MapaRutas = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.MapaRutas })));
const EquipoTrabajo = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.EquipoTrabajo })));
const Agenda = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Agenda })));
const Alumnos = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Alumnos })));
const CalendarioAlumnos = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.CalendarioAlumnos })));
const Itinerario = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Itinerario })));
const Mail = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Mail })));
const Prospectos = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.Prospectos })));
const PanelAdmin = React.lazy(() => import("./HowriaAdminResto.jsx").then((m) => ({ default: m.PanelAdmin })));

// Aparte de las 14 pestañas de arriba: la ruta guiada de Mis Paseos es su
// propio chunk, ni en este archivo (se carga siempre, para todo rol, y no
// vale la pena meterle Leaflet si un coordinador nunca la abre) ni en
// HowriaAdminResto.jsx (ese lazy trae las 14 pestañas juntas — importar
// desde ahí arrastraría todo Resto solo para abrir la ruta).
const RutaGuiada = React.lazy(() => import("./RutaGuiada.jsx").then((m) => ({ default: m.RutaGuiada })));

// El gráfico de Inicio (recharts) también aparte — recharts es pesada y
// este archivo se carga siempre, hasta para la pantalla de login, que
// nunca llega a mostrar un gráfico.
const GraficoIngresosSemana = React.lazy(() => import("./GraficosInicio.jsx").then((m) => ({ default: m.GraficoIngresosSemana })));

// Sin esto, si algo revienta al renderizar una pestaña, React desmonta
// todo el árbol y la pantalla queda en blanco sin ningún aviso (header y
// barra de navegación incluidos). Con esto al menos se ve un mensaje y se
// puede volver a Inicio en vez de quedar con una pantalla muerta. El
// key={tab} en el llamador reinicia este estado al cambiar de pestaña.
class LimiteDeError extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Error al renderizar la pestaña:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Algo salió mal en esta sección</h2>
          <p style={hint}>Prueba recargando la página. Si sigue pasando después de recargar, avísale al equipo técnico.</p>
          <button onClick={this.props.onVolver} style={{ ...botonPrincipal, width: "auto", padding: "10px 20px" }}>Volver a Inicio</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Redimensiona y recomprime una foto subida desde un <input type="file">
// antes de guardarla como base64 en una fila de Supabase (perfil de
// usuario, foto del perro) — sin esto, una foto de cámara de celular
// (varios MB) se guarda entera en la tabla, y como esa tabla se descarga
// completa en cada carga de la pestaña correspondiente, fotos grandes
// hacen más lenta la app para todo el mundo. Si el navegador no soporta
// createImageBitmap, se cae de vuelta a guardar el archivo tal cual.
export async function comprimirImagen(file, maxLado = 480, calidad = 0.8) {
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * escala) || 1;
    const h = Math.round(bitmap.height * escala) || 1;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", calidad);
  } catch {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

// ============================================================
// CONEXIÓN A SUPABASE — clientes, boletas y registro de paseos
// ============================================================

function clienteToDb(c) {
  return {
    nombre: c.nombre,
    perro: c.perro,
    telefono: c.telefono,
    email: c.email || null,
    valor_paseo_ref: c.valorPaseoRef,
    raza: c.raza,
    peso_kg: c.pesoKg,
    foto_url: c.fotoUrl,
    dias_habituales: c.diasHabituales || [],
    hora_habitual: c.horaHabitual || null,
    plan_habitual: c.planHabitual,
    objetivos: c.objetivos,
    paseador_nombre: c.paseadorNombre,
    tarifa_paseador: c.tarifaPaseador,
    adiestrador_nombre: c.adiestradorNombre || null,
    responsable_nombre: c.responsableNombre || null,
    comuna: c.comuna || null,
    edad: c.edad || null,
    temas_objetivo: c.temasObjetivo || [],
    acceso_rapido: c.accesoRapido || false,
    bitacora: c.bitacora || [],
    direccion: c.direccion,
    lat: c.lat,
    lng: c.lng,
    tipo_servicio: c.tipoServicio || [],
    estado_cliente: c.estadoCliente,
    fecha_inicio: c.fechaInicio || null,
  };
}

function dbToCliente(row) {
  return {
    nombre: row.nombre,
    perro: row.perro,
    telefono: row.telefono,
    email: row.email,
    valorPaseoRef: row.valor_paseo_ref,
    raza: row.raza,
    pesoKg: row.peso_kg,
    fotoUrl: row.foto_url,
    diasHabituales: row.dias_habituales || [],
    horaHabitual: row.hora_habitual,
    planHabitual: row.plan_habitual,
    objetivos: row.objetivos,
    paseadorNombre: row.paseador_nombre,
    tarifaPaseador: row.tarifa_paseador,
    adiestradorNombre: row.adiestrador_nombre,
    responsableNombre: row.responsable_nombre,
    comuna: row.comuna,
    edad: row.edad,
    temasObjetivo: row.temas_objetivo || [],
    accesoRapido: row.acceso_rapido || false,
    bitacora: row.bitacora || [],
    direccion: row.direccion,
    lat: row.lat,
    lng: row.lng,
    tipoServicio: row.tipo_servicio || [],
    estadoCliente: row.estado_cliente,
    fechaInicio: row.fecha_inicio,
  };
}

export function boletaToDb(b) {
  return {
    // "numero" es "generated always as identity" en la base — Postgres la
    // asigna sola y rechaza cualquier update que la incluya (aunque sea
    // con el mismo valor que ya tiene). Nunca se manda, ni al crear ni al
    // editar; el valor real vuelve leyendo la fila de vuelta (ver
    // dbToBoleta / sincronizar en useSyncedTable).
    cliente_id: b.clienteId || null,
    cliente_nombre: b.cliente,
    perro: b.perro,
    valor_paseo: b.valorPaseo,
    cantidad: b.cantidad,
    dias: b.dias || [],
    mes: b.mes,
    anio: b.anio,
    plan_nombre: b.planNombre,
    paseos_cancelados: b.paseosCancelados,
    paseos_mes_anterior: b.paseosMesAnterior || 0,
    recargo_pct: b.recargoPct ?? 30,
    servicios_extra: { dogsitter: b.dogsitter || null, paseoLargo: b.paseoLargo || null },
    mostrar_iva: b.mostrarIva || false,
    mensaje_personalizado: b.mensajePersonalizado || null,
    descuento: b.descuento,
    total: b.total,
    estado: b.estado,
    fecha_pago: b.fechaPago || null,
    forma_pago: b.formaPago || null,
    editada_por: b.editadaPor || null,
    editada_en: b.editadaEn || null,
    ultima_accion_por: b.ultimaAccionPor || null,
    ultima_accion_en: b.ultimaAccionEn || null,
  };
}

export function dbToBoleta(row) {
  return {
    numero: row.numero,
    clienteId: row.cliente_id,
    cliente: row.cliente_nombre,
    perro: row.perro,
    valorPaseo: row.valor_paseo,
    cantidad: row.cantidad,
    dias: row.dias || [],
    mes: row.mes,
    anio: row.anio,
    planNombre: row.plan_nombre,
    paseosCancelados: row.paseos_cancelados,
    paseosMesAnterior: row.paseos_mes_anterior || 0,
    recargoPct: row.recargo_pct ?? 30,
    dogsitter: row.servicios_extra?.dogsitter || null,
    paseoLargo: row.servicios_extra?.paseoLargo || null,
    mostrarIva: row.mostrar_iva || false,
    mensajePersonalizado: row.mensaje_personalizado || null,
    descuento: row.descuento,
    total: row.total,
    fecha: new Date(row.fecha_hora).toLocaleDateString("es-CL"),
    fechaISO: row.fecha_hora,
    estado: row.estado,
    fechaPago: row.fecha_pago || undefined,
    formaPago: row.forma_pago || undefined,
    editadaPor: row.editada_por || undefined,
    editadaEn: row.editada_en || undefined,
    ultimaAccionPor: row.ultima_accion_por || undefined,
    ultimaAccionEn: row.ultima_accion_en || undefined,
  };
}

export function slugEmailUsuario(nombre) {
  const limpio = nombre.trim().toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, "").trim().replace(/\s+/g, ".");
  return `${limpio}@howria.local`;
}

function usuarioToDb(u) {
  return {
    nombre: u.nombre,
    rol: u.rol,
    foto_url: u.fotoUrl,
    fecha_inicio: u.fechaInicio || null,
    banco: u.datosBancarios?.banco || u.banco || null,
    tipo_cuenta: u.datosBancarios?.tipoCuenta || u.tipoCuenta || null,
    numero_cuenta: u.datosBancarios?.numeroCuenta || u.numeroCuenta || null,
    email: u.email || slugEmailUsuario(u.nombre),
    capacitacion_completada: u.capacitacionCompletada || [],
    capacidad_maxima: u.capacidadMaxima || null,
    meta_mensual: u.metaMensual || null,
  };
}

function dbToUsuario(row) {
  return {
    nombre: row.nombre,
    rol: row.rol,
    fotoUrl: row.foto_url,
    fechaInicio: row.fecha_inicio,
    datosBancarios: { banco: row.banco, tipoCuenta: row.tipo_cuenta, numeroCuenta: row.numero_cuenta },
    email: row.email,
    capacitacionCompletada: row.capacitacion_completada || [],
    capacidadMaxima: row.capacidad_maxima,
    metaMensual: row.meta_mensual,
  };
}

function mascotaToDb(m) {
  return {
    cliente_id: m.clienteId,
    nombre: m.nombre,
    raza: m.raza || null,
    peso_kg: m.pesoKg || null,
    nivel_energia: m.nivelEnergia || null,
    temperamento: m.temperamento || [],
    notas: m.notas || null,
    necesita_revision: m.necesitaRevision || false,
  };
}

function dbToMascota(row) {
  return {
    clienteId: row.cliente_id,
    nombre: row.nombre,
    raza: row.raza,
    pesoKg: row.peso_kg,
    nivelEnergia: row.nivel_energia,
    temperamento: row.temperamento || [],
    notas: row.notas,
    necesitaRevision: row.necesita_revision,
  };
}

function incompatibilidadToDb(i) {
  const [id1, id2] = [i.mascotaId1, i.mascotaId2].sort();
  return { mascota_id_1: id1, mascota_id_2: id2, motivo: i.motivo || null, creado_por: i.creadoPor || null };
}

function dbToIncompatibilidad(row) {
  return { mascotaId1: row.mascota_id_1, mascotaId2: row.mascota_id_2, motivo: row.motivo, creadoPor: row.creado_por };
}

function loginPendienteToDb(l) {
  return { nombre: l.nombre, email: l.email, eliminado_en: l.eliminadoEn || new Date().toISOString(), rol: l.rol || null };
}
function dbToLoginPendiente(row) {
  return { nombre: row.nombre, email: row.email, eliminadoEn: row.eliminado_en, rol: row.rol };
}

export function esBoletaDeCliente(b, c) {
  if (b.clienteId && c._dbId) return b.clienteId === c._dbId;
  return b.cliente === c.nombre;
}


export function boletaAdiestramientoToDb(b) {
  return {
    // "numero" es "generated always as identity" — ver comentario en
    // boletaToDb, mismo motivo, misma tabla del mismo tipo de columna.
    cliente_id: b.clienteId || null,
    cliente_nombre: b.cliente,
    perro: b.perro || null,
    modalidad: b.modalidad,
    num_clases: b.numClases,
    precio_clase: b.precioClase,
    descuento_pack_pct: b.descuentoPackPct || 0,
    descuento_pack_monto: b.descuentoPackMonto || 0,
    evaluacion: b.evaluacion,
    precio_evaluacion: b.precioEvaluacion || 0,
    transporte: b.transporte || 0,
    total: b.total,
    monto_responsable: b.montoResponsable ?? null,
    mensaje_personalizado: b.mensajePersonalizado || null,
    estado: b.estado,
    fecha_pago: b.fechaPago || null,
    forma_pago: b.formaPago || null,
    editada_por: b.editadaPor || null,
    editada_en: b.editadaEn || null,
    ultima_accion_por: b.ultimaAccionPor || null,
    ultima_accion_en: b.ultimaAccionEn || null,
    pagado_a_responsable: b.pagadoAResponsable || false,
    pagado_a_responsable_por: b.pagadoAResponsablePor || null,
    pagado_a_responsable_en: b.pagadoAResponsableEn || null,
  };
}

export function dbToBoletaAdiestramiento(row) {
  return {
    numero: row.numero,
    clienteId: row.cliente_id,
    cliente: row.cliente_nombre,
    perro: row.perro,
    modalidad: row.modalidad,
    numClases: row.num_clases,
    precioClase: row.precio_clase,
    descuentoPackPct: row.descuento_pack_pct,
    descuentoPackMonto: row.descuento_pack_monto || 0,
    evaluacion: row.evaluacion,
    precioEvaluacion: row.precio_evaluacion,
    transporte: row.transporte,
    total: row.total,
    montoResponsable: row.monto_responsable ?? undefined,
    mensajePersonalizado: row.mensaje_personalizado,
    estado: row.estado,
    fechaPago: row.fecha_pago || undefined,
    formaPago: row.forma_pago || undefined,
    editadaPor: row.editada_por || undefined,
    editadaEn: row.editada_en || undefined,
    ultimaAccionPor: row.ultima_accion_por || undefined,
    ultimaAccionEn: row.ultima_accion_en || undefined,
    pagadoAResponsable: row.pagado_a_responsable || false,
    pagadoAResponsablePor: row.pagado_a_responsable_por || undefined,
    pagadoAResponsableEn: row.pagado_a_responsable_en || undefined,
    fecha: new Date(row.fecha_hora).toLocaleDateString("es-CL"),
    fechaISO: row.fecha_hora,
  };
}

function pagoToDb(p) {
  return {
    paseador_nombre: p.paseador,
    periodo: p.periodo,
    etiqueta: p.etiqueta,
    monto: p.monto,
    paseos: p.paseos,
    clientes: p.clientes,
    ajuste: p.ajuste || 0,
    fecha_pago: p.fechaPagoISO || fechaKey(new Date()),
    periodo_desde: p.periodoDesdeISO || null,
    marcado_por: p.marcadoPor || null,
    deshecho_por: p.deshechoPor || null,
    deshecho_en: p.deshechoEn || null,
  };
}

function dbToPago(row) {
  return {
    paseador: row.paseador_nombre,
    periodo: row.periodo,
    etiqueta: row.etiqueta,
    monto: row.monto,
    paseos: row.paseos,
    clientes: row.clientes,
    ajuste: row.ajuste,
    fechaPagoISO: row.fecha_pago,
    fechaPago: new Date(row.fecha_pago + "T00:00:00").toLocaleDateString("es-CL"),
    // Fecha de inicio del período de TRABAJO que cubre el pago (no el
    // día en que se registró) — filas viejas no la tienen, por eso el
    // fallback a fecha_pago en Finanzas (costosPeriodo).
    periodoDesdeISO: row.periodo_desde || null,
    marcadoPor: row.marcado_por || undefined,
    deshechoPor: row.deshecho_por || undefined,
    deshechoEn: row.deshecho_en || undefined,
  };
}

function objetivoSemanalToDb(o) {
  return { texto: o.texto, asignado_a: o.asignadoA || null, semana_key: o.semanaKey, cumplido: o.cumplido };
}
function dbToObjetivoSemanal(row) {
  return { texto: row.texto, asignadoA: row.asignado_a, semanaKey: row.semana_key, cumplido: row.cumplido };
}

function objetivoMensualToDb(o) {
  return { texto: o.texto, asignado_a: o.asignadoA || null, mes_key: o.mesKey, cumplido: o.cumplido };
}
function dbToObjetivoMensual(row) {
  return { texto: row.texto, asignadoA: row.asignado_a, mesKey: row.mes_key, cumplido: row.cumplido };
}

function tareaToDb(t) {
  return { titulo: t.titulo, asignado_a: t.asignadoA || null, enlace: t.enlace || null, fecha_hora: t.fechaISO, estado: t.estado };
}
function dbToTarea(row) {
  return { titulo: row.titulo, asignadoA: row.asignado_a, enlace: row.enlace, fechaISO: row.fecha_hora, estado: row.estado };
}

function citaToDb(c) {
  return {
    cliente_id: c.clienteId || null,
    cliente_nombre: c.clienteNombre,
    perro: c.perro || null,
    // Copia redundante que deja la agenda pública al pedir la cita (ver
    // api/cliente-agenda.js) — no se edita desde acá, solo se reescribe
    // igual en cada guardado normal, mismo criterio que cliente_nombre.
    email: c.email || null,
    telefono: c.telefono || null,
    direccion: c.direccion || null,
    tipo: c.tipo,
    adiestrador: c.adiestrador || null,
    fecha_hora: c.fechaISO,
    estado: c.estado,
    notas: c.notas || null,
    origen: c.origen || "staff",
    duracion_min: c.duracionMin || 60,
    // confirmada_en / email_enviado no se mandan desde acá — los escribe
    // únicamente api/confirmar-cita.js, para que un guardado normal del
    // cliente nunca los pise con estado local desactualizado.
    plan_id: c.planId || null,
    // 0 es un número de clase válido (convención para "Evaluación" en
    // planes_clases) — con "||" se habría perdido y guardado null.
    numero_clase: c.numeroClase ?? null,
  };
}
function dbToCita(row) {
  return {
    clienteId: row.cliente_id,
    clienteNombre: row.cliente_nombre,
    perro: row.perro,
    email: row.email,
    telefono: row.telefono,
    direccion: row.direccion,
    tipo: row.tipo,
    adiestrador: row.adiestrador,
    fechaISO: row.fecha_hora,
    estado: row.estado,
    notas: row.notas,
    origen: row.origen || "staff",
    duracionMin: row.duracion_min || 60,
    confirmadaEn: row.confirmada_en,
    emailEnviado: row.email_enviado || false,
    planId: row.plan_id,
    numeroClase: row.numero_clase,
  };
}

function bloqueDisponibilidadToDb(b) {
  return {
    adiestrador: b.adiestrador,
    fecha: b.fecha,
    hora_inicio: b.horaInicio,
  };
}
function dbToBloqueDisponibilidad(row) {
  return {
    adiestrador: row.adiestrador,
    fecha: row.fecha,
    // Postgres devuelve "time" como "HH:MM:SS" — se recorta a "HH:MM" para
    // que calce con BLOQUES_DIA y no rompa las comparaciones exactas.
    horaInicio: (row.hora_inicio || "").slice(0, 5),
    _dbId: row.id,
  };
}

function planClaseToDb(p) {
  return {
    cliente_id: p.clienteId,
    nombre: p.nombre || null,
    num_clases: p.numClases,
    incluye_evaluacion: p.incluyeEvaluacion || false,
    boleta_adiestramiento_id: p.boletaAdiestramientoId || null,
    creado_por: p.creadoPor || null,
  };
}
function dbToPlanClase(row) {
  return {
    clienteId: row.cliente_id,
    nombre: row.nombre,
    numClases: row.num_clases,
    incluyeEvaluacion: row.incluye_evaluacion,
    boletaAdiestramientoId: row.boleta_adiestramiento_id,
    creadoPor: row.creado_por,
  };
}

function claseRealizadaToDb(c) {
  return {
    plan_id: c.planId,
    numero_clase: c.numeroClase,
    fecha_realizada: c.fechaRealizada,
    temas: c.temas || [],
    notas: c.notas || null,
    creado_por: c.creadoPor || null,
  };
}
function dbToClaseRealizada(row) {
  return {
    planId: row.plan_id,
    numeroClase: row.numero_clase,
    fechaRealizada: row.fecha_realizada,
    temas: row.temas || [],
    notas: row.notas,
    creadoPor: row.creado_por,
    _dbId: row.id,
  };
}

function tarifaToDb(t) {
  return {
    adiestrador: t.adiestrador,
    precio_evaluacion: t.precioEvaluacion,
    precio_clase: t.precioClase,
  };
}
function dbToTarifa(row) {
  return {
    adiestrador: row.adiestrador,
    precioEvaluacion: row.precio_evaluacion,
    precioClase: row.precio_clase,
  };
}

function prospectoToDb(p) {
  return {
    nombre: p.nombre,
    email: p.email || null,
    telefono: p.telefono || null,
    perro: p.perro || null,
    direccion: p.direccion || null,
    origen: p.origen,
    tipo_servicio: p.tipoServicio || [],
    estado: p.estado,
    proximo_seguimiento: p.proximoSeguimiento || null,
    asignado_a: p.asignadoA || null,
    bitacora: p.bitacora || [],
  };
}
function dbToProspecto(row) {
  return {
    nombre: row.nombre,
    email: row.email,
    telefono: row.telefono,
    perro: row.perro,
    direccion: row.direccion,
    origen: row.origen,
    tipoServicio: row.tipo_servicio || [],
    estado: row.estado,
    proximoSeguimiento: row.proximo_seguimiento,
    asignadoA: row.asignado_a,
    bitacora: row.bitacora || [],
  };
}

// cambio hecho con el setter (igual que useState) de vuelta a la base
// de datos — inserta, actualiza o elimina según corresponda.
function useSyncedTable(tableName, mapToDb, mapFromDb, orderBy, sessionVersion = 0, selectFrom = tableName, realtime = false) {
  const [items, setItemsState] = useState([]);
  const [cargando, setCargando] = useState(true);
  const insertando = useRef(new Set());

  useEffect(() => {
    let activo = true;
    setCargando(true);
    (async () => {
      let query = supabase.from(selectFrom).select("*");
      if (orderBy) query = query.order(orderBy);
      const { data, error } = await query;
      if (!activo) return;
      if (error) {
        showToast(`No se pudo cargar ${tableName}: ${error.message}`);
      } else if (data) {
        setItemsState(data.map((row, idx) => ({ ...mapFromDb(row), id: idx + 1, _dbId: row.id })));
      }
      setCargando(false);
    })();
    return () => { activo = false; };
  }, [sessionVersion]);

  // Suscripción opcional a cambios en tiempo real (Supabase Realtime) —
  // solo para tablas que varias personas usan a la vez el mismo día
  // (ver useSyncedTable("citas_agenda", ..., realtime: true)). Escribe
  // directo en setItemsState (no en setItems) para no volver a mandar a
  // Supabase lo que Supabase mismo acaba de avisar. Respeta las políticas
  // RLS que ya existan — un cliente solo recibe eventos de filas que ya
  // podía leer.
  useEffect(() => {
    if (!realtime) return;
    const canal = supabase
      .channel(`${tableName}-realtime`)
      .on("postgres_changes", { event: "*", schema: "public", table: tableName }, (payload) => {
        setItemsState((prev) => {
          if (payload.eventType === "DELETE") {
            return prev.filter((x) => x._dbId !== payload.old.id);
          }
          const idx = prev.findIndex((x) => x._dbId === payload.new.id);
          if (idx === -1) {
            return [...prev, { ...mapFromDb(payload.new), id: Date.now() + Math.random(), _dbId: payload.new.id }];
          }
          const copia = [...prev];
          copia[idx] = { ...mapFromDb(payload.new), id: copia[idx].id, _dbId: payload.new.id };
          return copia;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [realtime, sessionVersion]);

  function sincronizar(prev, next) {
    const prevByDbId = new Map(prev.filter((x) => x._dbId).map((x) => [x._dbId, x]));
    const nextByDbId = new Map(next.filter((x) => x._dbId).map((x) => [x._dbId, x]));

    for (const [dbId] of prevByDbId) {
      if (!nextByDbId.has(dbId)) {
        supabase.from(tableName).delete().eq("id", dbId).then(({ error }) => {
          if (error) showToast(`No se pudo eliminar: ${error.message}`);
        });
      }
    }

    next.filter((x) => !x._dbId && !insertando.current.has(x.id)).forEach((item) => {
      insertando.current.add(item.id);
      supabase.from(tableName).insert(mapToDb(item)).select().single().then(({ data, error }) => {
        insertando.current.delete(item.id);
        if (error) {
          showToast(`No se pudo guardar: ${error.message}`);
          setItemsState((cur) => cur.filter((x) => x.id !== item.id));
        } else if (data) {
          setItemsState((cur) => {
            const actualizado = cur.map((x) => (x.id === item.id ? { ...x, _dbId: data.id, numero: data.numero ?? x.numero } : x));
            const actual = actualizado.find((x) => x.id === item.id);
            // Si el ítem se editó mientras el insert estaba en vuelo (no
            // tenía _dbId todavía, así que ese cambio no viajó con nada),
            // se manda ahora como update para no perderlo en silencio.
            if (actual && JSON.stringify(mapToDb(actual)) !== JSON.stringify(mapToDb(item))) {
              supabase.from(tableName).update(mapToDb(actual)).eq("id", data.id).then(({ error: errorTardio }) => {
                if (errorTardio) showToast(`No se pudo guardar: ${errorTardio.message}`);
              });
            }
            return actualizado;
          });
        }
      });
    });

    for (const [dbId, item] of nextByDbId) {
      const anterior = prevByDbId.get(dbId);
      if (anterior && JSON.stringify(mapToDb(anterior)) !== JSON.stringify(mapToDb(item))) {
        supabase.from(tableName).update(mapToDb(item)).eq("id", dbId).then(({ error }) => {
          if (error) showToast(`No se pudo guardar: ${error.message}`);
        });
      }
    }
  }

  function setItems(updater) {
    setItemsState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      sincronizar(prev, next);
      return next;
    });
  }

  return [items, setItems, cargando];
}

// Hook para el registro de paseos (mapa clienteIdLocal_fecha -> {realizado, cancelado, nota}).
// El resto de la app usa el "id" local (numérico) del cliente para armar la clave;
// aquí se traduce hacia/desde el id real (uuid) que usa Supabase.
function useRegistroPaseosSincronizado(clientes) {
  const [registro, setRegistroState] = useState({});
  const cargadoRef = useRef(false);

  useEffect(() => {
    if (clientes.length === 0 || cargadoRef.current) return;
    cargadoRef.current = true;
    (async () => {
      const { data, error } = await supabase.from("registro_paseos").select("*");
      if (!error && data) {
        const mapa = {};
        data.forEach((r) => {
          const cliente = clientes.find((c) => c._dbId === r.cliente_id);
          if (cliente) {
            mapa[`${cliente.id}_${r.fecha}`] = {
              realizado: r.estado === "realizado",
              cancelado: r.estado === "cancelado",
              nota: r.nota || "",
              paseadorNombre: r.paseador_nombre || null,
            };
          }
        });
        setRegistroState(mapa);
      }
    })();
  }, [clientes]);

  // Tiempo real: si un paseador marca un paseo desde su celular mientras
  // un coordinador está mirando la pantalla, que se actualice sola en vez
  // de esperar a que alguien recargue.
  useEffect(() => {
    if (clientes.length === 0) return;
    const canal = supabase
      .channel("registro_paseos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "registro_paseos" }, (payload) => {
        const fila = payload.eventType === "DELETE" ? payload.old : payload.new;
        const cliente = clientes.find((c) => c._dbId === fila.cliente_id);
        if (!cliente) return;
        const clave = `${cliente.id}_${fila.fecha}`;
        setRegistroState((prev) => {
          if (payload.eventType === "DELETE") {
            const copia = { ...prev };
            delete copia[clave];
            return copia;
          }
          return {
            ...prev,
            [clave]: {
              realizado: fila.estado === "realizado",
              cancelado: fila.estado === "cancelado",
              nota: fila.nota || "",
              paseadorNombre: fila.paseador_nombre || null,
            },
          };
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [clientes]);

  function setRegistro(updater) {
    setRegistroState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      Object.keys(next).forEach((key) => {
        if (JSON.stringify(next[key]) !== JSON.stringify(prev[key])) {
          const idx = key.indexOf("_");
          const clienteIdLocal = Number(key.slice(0, idx));
          const fecha = key.slice(idx + 1);
          const cliente = clientes.find((c) => c.id === clienteIdLocal);
          if (!cliente || !cliente._dbId) return;
          const r = next[key];
          const estado = r.cancelado ? "cancelado" : r.realizado ? "realizado" : (r.nota ? "pendiente" : null);
          const anterior = prev[key];
          if (estado) {
            // El builder de supabase-js es "thenable perezoso": si no se
            // encadena/espera, nunca dispara el fetch. Sin este .then() el
            // upsert no se mandaba nunca — el estado local quedaba "hecho"
            // hasta el próximo reload, que lo revertía sin avisar.
            supabase.from("registro_paseos").upsert(
              { cliente_id: cliente._dbId, fecha, estado, nota: r.nota || null, paseador_nombre: cliente.paseadorNombre || null },
              { onConflict: "cliente_id,fecha" }
            ).then(({ error }) => {
              if (error) {
                showToast(`No se pudo guardar el paseo: ${error.message}`);
                setRegistroState((cur) => {
                  const copia = { ...cur };
                  if (anterior === undefined) delete copia[key];
                  else copia[key] = anterior;
                  return copia;
                });
              }
            });
          } else {
            // Se deshizo un "realizado"/"cancelado" o se borró la única nota
            // — no queda ningún estado que guardar, así que hay que borrar
            // la fila (si existía) en vez de no hacer nada: de lo contrario
            // la fila vieja seguía en la base y el paseo "deshecho" volvía a
            // aparecer como confirmado en el próximo reload.
            supabase.from("registro_paseos").delete()
              .eq("cliente_id", cliente._dbId).eq("fecha", fecha)
              .then(({ error }) => {
                if (error) {
                  showToast(`No se pudo deshacer: ${error.message}`);
                  setRegistroState((cur) => {
                    const copia = { ...cur };
                    if (anterior === undefined) delete copia[key];
                    else copia[key] = anterior;
                    return copia;
                  });
                }
              });
          }
        }
      });
      return next;
    });
  }

  return [registro, setRegistro];
}

// Avisa a los tutores de hoy que la ronda empezó — sin rastreo de
// ubicación de ningún tipo (ver api/avisar-inicio-ronda.js para el
// porqué). Best-effort: si falla, no debe interrumpir al paseador ni
// revertir el cambio de fase, que ya quedó guardado.
async function avisarInicioRonda(paseadorNombre) {
  try {
    const { data: { session } } = await supabase.auth.refreshSession();
    await fetch("/api/avisar-inicio-ronda", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ paseadorNombre }),
    });
  } catch {
    // silencioso a propósito
  }
}

// Fase única por paseador/día (no por perro) para la consola de estados
// en vivo — capa nueva y aditiva sobre registro_paseos, no lo reemplaza.
// A diferencia de useRegistroPaseosSincronizado, la clave es solo el
// nombre del paseador (no hace falta traducir id local↔uuid: el nombre
// ya es la clave natural que usa el resto del sistema) y solo importa
// "hoy" — nunca se navega a otro día, así que ni la carga ni el realtime
// necesitan acumular fechas pasadas.
function useFaseDiaPaseador(sessionVersion) {
  const [fases, setFasesState] = useState({});
  // Mapa paralelo a `fases`, no reemplaza su forma (sigue siendo
  // {paseadorNombre: faseString}) para no tener que tocar los call sites
  // que ya la leen así (badge de Coordinación, gate del botón de WhatsApp).
  const [ausencias, setAusenciasState] = useState({});
  // No es estado de React a propósito: solo lo lee/escribe actualizarFaseDia
  // (siempre del propio paseador, ver la ruta guiada en MisPaseos) para
  // decidir si ya avisó hoy, así que no necesita re-renderizar nada.
  const avisosEnviadosRef = useRef({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("fase_dia_paseador").select("*").eq("fecha", fechaKey(new Date()));
      if (!error && data) {
        const mapa = {}, mapaAusencias = {};
        data.forEach((r) => {
          mapa[r.paseador_nombre] = r.fase;
          mapaAusencias[r.paseador_nombre] = r.ausente_motivo || null;
          avisosEnviadosRef.current[r.paseador_nombre] = r.aviso_enviado;
        });
        setFasesState(mapa);
        setAusenciasState(mapaAusencias);
      }
    })();
  }, [sessionVersion]);

  useEffect(() => {
    const canal = supabase
      .channel("fase_dia_paseador-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "fase_dia_paseador" }, (payload) => {
        const fila = payload.eventType === "DELETE" ? payload.old : payload.new;
        if (fila.fecha !== fechaKey(new Date())) return;
        if (payload.eventType === "DELETE") {
          setFasesState((prev) => { const copia = { ...prev }; delete copia[fila.paseador_nombre]; return copia; });
          setAusenciasState((prev) => { const copia = { ...prev }; delete copia[fila.paseador_nombre]; return copia; });
          return;
        }
        setFasesState((prev) => ({ ...prev, [fila.paseador_nombre]: fila.fase }));
        setAusenciasState((prev) => ({ ...prev, [fila.paseador_nombre]: fila.ausente_motivo || null }));
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [sessionVersion]);

  function actualizarFaseDia(paseadorNombre, fase) {
    const anterior = fases[paseadorNombre];
    setFasesState((prev) => ({ ...prev, [paseadorNombre]: fase }));
    // Avisa una sola vez por paseador/día — si el paseador corrige un toque
    // (vuelve a Pendiente y avanza de nuevo a En Recolección), no se le
    // vuelve a mandar el mismo push a sus clientes.
    const debeAvisar = fase === "en_recoleccion" && anterior !== "en_recoleccion" && !avisosEnviadosRef.current[paseadorNombre];
    const cambios = { paseador_nombre: paseadorNombre, fecha: fechaKey(new Date()), fase, actualizado_en: new Date().toISOString() };
    if (debeAvisar) cambios.aviso_enviado = true;
    supabase.from("fase_dia_paseador").upsert(cambios, { onConflict: "paseador_nombre,fecha" }).then(({ error }) => {
      if (error) {
        showToast(`No se pudo guardar la fase: ${error.message}`);
        setFasesState((prev) => ({ ...prev, [paseadorNombre]: anterior }));
      }
    });
    if (debeAvisar) {
      avisosEnviadosRef.current[paseadorNombre] = true;
      avisarInicioRonda(paseadorNombre);
    }
  }

  // Upsert parcial — no manda `fase`, así que un conflicto no le pisa la
  // fase que ya tuviera esa fila (mismo criterio que aviso_enviado más
  // arriba). No se reutiliza "cancelado" de registro_paseos: ese campo es
  // específicamente "el cliente canceló" y no cuenta contra el pago del
  // paseador — una ausencia del paseador es un caso distinto.
  function justificarAusencia(paseadorNombre, motivo) {
    const anterior = ausencias[paseadorNombre] || null;
    setAusenciasState((prev) => ({ ...prev, [paseadorNombre]: motivo }));
    supabase.from("fase_dia_paseador").upsert(
      { paseador_nombre: paseadorNombre, fecha: fechaKey(new Date()), ausente_motivo: motivo, actualizado_en: new Date().toISOString() },
      { onConflict: "paseador_nombre,fecha" }
    ).then(({ error }) => {
      if (error) {
        showToast(`No se pudo guardar la ausencia: ${error.message}`);
        setAusenciasState((prev) => ({ ...prev, [paseadorNombre]: anterior }));
      }
    });
  }

  function deshacerAusencia(paseadorNombre) {
    justificarAusencia(paseadorNombre, null);
  }

  return [fases, actualizarFaseDia, ausencias, justificarAusencia, deshacerAusencia];
}

export const LOGO_B64 = "data:image/jpeg;base64,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";
export const HUELLA_B64 = "data:image/png;base64,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";


// ---------- Paleta Howria ----------
export const NAVY = "#122A40";
export const CREAM = "#F3ECDC";
export const CREAM_SOFT = "#EAE0C6";
export const GOLD = "#C9A24B";
export const INK = "#332E22";
export const RUST = "#A85C3B";
export const NAVY_LOGO = "#102A41"; // mismo color de fondo que el logo, usado en el encabezado de las boletas (canvas)
export const PANEL_BG = "#F1EFE9"; // fondo del panel del staff — más claro y neutro que CREAM, para que las tarjetas blancas resalten más y se sienta más liviano

const CLIENTES_INICIAL = [
  { id: 1, nombre: "María José Reyes", perro: "Toby", telefono: "+56 9 1234 5678", valorPaseoRef: 8000, raza: "Golden Retriever", pesoKg: 28, fotoUrl: null, diasHabituales: [0,1,2,3,4], planHabitual: "LV", objetivos: "Bajar nivel de energía y mejorar caminata con correa.", paseadorNombre: "Pedro Vidal", tarifaPaseador: 5000, direccion: "Av. Providencia 1650, Providencia", lat: -33.4260, lng: -70.6100, tipoServicio: ["paseos"], estadoCliente: "activo", fechaInicio: "2026-03-01" },
  { id: 2, nombre: "Javier Ocares", perro: "Luna", telefono: "+56 9 8765 4321", valorPaseoRef: 9000, raza: "Staffordshire", pesoKg: 22, fotoUrl: null, diasHabituales: [0,2,4], planHabitual: "LMV", objetivos: "Socialización con otros perros durante el paseo.", paseadorNombre: "Pedro Vidal", tarifaPaseador: 5500, direccion: "Av. Apoquindo 4900, Las Condes", lat: -33.4085, lng: -70.5730, tipoServicio: ["paseos", "clases"], estadoCliente: "activo", fechaInicio: "2026-05-15" },
  { id: 3, nombre: "Daniela Aliaga", perro: "Rocco", telefono: "+56 9 2222 3333", valorPaseoRef: 8500, raza: "Mestizo", pesoKg: 15, fotoUrl: null, diasHabituales: [1,3], planHabitual: "MJ", objetivos: "Reducir ansiedad por separación.", paseadorNombre: "Ignacio Muñoz", tarifaPaseador: 5000, direccion: "Irarrázaval 3200, Ñuñoa", lat: -33.4560, lng: -70.5980, tipoServicio: ["paseos", "evaluacion"], estadoCliente: "activo", fechaInicio: "2026-06-10" },
];

export const ESTADOS_CLIENTE = [
  { id: "activo", nombre: "Activo", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "pausado", nombre: "Pausado", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "baja", nombre: "Dado de baja", color: "#A85C3B", bg: "#F1DCD2" },
];

// Los id deben coincidir exactamente con el "check" de
// database/049_fase_dia_paseador.sql.
export const FASES_PASEADOR = [
  { id: "pendiente", nombre: "Pendiente", color: "#8A7E5C", bg: "#EDE4CE" },
  { id: "en_recoleccion", nombre: "En Recolección", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "en_parque", nombre: "En Parque", color: "#1E5A7A", bg: "#D6E6EE" },
  { id: "en_retorno", nombre: "En Retorno", color: NAVY, bg: "#DCE3EA" },
  { id: "completado", nombre: "Completado", color: "#2F6A46", bg: "#D8ECDE" },
];

export const TIPOS_SERVICIO = [
  { id: "paseos", nombre: "Paseos" },
  { id: "clases", nombre: "Clases de adiestramiento" },
  { id: "evaluacion", nombre: "Evaluación" },
];

export const NIVELES_ENERGIA = [
  { id: "baja", nombre: "Baja" },
  { id: "media", nombre: "Media" },
  { id: "alta", nombre: "Alta" },
];

export const TAGS_TEMPERAMENTO = [
  { id: "sociable", nombre: "Sociable" },
  { id: "reactivo_perros", nombre: "Reactivo con perros" },
  { id: "reactivo_personas", nombre: "Reactivo con personas" },
  { id: "ansioso", nombre: "Ansioso" },
  { id: "guarda_recursos", nombre: "Guarda recursos" },
];

export const PASOS_CAPACITACION = [
  { id: "induccion", texto: "Inducción inicial y valores de Howria" },
  { id: "manejo_seguro", texto: "Manejo seguro de los perros" },
  { id: "uso_app", texto: "Uso de la app (marcar paseos, notas)" },
  { id: "emergencias", texto: "Protocolo ante emergencias" },
  { id: "paseo_supervisado", texto: "Paseo supervisado de prueba" },
];

// Temario de adiestramiento, agrupado — sirve para dos cosas distintas:
// los "objetivos" que se eligen en la ficha de ingreso de un alumno
// (clientes.temasObjetivo) y los temas que se anotan clase a clase, una
// vez que la clase ya pasó (clases_realizadas.temas). Contenido
// confirmado con Javier.
export const TEMARIO_ADIESTRAMIENTO = [
  {
    grupo: "Formación de cachorros",
    temas: [{ id: "cachorros", nombre: "Formación de cachorros" }],
  },
  {
    grupo: "Obediencia",
    temas: [
      { id: "obediencia_basica", nombre: "Obediencia básica" },
      { id: "obediencia_media", nombre: "Obediencia media" },
      { id: "obediencia_avanzada", nombre: "Obediencia avanzada" },
    ],
  },
  {
    grupo: "Modificación de conducta",
    temas: [
      { id: "reactividad", nombre: "Reactividad" },
      { id: "ansiedad_separacion", nombre: "Ansiedad por separación" },
      { id: "tirones_correa", nombre: "Tirones de correa" },
      { id: "fobias_miedos", nombre: "Fobias / miedos" },
      { id: "evacuaciones_inadecuadas", nombre: "Evacuaciones inadecuadas" },
    ],
  },
];

export const ESTADOS_PROSPECTO = [
  { id: "nuevo", nombre: "Nuevo contacto", color: "#8A7E5C", bg: "#EDE4CE" },
  { id: "conversando", nombre: "En conversación", color: "#1F5C8A", bg: "#D6E6F0" },
  { id: "propuesta", nombre: "Propuesta enviada", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "negociacion", nombre: "Negociación", color: "#8A4E1E", bg: "#F1DCC0" },
  { id: "ganado", nombre: "Ganado", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "perdido", nombre: "Perdido", color: "#A85C3B", bg: "#F1DCD2" },
];

export const ORIGENES_PROSPECTO = ["Instagram", "Facebook", "WhatsApp", "Referido", "Página web", "Agenda pública", "Otro"];

export const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
export const DIAS_SEMANA = ["L","M","X","J","V","S","D"]; // lun..dom
export const DIAS_SEMANA_LARGO = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

export const TODOS_LOS_TABS = [
  { id: "inicio", label: "Inicio", grupo: "" },
  { id: "mis-paseos", label: "Mis paseos", grupo: "Trabajo diario" },
  { id: "coordinacion", label: "Coordinación", grupo: "Trabajo diario" },
  { id: "mapa", label: "Mapa", grupo: "Trabajo diario" },
  { id: "agenda", label: "Agenda", grupo: "Trabajo diario" },
  { id: "calendario", label: "Calendario", grupo: "Trabajo diario" },
  { id: "itinerario", label: "Itinerario", grupo: "Trabajo diario" },
  { id: "alumnos", label: "Alumnos", grupo: "Trabajo diario" },
  { id: "mail", label: "Mail", grupo: "Trabajo diario" },
  { id: "clientes", label: "Clientes", grupo: "Clientes y boletas" },
  { id: "boletas", label: "Boletas", grupo: "Clientes y boletas" },
  { id: "facturas", label: "Facturas", grupo: "Clientes y boletas" },
  { id: "finanzas", label: "Finanzas", grupo: "Clientes y boletas" },
  { id: "pagos", label: "Pago trabajadores", grupo: "Equipo" },
  { id: "equipo", label: "Equipo", grupo: "Equipo" },
  { id: "usuarios", label: "Usuarios", grupo: "Equipo" },
  { id: "seguimiento", label: "Seguimiento", grupo: "Prospección" },
];
const ORDEN_GRUPOS = ["Trabajo diario", "Clientes y boletas", "Equipo", "Prospección"];
export const ROLES_APP = ["paseador", "entrenador", "coordinador", "administrador"];

// Un ícono por pestaña, para el launcher tipo "app" de la pantalla de
// Inicio en mobile (ver Inicio() más abajo). "inicio" no necesita uno —
// ya estás ahí.
const ICONOS_TAB = {
  "mis-paseos": Footprints,
  coordinacion: MapPinned,
  mapa: MapIcon,
  agenda: Calendar,
  calendario: CalendarDays,
  itinerario: Route,
  alumnos: GraduationCap,
  mail: MailIcon,
  clientes: Dog,
  boletas: Receipt,
  facturas: FileText,
  finanzas: TrendingUp,
  pagos: Banknote,
  equipo: Users,
  usuarios: ShieldCheck,
  seguimiento: Target,
};

// Paleta para los íconos del launcher — mismos pares fondo/color que ya
// usan FASES_PASEADOR/ESTADOS_CLIENTE en el resto del panel, reciclados
// acá para que el grid de accesos se sienta variado por color (como un
// tablero de apps) sin salirse de la paleta de marca.
const PALETA_LAUNCHER = [
  { bg: "#F3E3B4", color: "#8A6A1E" }, // dorado
  { bg: "#D6E6EE", color: "#1E5A7A" }, // celeste
  { bg: "#D8ECDE", color: "#2F6A46" }, // verde salvia
  { bg: "#F1DCD2", color: RUST },      // terracota
  { bg: "#DCE3EA", color: NAVY },      // acero
  { bg: "#E5DCEE", color: "#6B4E85" }, // ciruela
];

// Carga y sincroniza los permisos por rol (qué pestañas ve cada uno)
// guardados en la tabla permisos_roles.
function usePermisosRoles(sessionVersion) {
  const [permisos, setPermisosState] = useState(null); // null mientras carga
  // Encadena los guardados por rol: si se marcan varias pestañas seguidas
  // del mismo rol, cada update() espera a que termine el anterior en vez de
  // viajar en paralelo — si no, pueden llegar a la base en otro orden y el
  // último en aterrizar pisa en silencio un cambio posterior.
  const colaPorRol = useRef({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("permisos_roles").select("*");
      if (!error && data) {
        const mapa = {};
        data.forEach((r) => { mapa[r.rol] = r.tabs || []; });
        setPermisosState(mapa);
      }
    })();
  }, [sessionVersion]);

  function actualizarPermiso(rol, tabId, activo) {
    let nuevos;
    setPermisosState((prev) => {
      const actuales = new Set(prev?.[rol] || []);
      if (activo) actuales.add(tabId); else actuales.delete(tabId);
      nuevos = [...actuales];
      return { ...prev, [rol]: nuevos };
    });

    const previa = colaPorRol.current[rol] || Promise.resolve();
    const siguiente = previa.then(async () => {
      const { data, error } = await supabase.from("permisos_roles").update({ tabs: nuevos }).eq("rol", rol).select();
      // Un update sin error pero sin filas devueltas significa que no existe
      // fila para ese rol en permisos_roles (o RLS la dejó fuera) — en
      // cualquiera de los dos casos el cambio no quedó guardado de verdad,
      // aunque no haya un "error" explícito.
      if (error || !data?.length) {
        setPermisosState((prev) => {
          const actuales = new Set(prev?.[rol] || []);
          if (activo) actuales.delete(tabId); else actuales.add(tabId);
          return { ...prev, [rol]: [...actuales] };
        });
        showToast(`No se pudo guardar el permiso de "${rol}": ${error?.message || "no existe una fila para ese rol en permisos_roles"}`);
      }
    });
    colaPorRol.current[rol] = siguiente;
  }

  return [permisos, actualizarPermiso];
}

// Igual que usePermisosRoles pero para notificaciones_roles (qué rol recibe
// qué aviso push) — misma cola por rol para que marcar varias seguidas no
// se pise entre sí.
function useNotificacionesRoles(sessionVersion) {
  const [notificaciones, setNotificacionesState] = useState(null); // null mientras carga
  const colaPorRol = useRef({});

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("notificaciones_roles").select("*");
      if (!error && data) {
        const mapa = {};
        data.forEach((r) => { mapa[r.rol] = r.eventos || []; });
        setNotificacionesState(mapa);
      }
    })();
  }, [sessionVersion]);

  function actualizarNotificacion(rol, eventoId, activo) {
    let nuevos;
    setNotificacionesState((prev) => {
      const actuales = new Set(prev?.[rol] || []);
      if (activo) actuales.add(eventoId); else actuales.delete(eventoId);
      nuevos = [...actuales];
      return { ...prev, [rol]: nuevos };
    });

    const previa = colaPorRol.current[rol] || Promise.resolve();
    const siguiente = previa.then(async () => {
      const { data, error } = await supabase.from("notificaciones_roles").update({ eventos: nuevos }).eq("rol", rol).select();
      if (error || !data?.length) {
        setNotificacionesState((prev) => {
          const actuales = new Set(prev?.[rol] || []);
          if (activo) actuales.delete(eventoId); else actuales.add(eventoId);
          return { ...prev, [rol]: [...actuales] };
        });
        showToast(`No se pudo guardar la notificación de "${rol}": ${error?.message || "no existe una fila para ese rol en notificaciones_roles"}`);
      }
    });
    colaPorRol.current[rol] = siguiente;
  }

  return [notificaciones, actualizarNotificacion];
}

// Carga y sincroniza ajustes generales del negocio (ej. el % de recargo
// de fin de semana/feriado), guardados en la tabla configuracion.
function useConfiguracion(sessionVersion) {
  const [config, setConfigState] = useState(null); // null mientras carga

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("configuracion").select("*");
      if (!error && data) {
        const mapa = {};
        data.forEach((r) => { mapa[r.clave] = r.valor; });
        setConfigState(mapa);
      }
    })();
  }, [sessionVersion]);

  function actualizarConfig(clave, valor) {
    const anterior = config?.[clave];
    setConfigState((prev) => ({ ...prev, [clave]: valor }));
    supabase.from("configuracion").upsert({ clave, valor }, { onConflict: "clave" }).then(({ error }) => {
      if (error) {
        showToast(`No se pudo guardar "${clave}": ${error.message}`);
        setConfigState((prev) => ({ ...prev, [clave]: anterior }));
      }
    });
  }

  return [config, actualizarConfig];
}

// Disponibilidad del adiestrador por bloques horarios (disponibilidad_fecha):
// una fila = un bloque de 1 hora habilitado, identificado por (adiestrador,
// fecha, horaInicio) — que la fila exista ya significa que ese bloque está
// abierto, no hace falta ningún campo "activo" ni un rango hora_fin.
// Reemplaza el modelo anterior de un solo rango por día (059).
function useDisponibilidadFecha(sessionVersion) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("disponibilidad_fecha").select("*").then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudo cargar la disponibilidad: ${error.message}`);
      else if (data) setFilas(data.map(dbToBloqueDisponibilidad));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  // Prende o apaga un bloque puntual: si ya existe la fila se borra
  // (bloque cerrado), si no existe se crea (bloque abierto).
  async function toggleBloque(adiestrador, fecha, horaInicio) {
    const existente = filas.find((f) => f.adiestrador === adiestrador && f.fecha === fecha && f.horaInicio === horaInicio);
    if (existente) {
      setFilas((prev) => prev.filter((f) => f !== existente));
      const { error } = await supabase.from("disponibilidad_fecha").delete().eq("id", existente._dbId);
      if (error) {
        showToast(`No se pudo cerrar el bloque: ${error.message}`);
        setFilas((prev) => [...prev, existente]);
      }
      return;
    }
    const optimista = { adiestrador, fecha, horaInicio, _dbId: null };
    setFilas((prev) => [...prev, optimista]);
    const { data, error } = await supabase.from("disponibilidad_fecha")
      .insert(bloqueDisponibilidadToDb(optimista))
      .select().single();
    if (error) {
      showToast(`No se pudo abrir el bloque: ${error.message}`);
      setFilas((prev) => prev.filter((f) => f !== optimista));
      return;
    }
    if (data) {
      const guardada = dbToBloqueDisponibilidad(data);
      setFilas((prev) => prev.map((f) => (f === optimista ? guardada : f)));
    }
  }

  // Abre de una sola vez los bloques elegidos en las fechas de un rango
  // que caigan en los días de semana elegidos, para no tener que marcar
  // el mes bloque por bloque.
  async function aplicarPatronSemanal(adiestrador, diasSemana, bloques, desde, hasta) {
    const fechas = [];
    const cursor = new Date(desde + "T00:00:00");
    const fin = new Date(hasta + "T00:00:00");
    while (cursor <= fin) {
      const dow = (cursor.getDay() + 6) % 7; // 0=lunes..6=domingo, igual que el resto de la app
      if (diasSemana.includes(dow)) fechas.push(fechaKey(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    if (fechas.length === 0 || bloques.length === 0) return;
    const filasNuevas = fechas.flatMap((fecha) => bloques.map((horaInicio) => ({ adiestrador, fecha, horaInicio })));
    const { error } = await supabase.from("disponibilidad_fecha")
      .upsert(filasNuevas.map(bloqueDisponibilidadToDb), { onConflict: "adiestrador,fecha,hora_inicio", ignoreDuplicates: true });
    if (error) {
      showToast(`No se pudo aplicar el horario: ${error.message}`);
      return;
    }
    // ignoreDuplicates hace que Postgres no devuelva las filas que ya
    // existían (ON CONFLICT DO NOTHING no las trae en el RETURNING) — para
    // no reconstruir el resultado a mano, se recarga directo lo del
    // adiestrador desde la base.
    const { data: actualizadas } = await supabase.from("disponibilidad_fecha").select("*").eq("adiestrador", adiestrador);
    if (actualizadas) {
      setFilas((prev) => [...prev.filter((f) => f.adiestrador !== adiestrador), ...actualizadas.map(dbToBloqueDisponibilidad)]);
    }
  }

  return [filas, toggleBloque, cargando, aplicarPatronSemanal];
}

// Seguimiento de clases realizadas dentro de un plan de clases
// (clases_realizadas, 067) — mismo espíritu que useDisponibilidadFecha:
// se carga una vez y se muta por (planId, numeroClase) puntual, sin
// necesidad de diffear un array completo (useSyncedTable). numeroClase
// 0 = evaluación, 1..N = clases. Marcar una clase es un upsert (permite
// corregir fecha/temas de una clase ya marcada); deshacerla es un delete.
function useClasesRealizadas(sessionVersion) {
  const [clases, setClases] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("clases_realizadas").select("*").then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudo cargar el seguimiento de clases: ${error.message}`);
      else if (data) setClases(data.map(dbToClaseRealizada));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  async function marcarClase(planId, numeroClase, { fechaRealizada, temas, notas, creadoPor }) {
    const item = { planId, numeroClase, fechaRealizada, temas: temas || [], notas: notas || null, creadoPor };
    const { data, error } = await supabase.from("clases_realizadas")
      .upsert(claseRealizadaToDb(item), { onConflict: "plan_id,numero_clase" })
      .select().single();
    if (error) {
      showToast(`No se pudo guardar la clase: ${error.message}`);
      return;
    }
    if (data) {
      const guardada = dbToClaseRealizada(data);
      setClases((prev) => [...prev.filter((c) => !(c.planId === planId && c.numeroClase === numeroClase)), guardada]);
    }
  }

  async function deshacerClase(planId, numeroClase) {
    const existente = clases.find((c) => c.planId === planId && c.numeroClase === numeroClase);
    if (!existente) return;
    setClases((prev) => prev.filter((c) => c !== existente));
    const { error } = await supabase.from("clases_realizadas").delete().eq("id", existente._dbId);
    if (error) {
      showToast(`No se pudo deshacer: ${error.message}`);
      setClases((prev) => [...prev, existente]);
    }
  }

  return [clases, marcarClase, cargando, deshacerClase];
}

// Precio de evaluación/clase por adiestrador (tarifas_adiestrador): una
// fila por adiestrador, upsert igual que useDisponibilidadFecha pero sin la
// dimensión de día de semana.
function useTarifas(sessionVersion) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("tarifas_adiestrador").select("*").then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudo cargar las tarifas: ${error.message}`);
      else if (data) setFilas(data.map(dbToTarifa));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  async function actualizar(adiestrador, cambios) {
    const actual = filas.find((f) => f.adiestrador === adiestrador)
      || { adiestrador, precioEvaluacion: 0, precioClase: 0 };
    const nueva = { ...actual, ...cambios };
    setFilas((prev) => {
      const idx = prev.findIndex((f) => f.adiestrador === adiestrador);
      return idx >= 0 ? prev.map((f, i) => (i === idx ? nueva : f)) : [...prev, nueva];
    });
    const { error } = await supabase.from("tarifas_adiestrador")
      .upsert(tarifaToDb(nueva), { onConflict: "adiestrador" });
    if (error) showToast(`No se pudo guardar la tarifa: ${error.message}`);
  }

  return [filas, actualizar, cargando];
}

export function dbToCorreo(row) {
  return {
    id: row.id,
    direccion: row.direccion,
    remitente: row.remitente,
    destinatario: row.destinatario,
    asunto: row.asunto,
    cuerpoTexto: row.cuerpo_texto,
    cuerpoHtml: row.cuerpo_html,
    clienteId: row.cliente_id,
    prospectoId: row.prospecto_id,
    leido: row.leido,
    creadoEn: row.creado_en,
  };
}

// Los correos entrantes se escriben desde el servidor (Cloudflare Worker ->
// api/correo-entrante.js) y los salientes desde api/confirmar-cita.js /
// api/responder-correo.js — el navegador nunca inserta filas acá, pero sí
// necesita el setter para marcar "leído" y para reflejar al toque una
// respuesta recién enviada, sin esperar el próximo refetch completo.
function useCorreos(sessionVersion) {
  const [correos, setCorreos] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("correos").select("*").order("creado_en", { ascending: false }).then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudo cargar el correo: ${error.message}`);
      else if (data) setCorreos(data.map(dbToCorreo));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  // Tiempo real: un correo nuevo (entrante desde api/correo-entrante.js, o
  // saliente desde otra persona respondiendo al mismo tiempo) aparece solo,
  // sin esperar a recargar la pestaña Mail.
  useEffect(() => {
    const canal = supabase
      .channel("correos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "correos" }, (payload) => {
        setCorreos((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((c) => c.id !== payload.old.id);
          const mapeado = dbToCorreo(payload.new);
          const idx = prev.findIndex((c) => c.id === mapeado.id);
          if (idx === -1) return [mapeado, ...prev];
          const copia = [...prev];
          copia[idx] = mapeado;
          return copia;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [sessionVersion]);

  return [correos, setCorreos, cargando];
}

// Solicitudes de "Registro de cuenta" pendientes de revisión (ver
// api/solicitud-registro.js) — solo trae las que siguen en estado
// "pendiente"; aprobar/rechazar las saca de esta lista.
function useSolicitudesRegistro(sessionVersion) {
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("solicitudes_registro").select("*").eq("estado", "pendiente").order("creado_en").then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudieron cargar las solicitudes de registro: ${error.message}`);
      else if (data) setSolicitudes(data);
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  return [solicitudes, setSolicitudes, cargando];
}

function boletaDemo(diasAtras, numero, cliente, perro, cantidad, valorPaseo, estado = "no_enviada") {
  const f = new Date();
  f.setDate(f.getDate() - diasAtras);
  return {
    numero, cliente, perro, valorPaseo, cantidad, dias: [], mes: MESES[f.getMonth()], anio: f.getFullYear(),
    planNombre: "Lunes a viernes", paseosCancelados: 0, descuento: 0, total: cantidad * valorPaseo,
    fecha: f.toLocaleDateString("es-CL"), fechaISO: f.toISOString(), estado,
  };
}

const BOLETAS_INICIAL = [
  boletaDemo(2, 101, "María José Reyes", "Toby", 5, 8000, "pendiente_pago"),
  boletaDemo(5, 102, "Javier Ocares", "Luna", 3, 9000, "pagada"),
  boletaDemo(9, 103, "Daniela Aliaga", "Rocco", 4, 8500, "no_enviada"),
  boletaDemo(18, 104, "María José Reyes", "Toby", 12, 8000, "pagada"),
  boletaDemo(24, 105, "Javier Ocares", "Luna", 8, 9000, "pagada"),
  boletaDemo(40, 106, "Daniela Aliaga", "Rocco", 10, 8500, "cancelada"),
];

export const PLANES = [
  { id: "LV", nombre: "Lunes a viernes", dias: [0,1,2,3,4] },
  { id: "LMV", nombre: "Lunes, miércoles y viernes", dias: [0,2,4] },
  { id: "MJ", nombre: "Martes y jueves", dias: [1,3] },
  { id: "TODOS", nombre: "Todos los días", dias: [0,1,2,3,4,5,6] },
  { id: "PERSONALIZADO", nombre: "Personalizado", dias: [] },
];

export const ESTADOS_FACTURA = [
  { id: "no_enviada", nombre: "No enviada", color: "#8A7E5C", bg: "#EDE4CE" },
  { id: "pendiente_pago", nombre: "Pendiente de pago", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "pagada", nombre: "Pagada", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "cancelada", nombre: "Cancelada", color: "#A85C3B", bg: "#F1DCD2" },
];

export function fmtCLP(n) {
  return Number(n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

function LogoHowria({ height = 40 }) {
  return <img src={LOGO_B64} alt="Howria" style={{ height, display: "block" }} />;
}

function NotificacionesBell({ avisos, setTab }) {
  const [abierto, setAbierto] = useState(false);

  function irAlAviso(a) {
    if (a.tab && setTab) setTab(a.tab);
    setAbierto(false);
  }

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setAbierto((v) => !v)} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 6 }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        {avisos.length > 0 && (
          <span style={{ position: "absolute", top: 0, right: 0, background: "#D4634A", color: "#FFF", fontSize: 10, fontWeight: 700, borderRadius: "50%", width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {avisos.length}
          </span>
        )}
      </button>
      {abierto && (
        <>
          <div onClick={() => setAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 19 }} />
          <div style={{ position: "absolute", left: 0, top: "110%", width: 280, maxWidth: "calc(100vw - 24px)", background: "#FFFFFF", borderRadius: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.25)", padding: 14, zIndex: 20 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase" }}>Avisos</p>
            {avisos.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "#9A9179" }}>No hay avisos pendientes.</p>
            ) : (
              avisos.map((a, i) => (
                <button key={i} onClick={() => irAlAviso(a)}
                  style={{
                    display: "block", width: "100%", textAlign: "left", margin: "0 0 4px", padding: "6px 8px", borderRadius: 6,
                    border: "none", background: "none", fontSize: 13, color: "#332E22", cursor: a.tab ? "pointer" : "default", font: "inherit",
                  }}
                  onMouseEnter={(e) => { if (a.tab) e.currentTarget.style.background = "#F7F5F0"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "none"; }}>
                  {a.icono} {a.texto}
                </button>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BotonNotificacionesPush({ usuarioEmail, tituloActivar = "Activar notificaciones push (citas nuevas, correos)" }) {
  const [soportado, setSoportado] = useState(true);
  const [activo, setActivo] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!soportaPush()) {
      setSoportado(false);
      return;
    }
    suscripcionActiva().then(setActivo);
  }, []);

  if (!soportado) return null;

  async function alternar() {
    if (cargando) return;
    if (!activo && esIOSFueraDeApp()) {
      showToast('En iPhone/iPad hay que agregar Howria a la pantalla de inicio primero: toca Compartir → "Agregar a pantalla de inicio", abre Howria desde ese ícono y activa las notificaciones desde ahí.');
      return;
    }
    setCargando(true);
    try {
      if (activo) {
        await desuscribirNotificaciones();
        setActivo(false);
      } else {
        await suscribirNotificaciones(usuarioEmail);
        setActivo(true);
      }
    } catch (err) {
      showToast(err.message || "No se pudo cambiar el estado de las notificaciones");
    } finally {
      setCargando(false);
    }
  }

  return (
    <button
      onClick={alternar}
      disabled={cargando}
      title={activo ? "Desactivar notificaciones push" : tituloActivar}
      style={{ background: "none", border: "none", cursor: cargando ? "default" : "pointer", padding: 6, display: "flex", alignItems: "center", color: activo ? "#D4A94A" : "#7C8AA0" }}
    >
      {activo ? <Bell size={19} /> : <BellOff size={19} />}
    </button>
  );
}

// ---------- Login ----------
const SLIDES_INTRO = [
  { foto: "/images-home/intro-paseo-calle.jpg", titulo: "Comienza a pasear perritos", texto: "Registra cada paseo del día y llévales el seguimiento a tus clientes." },
  { foto: "/images-home/intro-pastor-aleman.jpg", titulo: "Únete al equipo", texto: "Coordina turnos, boletas y tareas junto al resto del equipo Howria." },
  { foto: "/images-home/intro-border-collie.jpg", titulo: "Conecta con tus clientes", texto: "Agenda, boletas y mensajes con cada tutor, todo en un solo lugar." },
];

function Login({ onLogin, usuarios }) {
  const [paso, setPaso] = useState("intro"); // "intro" | "form" | "registro"
  const [slideIntro, setSlideIntro] = useState(0);
  const [nombre, setNombre] = useState("");
  const [passwordEquipo, setPasswordEquipo] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [modo, setModo] = useState("equipo");
  const [emailCliente, setEmailCliente] = useState("");
  const [enviandoLink, setEnviandoLink] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

  const [formRegistro, setFormRegistro] = useState({ nombre: "", email: "", telefono: "", mensaje: "", password: "", passwordConfirm: "" });
  const [enviandoRegistro, setEnviandoRegistro] = useState(false);
  const [errorRegistro, setErrorRegistro] = useState("");
  const [registroEnviado, setRegistroEnviado] = useState(false);

  const formRegistroValido = formRegistro.nombre.trim() && formRegistro.email.trim() && formRegistro.password.length >= 6 && formRegistro.password === formRegistro.passwordConfirm;

  async function enviarSolicitudRegistro() {
    if (!formRegistroValido || enviandoRegistro) return;
    setEnviandoRegistro(true);
    setErrorRegistro("");
    try {
      const { passwordConfirm, ...datosRegistro } = formRegistro;
      const resp = await fetch("/api/solicitud-registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datosRegistro),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorRegistro(resultado.error || "No se pudo enviar la solicitud.");
        return;
      }
      setRegistroEnviado(true);
    } catch {
      setErrorRegistro("No se pudo conectar — revisa tu conexión.");
    } finally {
      setEnviandoRegistro(false);
    }
  }

  // Deslizar entre las 3 fotos de bienvenida (izquierda/derecha) — funciona
  // con dedo (touch) y con mouse (arrastrar), sin depender de una librería.
  const inicioDeslizeX = useRef(null);
  function empezarDeslize(e) {
    inicioDeslizeX.current = (e.touches ? e.touches[0] : e).clientX;
  }
  function terminarDeslize(e) {
    if (inicioDeslizeX.current === null) return;
    const finX = (e.changedTouches ? e.changedTouches[0] : e).clientX;
    const deltaX = finX - inicioDeslizeX.current;
    inicioDeslizeX.current = null;
    if (Math.abs(deltaX) < 40) return; // toque corto, no cuenta como deslize
    if (deltaX < 0) setSlideIntro((s) => Math.min(s + 1, SLIDES_INTRO.length - 1));
    else setSlideIntro((s) => Math.max(s - 1, 0));
  }

  // fontSize 16 por el mismo motivo que el input compartido más abajo en
  // este archivo — evita el zoom automático de Safari en iPhone al tocar
  // el campo, más importante todavía acá porque es lo primero que toca
  // cualquiera que recién entra a la app.
  const inputPill = { width: "100%", boxSizing: "border-box", padding: "13px 18px", marginBottom: 16, border: "1px solid #E1D7B8", borderRadius: 999, fontSize: 16, background: "#F7F5F0", fontFamily: "inherit", color: INK };
  const labelPill = { display: "block", fontSize: 12, color: "#8A7E5C", fontWeight: 600, marginBottom: 6, marginLeft: 6 };
  const botonPill = { width: "100%", padding: "14px", background: NAVY, color: CREAM, border: "none", borderRadius: 999, fontSize: 14.5, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" };

  async function enviarLinkCliente() {
    const email = emailCliente.trim();
    if (!email || enviandoLink) return;
    setEnviandoLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setEnviandoLink(false);
    if (error) {
      showToast(`No se pudo enviar el link: ${error.message}`);
      return;
    }
    setLinkEnviado(true);
  }

  async function intentarLogin() {
    if (!nombre.trim() || !passwordEquipo.trim()) return;
    setEntrando(true);
    setErrorLogin("");
    const email = slugEmailUsuario(nombre);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: passwordEquipo });
    if (error || !data.session) {
      setEntrando(false);
      setErrorLogin("Nombre o contraseña incorrectos.");
      return;
    }
    let perfil = usuarios.find((u) => u.email === email);
    if (!perfil) {
      // La lista de usuarios puede no haber terminado de cargar todavía
      // (llegar acá justo al abrir la página, antes de que el fetch de
      // arriba responda) — se confirma directo contra la base antes de
      // rechazar el login, para no mostrar un error falso.
      const { data: fila } = await supabase.from("usuarios_seguro").select("*").eq("email", email).maybeSingle();
      if (fila) perfil = dbToUsuario(fila);
    }
    setEntrando(false);
    if (!perfil) {
      setErrorLogin("Tu cuenta no tiene un perfil asociado. Avisa al administrador.");
      await supabase.auth.signOut();
      return;
    }
    onLogin(perfil);
  }

  if (paso === "intro") {
    const slide = SLIDES_INTRO[slideIntro];
    return (
      <div
        onTouchStart={empezarDeslize} onTouchEnd={terminarDeslize}
        onMouseDown={empezarDeslize} onMouseUp={terminarDeslize}
        style={{ minHeight: "100vh", position: "relative", overflow: "hidden", touchAction: "pan-y", userSelect: "none", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
        <style>{`
          @keyframes howriaIntroFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>
        {SLIDES_INTRO.map((s, i) => (
          <div key={i} style={{
            position: "absolute", inset: 0,
            backgroundImage: `linear-gradient(180deg, rgba(18,42,64,0.35) 0%, rgba(18,42,64,0.6) 55%, rgba(18,42,64,0.94) 100%), url(${s.foto})`,
            backgroundSize: "cover", backgroundPosition: "center",
            opacity: i === slideIntro ? 1 : 0,
            transition: "opacity 0.7s ease",
          }} />
        ))}
        <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "24px 28px 0", display: "flex", justifyContent: "center" }}>
            <LogoHowria height={40} />
          </div>
          <div style={{ flex: 1 }} />
          <div key={slideIntro} style={{ padding: "0 28px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box", textAlign: "center", animation: "howriaIntroFade 0.5s ease" }}>
            <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 27, fontWeight: 700, color: CREAM, lineHeight: 1.25, margin: "0 0 10px" }}>{slide.titulo}</h1>
            <p style={{ fontSize: 14, color: "#D8CDB4", margin: 0, lineHeight: 1.5 }}>{slide.texto}</p>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 8, margin: "22px 0" }}>
            {SLIDES_INTRO.map((_, i) => (
              <button key={i} onClick={() => setSlideIntro(i)} aria-label={`Ir a la pantalla ${i + 1}`}
                style={{ width: i === slideIntro ? 20 : 7, height: 7, borderRadius: 4, border: "none", padding: 0, cursor: "pointer", background: i === slideIntro ? GOLD : "rgba(255,255,255,0.35)", transition: "width .2s ease" }} />
            ))}
          </div>
          <div style={{ padding: "0 28px 36px", maxWidth: 420, margin: "0 auto", width: "100%", boxSizing: "border-box", display: "flex", gap: 10 }}>
            <button onClick={() => setPaso("registro")}
              style={{ flex: "0 0 auto", padding: "14px 22px", borderRadius: 999, border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.1)", color: CREAM, fontWeight: 600, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
              Registro de cuenta
            </button>
            <button onClick={() => { setModo("equipo"); setPaso("form"); }}
              style={{ flex: 1, padding: "14px 22px", borderRadius: 999, border: "none", background: GOLD, color: NAVY, fontWeight: 700, fontSize: 14.5, cursor: "pointer", fontFamily: "inherit" }}>
              Iniciar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (paso === "registro") {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
        <div style={{ padding: "18px 20px 0" }}>
          <button onClick={() => setPaso("intro")}
            style={{ border: "none", background: "none", color: NAVY, fontSize: 14, cursor: "pointer", padding: 8, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
            ← Volver
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 28px 60px", maxWidth: 380, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
            <LogoHowria height={56} />
          </div>
          {registroEnviado ? (
            <div style={{ background: "#D8ECDE", borderRadius: 14, padding: "20px 18px", textAlign: "center" }}>
              <p style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 700, color: "#2F6A46" }}>¡Solicitud enviada!</p>
              <p style={{ margin: 0, fontSize: 13.5, color: "#2F6A46", lineHeight: 1.6 }}>El equipo Howria va a revisar tus datos y te va a contactar para darte acceso.</p>
            </div>
          ) : (
            <>
              <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontSize: 22, fontWeight: 700, color: NAVY, textAlign: "center", lineHeight: 1.3, margin: "0 0 8px" }}>
                Únete al equipo Howria
              </h1>
              <p style={{ fontSize: 13, color: "#8A7E5C", textAlign: "center", margin: "0 0 24px", lineHeight: 1.5 }}>
                Cuéntanos de ti — un administrador va a revisar tu solicitud antes de darte acceso a la app.
              </p>
              <label style={labelPill} htmlFor="registro-nombre">Nombre completo</label>
              <input id="registro-nombre" value={formRegistro.nombre} onChange={(e) => setFormRegistro((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Tu nombre" style={inputPill} autoFocus />
              <label style={labelPill} htmlFor="registro-email">Correo de contacto</label>
              <input id="registro-email" type="email" value={formRegistro.email} onChange={(e) => setFormRegistro((f) => ({ ...f, email: e.target.value }))}
                placeholder="tu@correo.com" style={inputPill} />
              <label style={labelPill} htmlFor="registro-telefono">Teléfono (opcional)</label>
              <input id="registro-telefono" value={formRegistro.telefono} onChange={(e) => setFormRegistro((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="+56 9..." style={inputPill} />
              <label style={labelPill} htmlFor="registro-mensaje">Cuéntanos de tu experiencia (opcional)</label>
              <textarea id="registro-mensaje" value={formRegistro.mensaje} onChange={(e) => setFormRegistro((f) => ({ ...f, mensaje: e.target.value }))}
                placeholder="Ej. experiencia paseando o adiestrando perros..." rows={3}
                style={{ ...inputPill, resize: "vertical", fontFamily: "inherit" }} />
              <label style={labelPill} htmlFor="registro-password">Contraseña</label>
              <input id="registro-password" type="password" value={formRegistro.password} onChange={(e) => setFormRegistro((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 6 caracteres" style={inputPill} autoComplete="new-password" />
              <label style={labelPill} htmlFor="registro-password-confirm">Confirmar contraseña</label>
              <input id="registro-password-confirm" type="password" value={formRegistro.passwordConfirm} onChange={(e) => setFormRegistro((f) => ({ ...f, passwordConfirm: e.target.value }))}
                placeholder="Repite tu contraseña" style={inputPill} autoComplete="new-password" />
              {formRegistro.passwordConfirm && formRegistro.password !== formRegistro.passwordConfirm && (
                <p style={{ margin: "-8px 0 16px 6px", fontSize: 12.5, color: RUST }}>Las contraseñas no coinciden.</p>
              )}
              {errorRegistro && <p style={{ margin: "0 0 16px 6px", fontSize: 12.5, color: RUST }}>{errorRegistro}</p>}
              <button onClick={enviarSolicitudRegistro} disabled={!formRegistroValido || enviandoRegistro}
                style={{ ...botonPill, opacity: !formRegistroValido || enviandoRegistro ? 0.45 : 1 }}>
                {enviandoRegistro ? "Enviando..." : "Enviar solicitud"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ padding: "18px 20px 0" }}>
        <button onClick={() => setPaso("intro")}
          style={{ border: "none", background: "none", color: NAVY, fontSize: 14, cursor: "pointer", padding: 8, display: "flex", alignItems: "center", gap: 6, fontFamily: "inherit" }}>
          ← Volver
        </button>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 28px 60px", maxWidth: 380, margin: "0 auto", width: "100%", boxSizing: "border-box" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 28 }}>
          <LogoHowria height={56} />
        </div>
        <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: `1.5px solid ${NAVY}`, marginBottom: 28 }}>
          <button onClick={() => setModo("equipo")} style={{ flex: 1, padding: "10px", border: "none", cursor: "pointer", background: modo === "equipo" ? NAVY : "#FFFFFF", color: modo === "equipo" ? CREAM : NAVY, fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>Soy del equipo</button>
          <button onClick={() => setModo("cliente")} style={{ flex: 1, padding: "10px", border: "none", cursor: "pointer", background: modo === "cliente" ? NAVY : "#FFFFFF", color: modo === "cliente" ? CREAM : NAVY, fontWeight: 600, fontSize: 13, fontFamily: "inherit" }}>Soy cliente</button>
        </div>

        {modo === "equipo" ? (
          <>
            <label style={labelPill} htmlFor="login-nombre">Nombre</label>
            <input id="login-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
              onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
              style={inputPill} autoFocus />
            <label style={labelPill} htmlFor="login-password">Contraseña</label>
            <input id="login-password" type="password" value={passwordEquipo} onChange={(e) => setPasswordEquipo(e.target.value)} placeholder="Tu contraseña"
              onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
              style={{ ...inputPill, marginBottom: errorLogin ? 8 : 24 }} />
            {errorLogin && <p style={{ margin: "0 0 16px 6px", fontSize: 12.5, color: RUST }}>{errorLogin}</p>}
            <button onClick={intentarLogin} disabled={entrando} style={{ ...botonPill, opacity: entrando ? 0.6 : 1 }}>
              {entrando ? "Entrando..." : "Entrar"}
            </button>
          </>
        ) : (
          <>
            {linkEnviado ? (
              <p style={{ margin: 0, fontSize: 13.5, color: "#2F6A46", background: "#D8ECDE", borderRadius: 14, padding: "14px 18px", lineHeight: 1.6 }}>
                ✓ Te enviamos un link de acceso a <b>{emailCliente.trim()}</b>. Ábrelo desde tu correo para entrar — no hace falta contraseña.
              </p>
            ) : (
              <>
                <label style={labelPill} htmlFor="login-email-cliente">Tu correo</label>
                <input id="login-email-cliente" type="email" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} placeholder="tu@correo.com"
                  onKeyDown={(e) => e.key === "Enter" && enviarLinkCliente()} style={inputPill} autoFocus />
                <button onClick={enviarLinkCliente} disabled={!emailCliente.trim() || enviandoLink}
                  style={{ ...botonPill, opacity: !emailCliente.trim() || enviandoLink ? 0.45 : 1 }}>
                  {enviandoLink ? "Enviando..." : "Enviarme el link de acceso"}
                </button>
                <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 10, marginBottom: 0, marginLeft: 6 }}>Usa el correo que nos diste al registrarte como cliente.</p>
              </>
            )}
          </>
        )}
        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 20, textAlign: "center", lineHeight: 1.5 }}>
          {modo === "equipo" ? "Acceso protegido con contraseña — solo el equipo de Howria puede entrar." : "Te mandamos un link de acceso a tu correo, sin contraseña."}
        </p>
      </div>
    </div>
  );
}

// ---------- Selector cuando un correo tiene más de un perrito registrado ----------
function SeleccionarPerrito({ opciones, onElegir, onSalir }) {
  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <LogoHowria height={110} />
        </div>
        <div style={{ background: CREAM, borderRadius: 10, padding: "36px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
          <p style={{ margin: "0 0 20px", fontSize: 15, color: NAVY, fontWeight: 600, textAlign: "center" }}>¿Cuál es tu perrito?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {opciones.map((c) => (
              <button key={c.id} onClick={() => onElegir(c)} type="button"
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 8, border: "1px solid #E4DBC3", background: "#FFFFFF", cursor: "pointer", textAlign: "left", font: "inherit" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
                <span style={{ fontSize: 14, color: NAVY, fontWeight: 600 }}>🐾 {c.perro}</span>
              </button>
            ))}
          </div>
          <button onClick={onSalir} style={{ ...botonSecundario, width: "100%", marginTop: 18 }}>Cerrar sesión</button>
        </div>
      </div>
    </div>
  );
}

// ---------- Portal del cliente ----------
function PortalCliente({ cliente, boletasCliente, onSalir }) {
  const plan = PLANES.find((p) => p.id === cliente.planHabitual);
  // Una boleta "no_enviada" es un borrador que el equipo todavía no revisó
  // — no tiene sentido que el cliente la vea en su historial ni que cuente
  // como algo que debe, antes de que el equipo la acepte.
  const boletasOrdenadas = [...boletasCliente].filter((b) => b.estado !== "no_enviada").sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  const pendientes = boletasCliente.filter(esPorCobrar);
  const totalPendiente = pendientes.reduce((acc, b) => acc + b.total, 0);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ background: NAVY, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <LogoHowria height={40} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <BotonNotificacionesPush usuarioEmail={cliente.email} tituloActivar="Activar aviso de cuándo empieza el paseo de tu perro" />
          <button onClick={onSalir} style={{ background: "none", border: `1.5px solid ${CREAM}`, color: CREAM, borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>Cerrar sesión</button>
        </div>
      </div>

      <div style={{ padding: "28px 20px", maxWidth: 640, margin: "0 auto", display: "grid", gap: 18 }}>
        <div className="howria-card" style={tarjeta}>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <div style={{ width: 76, height: 76, borderRadius: "50%", background: cliente.fotoUrl ? `url(${cliente.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none", border: `3px solid ${CREAM_SOFT}` }} />
            <div>
              <h2 style={{ ...sectionTitle, fontSize: 20, marginBottom: 2 }}>Hola, {cliente.nombre.split(" ")[0]}</h2>
              <p style={{ margin: 0, color: "#8A7E5C", fontSize: 14 }}>🐾 {cliente.perro} · {cliente.raza || "raza no especificada"}</p>
            </div>
          </div>
        </div>

        {totalPendiente > 0 && (
          <div className="howria-card" style={{ ...tarjeta, background: "#F3E3B4", border: "1px solid #E3D08C" }}>
            <p style={{ margin: 0, color: "#6B5518", fontSize: 13.5, fontWeight: 600 }}>Tienes {fmtCLP(totalPendiente)} pendiente de pago ({pendientes.length} boleta{pendientes.length > 1 ? "s" : ""}).</p>
          </div>
        )}

        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Tu plan</h2>
          <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Plan</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{plan?.nombre || "No definido"}</p>
            </div>
            <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14 }}>
              <p style={{ ...label, marginBottom: 6 }}>Valor por paseo</p>
              <p style={{ margin: 0, color: NAVY, fontWeight: 600, fontSize: 14 }}>{fmtCLP(cliente.valorPaseoRef)}</p>
            </div>
          </div>
          <p style={{ ...label, marginTop: 16 }}>Días de paseo habituales</p>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {DIAS_SEMANA.map((d, dow) => (
              <span key={dow} style={{ width: 30, height: 30, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                background: cliente.diasHabituales?.includes(dow) ? NAVY : "#EDE4CE", color: cliente.diasHabituales?.includes(dow) ? CREAM : "#B0A587" }}>
                {d}
              </span>
            ))}
          </div>
        </div>

        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Tus boletas</h2>
          {boletasOrdenadas.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todavía no tienes boletas generadas.</p>
          ) : (
            <div style={{ marginTop: 10 }}>
              {boletasOrdenadas.map((b) => {
                const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
                return (
                  <div key={b.numero} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                    <span>N°{String(b.numero).padStart(3, "0")} · {b.mes} {b.anio} · {b.cantidad} paseos</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <b style={{ color: NAVY }}>{fmtCLP(b.total)}</b>
                      <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20, background: est.bg, color: est.color }}>{est.nombre}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


// ---------- Finanzas ----------
export function inicioSemana(fecha) {
  const f = new Date(fecha);
  const dow = (f.getDay() + 6) % 7; // 0 = lunes
  f.setDate(f.getDate() - dow);
  f.setHours(0, 0, 0, 0);
  return f;
}


// ---------- Pago a trabajadores ----------
function calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda = [], prospectos = [] }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dow = (hoy.getDay() + 6) % 7;
  const hoyStr0 = fechaKey(hoy);
  const avisos = [];

  // "No enviada" necesita que el equipo la revise y la acepte primero —
  // es una acción distinta (y más urgente) a "pendiente_pago", que solo
  // necesita que el cliente pague, así que van en avisos separados.
  const porRevisar = boletasEmitidas.filter((b) => b.estado === "no_enviada");
  if (porRevisar.length > 0) {
    avisos.push({ tipo: "factura-revisar", icono: "📝", texto: `${porRevisar.length} factura(s) por revisar y aceptar`, clave: `revisar-${porRevisar.length}`, tab: "facturas" });
  }

  const pendientes = boletasEmitidas.filter(esPorCobrar);
  const montoPendiente = pendientes.reduce((acc, b) => acc + b.total, 0);
  if (pendientes.length > 0) {
    avisos.push({ tipo: "factura", icono: "💰", texto: `${pendientes.length} boleta(s) por cobrar — ${fmtCLP(montoPendiente)}`, clave: `factura-${pendientes.length}-${montoPendiente}`, tab: "facturas" });
  }

  const clientesHoy = clientes.filter((c) => c.diasHabituales?.includes(dow));
  const sinMarcar = clientesHoy.filter((c) => { const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`]; return !r?.realizado && !r?.cancelado; });
  if (sinMarcar.length > 0) {
    avisos.push({ tipo: "paseo", icono: "🐾", texto: `${sinMarcar.length} paseo(s) de hoy sin marcar como realizado`, detalle: sinMarcar.map((c) => `${c.nombre} (${c.paseadorNombre || "sin paseador"})`).join(", "), clave: `paseo-${hoyStr0}-${sinMarcar.length}`, tab: "coordinacion" });
  }

  const tareasHoy = tareasEquipo.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(hoy) && t.estado !== "hecho");
  if (tareasHoy.length > 0) {
    avisos.push({ tipo: "tarea", icono: "📋", texto: `${tareasHoy.length} tarea(s) del equipo pendiente(s) para hoy`, clave: `tarea-${hoyStr0}-${tareasHoy.length}`, tab: "equipo" });
  }

  // clientes sin tipoServicio guardado (o vacío) se tratan como "paseos"
  // por compatibilidad hacia atrás — antes de que existiera el campo,
  // todo cliente era de paseos. Los que son solo de adiestramiento/clases
  // /evaluación (ej. alumnos del profesor Javier Arniaz) no necesitan
  // paseador, así que no deben generar este aviso.
  const sinPaseador = clientes.filter((c) => !c.paseadorNombre && (!c.tipoServicio?.length || c.tipoServicio.includes("paseos")));
  if (sinPaseador.length > 0) {
    avisos.push({ tipo: "asignacion", icono: "⚠️", texto: `${sinPaseador.length} cliente(s) sin paseador asignado`, clave: `asignacion-${sinPaseador.length}`, tab: "clientes" });
  }

  const necesitanEvaluacion = clientes.filter((c) => c.tipoServicio?.includes("evaluacion") && !citasAgenda.some((cita) => cita.clienteId === c.id && cita.estado === "agendada"));
  if (necesitanEvaluacion.length > 0) {
    avisos.push({ tipo: "evaluacion", icono: "📅", texto: `${necesitanEvaluacion.length} cliente(s) con evaluación pendiente de agendar`, clave: `evaluacion-${necesitanEvaluacion.length}`, tab: "agenda" });
  }

  const hoyStr = fechaKey(hoy);
  const prospectosVencidos = prospectos.filter((p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido");
  if (prospectosVencidos.length > 0) {
    avisos.push({ tipo: "prospecto", icono: "📞", texto: `${prospectosVencidos.length} prospecto(s) con seguimiento pendiente`, clave: `prospecto-${hoyStr}-${prospectosVencidos.length}`, tab: "seguimiento" });
  }

  return avisos;
}

export function rangoPeriodo(periodo, hoy) {
  if (periodo === "semana") {
    const desde = inicioSemana(hoy);
    const hasta = new Date(desde); hasta.setDate(hasta.getDate() + 7);
    const opciones = { day: "2-digit", month: "short" };
    const etiqueta = `${desde.toLocaleDateString("es-CL", opciones)} – ${new Date(hasta.getTime() - 86400000).toLocaleDateString("es-CL", opciones)}`;
    return { desde, hasta, etiqueta };
  }
  const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  return { desde, hasta, etiqueta: `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}` };
}


// ---------- Mis paseos (registro del paseador) ----------
// Fecha en hora LOCAL del navegador, no UTC — toISOString() convierte a
// UTC, y para Chile (UTC-3/-4) eso hace que "el día" cambie como a las
// 8-9pm hora local en vez de a medianoche real. Cualquier cosa que se
// haga en la app pasada esa hora quedaba guardada con la fecha de
// "mañana" (en términos UTC), que al día siguiente en la mañana ya
// coincidía con el día real — así una fase/registro de anoche aparecía
// como si fuera de hoy. Bug real encontrado 2026-08-17 (Javier H: "Mi
// ruta de hoy" mostraba completada sin haberla iniciado).
export function fechaKey(d) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

// Truco para "despegar" Safari/iOS cuando la página queda con el zoom
// trabado (todo se ve chico, aplastado) tras un cambio de contenido
// abrupto — forzar `maximum-scale` un instante obliga a recalcular el
// zoom real a 100%, y se revierte enseguida para no bloquear el zoom
// normal del usuario. Extraído del efecto de cambio de pestaña de App()
// para poder reusarlo en cambios abruptos dentro de una misma pestaña
// (ej. abrir/cerrar la ruta guiada a pantalla completa, o el picker
// nativo de un <input type="date">).
// El content "de verdad" del viewport se guarda una sola vez, la primera
// vez que se llama a esta función — así, si dos llamadas se superponen
// (ej. el efecto de cambio de pestaña de App() y el de MisPaseos al
// entrar a la pestaña, casi al mismo tiempo), la segunda no lee el
// content YA modificado por la primera como si fuera "el original" y lo
// deja pegado para siempre con maximum-scale de más — cosa que pasaba
// antes y hacía que Mis Paseos (la única pestaña con dos disparadores
// superpuestos) quedara con un zoom distinto al resto de la app.
let viewportOriginal = null;
export function forzarRecalculoZoomIOS() {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) return;
  if (viewportOriginal === null) viewportOriginal = meta.getAttribute("content");
  meta.setAttribute("content", `${viewportOriginal}, maximum-scale=1.0`);
  setTimeout(() => meta.setAttribute("content", viewportOriginal), 300);
}

function MisPaseos({ clientes, registroPaseos, setRegistroPaseos, user, usuarios, faseDiaPaseador = {}, actualizarFaseDia, mascotas = [], ausenciasPaseador = {}, justificarAusencia, deshacerAusencia }) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [notaAbiertaId, setNotaAbiertaId] = useState(null);
  const [notaTexto, setNotaTexto] = useState("");
  const [mostrarClientes, setMostrarClientes] = useState(false);
  const [mostrarCapacitacion, setMostrarCapacitacion] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(false);
  const [mostrarJustificar, setMostrarJustificar] = useState(false);
  const [motivoAusencia, setMotivoAusencia] = useState("");

  const miUsuario = usuarios.find((u) => u.email === user.email) || user;
  const misClientes = clientes.filter((c) => c.paseadorNombre === user.nombre);

  function actualizarRegistro(clienteId, fecha, cambios) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...prev[key], ...cambios } }));
  }

  function toggleRealizado(clienteId, fecha) {
    if (fecha > hoy) return;
    const key = `${clienteId}_${fechaKey(fecha)}`;
    const actual = registroPaseos[key];
    actualizarRegistro(clienteId, fecha, { realizado: !actual?.realizado, cancelado: false });
  }

  function toggleCancelado(clienteId, fecha) {
    const key = `${clienteId}_${fechaKey(fecha)}`;
    const actual = registroPaseos[key];
    actualizarRegistro(clienteId, fecha, { cancelado: !actual?.cancelado, realizado: false });
  }

  function guardarNota(clienteId, fecha) {
    actualizarRegistro(clienteId, fecha, { nota: notaTexto.trim() });
    setNotaAbiertaId(null);
    setNotaTexto("");
  }

  function iniciarRuta() {
    actualizarFaseDia(user.nombre, "en_recoleccion");
    setRutaAbierta(true);
  }

  function confirmarAusencia() {
    justificarAusencia(user.nombre, motivoAusencia.trim() || "Sin motivo especificado");
    setMostrarJustificar(false);
    setMotivoAusencia("");
  }

  // Un solo día seleccionado como string (mismo patrón que Itinerario,
  // en vez de semana+índice-dentro-de-semana) — más simple y ya probado
  // en mobile.
  const [diaSel, setDiaSel] = useState(() => fechaKey(hoy));
  const diaActivo = new Date(diaSel + "T00:00:00");
  const dow = (diaActivo.getDay() + 6) % 7;
  const clientesDelDia = misClientes.filter((c) => c.diasHabituales?.includes(dow));

  function cambiarDia(delta) {
    const d = new Date(diaSel + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setDiaSel(fechaKey(d));
  }

  // Mismo problema que el cambio de pestaña en App() (Safari/iOS deja el
  // zoom trabado, todo aplastado, tras un cambio de contenido abrupto):
  // acá pasa al abrir/cerrar la ruta guiada a pantalla completa o al
  // saltar de día.
  useEffect(() => {
    forzarRecalculoZoomIOS();
  }, [rutaAbierta, diaSel]);

  // resumen mensual (las cancelaciones del cliente no cuentan en contra del paseador)
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();
  const resumenMensual = misClientes.map((c) => {
    const diasDelPlan = diasSegunPlan(mesActual, anioActual, c.diasHabituales || []);
    const diasValidos = diasDelPlan.filter((dNum) => !registroPaseos[`${c.id}_${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`]?.cancelado);
    const realizados = diasValidos.filter((dNum) => registroPaseos[`${c.id}_${anioActual}-${String(mesActual + 1).padStart(2, "0")}-${String(dNum).padStart(2, "0")}`]?.realizado).length;
    return { cliente: c, programados: diasValidos.length, realizados, monto: realizados * Number(c.tarifaPaseador || 0) };
  });
  const totalRealizadosMes = resumenMensual.reduce((acc, r) => acc + r.realizados, 0);
  const totalProgramadosMes = resumenMensual.reduce((acc, r) => acc + r.programados, 0);
  const totalMontoMes = resumenMensual.reduce((acc, r) => acc + r.monto, 0);

  // Clientes de hoy (siempre el día real, no el día que se esté mirando en
  // el detalle de abajo) — para el mensaje de "Mi ruta de hoy" y la ruta
  // guiada.
  const dowHoy = (hoy.getDay() + 6) % 7;
  const clientesHoyAnillo = misClientes.filter((c) => c.diasHabituales?.includes(dowHoy));
  let hechosHoy = 0, canceladosHoy = 0, montoHoy = 0;
  clientesHoyAnillo.forEach((c) => {
    const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`] || {};
    if (r.realizado) { hechosHoy++; montoHoy += Number(c.tarifaPaseador || 0); }
    else if (r.cancelado) canceladosHoy++;
  });

  if (misClientes.length === 0) {
    return (
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Mis paseos</h2>
        <p style={{ ...hint, marginTop: 8 }}>Todavía no tienes clientes asignados como paseador. Pídele al administrador que te asigne clientes en la pestaña "Clientes".</p>
      </div>
    );
  }

  const hoyLargo = hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const faseHoy = faseDiaPaseador[user.nombre] || "pendiente";
  const ausenciaHoy = ausenciasPaseador[user.nombre] || null;
  const rutaCompletada = faseHoy === "completado";
  const rutaEnCurso = faseHoy === "en_recoleccion" || faseHoy === "en_parque" || faseHoy === "en_retorno";

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={{ ...tarjeta, background: NAVY, border: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
          <h2 style={{ ...sectionTitle, color: CREAM }}>Mi ruta de hoy</h2>
          <span style={{ fontSize: 12, color: "#9BAAB8", textTransform: "capitalize" }}>{hoyLargo}</span>
        </div>

        {clientesHoyAnillo.length === 0 ? (
          <p style={{ margin: "8px 0 0", fontSize: 13.5, color: "#B7C2CE" }}>No tienes paseos asignados hoy. Disfruta el día 🐾</p>
        ) : rutaCompletada ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 14.5, color: "#8FD3A8", fontWeight: 600 }}>🎉 Completaste tu ruta de hoy — reuniste {fmtCLP(montoHoy)} hoy.</p>
            <button onClick={() => setRutaAbierta(true)} style={{ ...botonSecundario, marginTop: 12, width: "auto", padding: "10px 20px", background: "transparent", color: CREAM, border: "1.5px solid rgba(255,255,255,0.35)" }}>
              Ver resumen
            </button>
          </div>
        ) : ausenciaHoy ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "#B7C2CE" }}>Justificaste tu ausencia de hoy: <b style={{ color: CREAM }}>"{ausenciaHoy}"</b></p>
            <button onClick={() => deshacerAusencia(user.nombre)} style={{ marginTop: 10, background: "none", border: "none", color: GOLD, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}>
              Deshacer
            </button>
          </div>
        ) : rutaEnCurso ? (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "#9BAAB8" }}>Ruta en curso — {hechosHoy + canceladosHoy}/{clientesHoyAnillo.length} resueltos.</p>
            <button onClick={() => setRutaAbierta(true)}
              style={{ width: "100%", marginTop: 14, padding: "15px", borderRadius: 10, border: "none", cursor: "pointer", background: GOLD, color: NAVY, fontSize: 15.5, fontWeight: 700 }}>
              Continuar mi ruta
            </button>
          </div>
        ) : (
          <div style={{ marginTop: 12 }}>
            <p style={{ margin: 0, fontSize: 13.5, color: "#9BAAB8" }}>Hoy tienes {clientesHoyAnillo.length} perro{clientesHoyAnillo.length === 1 ? "" : "s"} para pasear.</p>
            <button onClick={iniciarRuta}
              style={{ width: "100%", marginTop: 14, padding: "15px", borderRadius: 10, border: "none", cursor: "pointer", background: GOLD, color: NAVY, fontSize: 15.5, fontWeight: 700 }}>
              Iniciar ruta
            </button>
            {!mostrarJustificar ? (
              <button onClick={() => setMostrarJustificar(true)}
                style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", color: "#9BAAB8", fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>
                Justificar ausencia
              </button>
            ) : (
              <div style={{ marginTop: 12 }}>
                <input value={motivoAusencia} onChange={(e) => setMotivoAusencia(e.target.value)} placeholder="Ej. me enfermé, tuve una urgencia..."
                  onKeyDown={(e) => e.key === "Enter" && confirmarAusencia()} autoFocus
                  style={{ ...input, marginBottom: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.25)", color: CREAM }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={confirmarAusencia} style={{ ...botonSecundario, background: "transparent", color: CREAM, border: "1.5px solid rgba(255,255,255,0.35)" }}>Confirmar</button>
                  <button onClick={() => { setMostrarJustificar(false); setMotivoAusencia(""); }} style={{ ...botonSecundario, background: "transparent", color: "#9BAAB8", border: "1.5px solid rgba(255,255,255,0.2)" }}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {rutaAbierta && (
        <Suspense fallback={<p style={hint}>Cargando tu ruta…</p>}>
          <RutaGuiada
            clientesHoy={clientesHoyAnillo}
            mascotas={mascotas}
            registroPaseos={registroPaseos}
            setRegistroPaseos={setRegistroPaseos}
            user={user}
            faseHoy={faseHoy}
            actualizarFaseDia={actualizarFaseDia}
            metaMensual={miUsuario.metaMensual}
            totalMontoMes={totalMontoMes}
            onSalir={() => setRutaAbierta(false)}
          />
        </Suspense>
      )}

      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <h2 style={{ ...sectionTitle, textTransform: "capitalize" }}>{diaActivo.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" })}</h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => cambiarDia(-1)} style={botonSecundario}>← Día anterior</button>
            <button onClick={() => setDiaSel(fechaKey(hoy))} style={botonSecundario}>Hoy</button>
            <input type="date" value={diaSel} max={fechaKey(hoy)} onChange={(e) => e.target.value && setDiaSel(e.target.value)} style={{ ...input, margin: 0, width: 150 }} />
            <button onClick={() => cambiarDia(1)} disabled={diaSel >= fechaKey(hoy)} style={{ ...botonSecundario, opacity: diaSel >= fechaKey(hoy) ? 0.5 : 1 }}>Día siguiente →</button>
          </div>
        </div>

        <p style={{ ...label, marginTop: 18 }}>Clientes programados este día</p>
        {clientesDelDia.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>No tienes paseos programados este día.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {clientesDelDia.map((c) => {
              const key = `${c.id}_${fechaKey(diaActivo)}`;
              const registro = registroPaseos[key] || {};
              const hecho = !!registro.realizado;
              const cancelado = !!registro.cancelado;
              return (
                <div key={c.id} style={{
                  padding: "14px 16px", borderRadius: 8,
                  border: cancelado ? `1.5px solid ${RUST}` : hecho ? `1.5px solid #2F6A46` : "1px solid #E4DBC3",
                  background: cancelado ? "#F1DCD2" : hecho ? "#D8ECDE" : "#FFFFFF",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", rowGap: 8 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
                      <div>
                        <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{c.nombre}</div>
                        <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>🐾 {c.perro}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {!cancelado && (
                        <button onClick={() => toggleRealizado(c.id, diaActivo)} disabled={diaActivo > hoy}
                          style={{ fontSize: 12.5, fontWeight: 600, color: hecho ? "#2F6A46" : "#B0A587", background: "none", border: "none", cursor: diaActivo > hoy ? "default" : "pointer" }}>
                          {hecho ? "✓ Realizado" : "Marcar realizado"}
                        </button>
                      )}
                      <button onClick={() => toggleCancelado(c.id, diaActivo)}
                        style={{ fontSize: 11.5, color: cancelado ? RUST : "#B0A587", background: "none", border: `1px solid ${cancelado ? RUST : "#DCD2B4"}`, borderRadius: 14, padding: "4px 10px", cursor: "pointer" }}>
                        {cancelado ? "Cliente canceló" : "Marcar cancelado"}
                      </button>
                    </div>
                  </div>
                  {registro.nota && notaAbiertaId !== key && (
                    <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#5C5442", fontStyle: "italic" }}>"{registro.nota}"</p>
                  )}
                  {notaAbiertaId === key ? (
                    <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                      <input value={notaTexto} onChange={(e) => setNotaTexto(e.target.value)} placeholder="Ej. estuvo muy energético hoy..."
                        onKeyDown={(e) => e.key === "Enter" && guardarNota(c.id, diaActivo)} style={{ ...input, marginBottom: 0, flex: 1 }} autoFocus />
                      <button onClick={() => guardarNota(c.id, diaActivo)} style={{ ...botonSecundario, padding: "8px 14px" }}>Guardar</button>
                    </div>
                  ) : (
                    <button onClick={() => { setNotaAbiertaId(key); setNotaTexto(registro.nota || ""); }} style={{ marginTop: 8, background: "none", border: "none", color: "#8A7E5C", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                      {registro.nota ? "Editar nota" : "+ Agregar nota"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Tu pago — {MESES[mesActual]} {anioActual}</h2>
        <div className="howria-stats-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, margin: "16px 0 22px" }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#9BAAB8", textTransform: "uppercase" }}>Paseos realizados</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, fontFamily: "Georgia, serif" }}>{totalRealizadosMes} / {totalProgramadosMes}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Avance del mes</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{totalProgramadosMes ? Math.round((totalRealizadosMes / totalProgramadosMes) * 100) : 0}%</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 16 }}>
            <p style={{ margin: "0 0 6px", fontSize: 11.5, color: "#8A7E5C", textTransform: "uppercase" }}>Monto estimado a recibir</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(totalMontoMes)}</p>
          </div>
        </div>
        <p style={hint}>Los días marcados "cliente canceló" no cuentan en tu meta ni en tu pago. Este monto es un estimado según tus paseos marcados este mes — no es la misma cifra que ves en Finanzas, que refleja lo facturado al cliente, no lo que se te paga a ti.</p>

        <p style={label}>Detalle por cliente</p>
        <div>
          {resumenMensual.map((r) => (
            <div key={r.cliente.id} style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "4px 12px", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
              <span style={{ color: INK, flex: "1 1 140px", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.cliente.nombre} · {r.cliente.perro}</span>
              <span style={{ color: "#8A7E5C", flex: "none" }}>{r.realizados} / {r.programados} paseos</span>
              <b style={{ color: NAVY, flex: "none" }}>{fmtCLP(r.monto)}</b>
            </div>
          ))}
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <button onClick={() => setMostrarClientes((v) => !v)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}>
          <span>
            <h2 style={{ ...sectionTitle, marginBottom: mostrarClientes ? 6 : 0 }}>Mis clientes y horarios ({misClientes.length})</h2>
            {!mostrarClientes && <p style={{ ...hint, margin: 0 }}>Tu horario completo, para tenerlo siempre a mano.</p>}
          </span>
          <span style={{ fontSize: 13, color: "#8A7E5C", flex: "none", marginLeft: 10 }}>{mostrarClientes ? "▴" : "▾"}</span>
        </button>
        {mostrarClientes && (
          <>
            <p style={hint}>Tu horario completo, para tenerlo siempre a mano.</p>
            <div className="howria-mispaseos-tabla" style={{ overflowX: "auto", marginTop: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase" }}>
                    <th style={{ padding: "8px 10px" }}>Cliente</th>
                    <th style={{ padding: "8px 10px" }}>Perro</th>
                    <th style={{ padding: "8px 10px" }}>Días</th>
                    <th style={{ padding: "8px 10px" }}>Hora</th>
                    <th style={{ padding: "8px 10px" }}>Dirección</th>
                  </tr>
                </thead>
                <tbody>
                  {misClientes.map((c) => (
                    <tr key={c.id} style={{ borderTop: "1px solid #EDE4CE" }}>
                      <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{c.nombre}</td>
                      <td style={{ padding: "10px" }}>🐾 {c.perro}</td>
                      <td style={{ padding: "10px" }}>{(c.diasHabituales || []).map((d) => DIAS_SEMANA[d]).join(" · ") || "—"}</td>
                      <td style={{ padding: "10px" }}>{c.horaHabitual || "—"}</td>
                      <td style={{ padding: "10px", color: "#8A7E5C" }}>{c.direccion || "sin dirección"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="howria-mispaseos-tarjetas" style={{ display: "none", marginTop: 12 }}>
              {misClientes.map((c) => (
                <div key={c.id} style={{ padding: "12px 14px", borderRadius: 8, border: "1px solid #EDE4CE", background: "#FFFFFF" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, color: NAVY, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre} <span style={{ fontWeight: 400, color: "#8A7E5C" }}>· 🐾 {c.perro}</span></p>
                      <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.direccion || "sin dirección"}</p>
                    </div>
                  </div>
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: INK }}>
                    {(c.diasHabituales || []).map((d) => DIAS_SEMANA[d]).join(" · ") || "Sin días asignados"}{c.horaHabitual ? ` · ${c.horaHabitual}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <button onClick={() => setMostrarCapacitacion((v) => !v)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", border: "none", background: "none", cursor: "pointer", padding: 0, font: "inherit", textAlign: "left" }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Mi capacitación</h2>
          <span style={{ fontSize: 12.5, color: "#8A7E5C", flex: "none", marginLeft: 10, fontWeight: 600 }}>
            {(miUsuario.capacitacionCompletada || []).length}/{PASOS_CAPACITACION.length} {mostrarCapacitacion ? "▴" : "▾"}
          </span>
        </button>
        {mostrarCapacitacion && (
          <>
            <p style={{ ...hint, marginTop: 6 }}>La marca tu coordinador o administrador a medida que la vas completando.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              {PASOS_CAPACITACION.map((paso) => {
                const hecho = (miUsuario.capacitacionCompletada || []).includes(paso.id);
                return (
                  <div key={paso.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: hecho ? "#2F6A46" : "#8A7E5C" }}>
                    <span>{hecho ? "✓" : "○"}</span>
                    {paso.texto}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}


// Fila de lista con ícono a la izquierda + título/subtítulo + valor a la
// derecha — mismo patrón en toda la sección "de un vistazo" de Inicio.
export function FilaLista({ Icono, titulo, subtitulo, valor, valorColor, onClick }) {
  return (
    <button onClick={onClick} disabled={!onClick} type="button"
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 0", border: "none", borderBottom: "1px solid #F1EAD9", background: "none", cursor: onClick ? "pointer" : "default", font: "inherit", textAlign: "left" }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center", flex: "none", color: NAVY }}>
        <Icono size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{titulo}</p>
        {subtitulo && <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitulo}</p>}
      </div>
      {valor && <span style={{ fontSize: 11.5, fontWeight: 600, color: valorColor || "#8A7E5C", flex: "none" }}>{valor}</span>}
    </button>
  );
}

// Inicio del paseador/entrenador: a diferencia del dashboard administrativo
// de abajo, acá lo único que importa es "¿quién soy y a quién le doy el
// paseo hoy?" — perfil arriba, clientes asignados abajo, y un acceso directo
// a "Mis paseos" para marcarlos como hechos sin tener que navegar más.
export function PuntoClave({ label, valor }) {
  return (
    <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 10.5, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</p>
      <p style={{ margin: "2px 0 0", fontSize: 13, color: NAVY, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis" }}>{valor}</p>
    </div>
  );
}

// Evaluaciones pedidas por el link público, todavía sin confirmar por el
// equipo (citas_agenda con estado "pendiente") — acceso directo para no
// tener que ir a buscarlas en Agenda. La usan tanto el Inicio del
// entrenador (solo las suyas) como el de coordinador/administrador
// (todas), cada uno con su propio filtro de entrada.
function EvaluacionesPorConfirmar({ citas, setTab }) {
  if (citas.length === 0) return null;
  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Evaluaciones por confirmar</h2>
      <p style={{ ...hint, marginTop: 8 }}>Pidieron hora por el link público — quedan acá hasta que se acepten o rechacen en Agenda.</p>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {citas.map((c) => (
          <button key={c.id} onClick={() => setTab("agenda")}
            style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, textAlign: "left", padding: "10px", borderRadius: 10, border: "1px solid #E4DBC3", background: "#FFFDF7", cursor: "pointer", font: "inherit" }}>
            <PuntoClave label="Tutor" valor={c.clienteNombre} />
            <PuntoClave label="Perro" valor={c.perro || "—"} />
            <PuntoClave label="Fecha" valor={new Date(c.fechaISO).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} />
          </button>
        ))}
      </div>
    </div>
  );
}

function InicioPaseador({ clientes, registroPaseos, setRegistroPaseos, usuarios, user, setTab, citasAgenda = [], mascotas = [], tabs, onAbrirAlumno, onAbrirCliente }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const miUsuario = usuarios.find((u) => u.email === user.email) || user;
  const misClientes = clientes.filter((c) => c.paseadorNombre === user.nombre);
  const fechaLarga = hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const esEntrenador = user.rol === "entrenador";

  let diasPaseando = null;
  if (miUsuario.fechaInicio) {
    const inicio = new Date(miUsuario.fechaInicio + "T00:00:00");
    if (!isNaN(inicio)) diasPaseando = Math.max(0, Math.floor((hoy - inicio) / 86400000));
  }

  const encabezado = (
    <div className="howria-card" style={{ ...tarjeta, background: NAVY, border: "none", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(201,150,47,0.12)" }} />
      <div style={{ display: "flex", alignItems: "center", gap: 16, position: "relative" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", flex: "none", background: miUsuario.fotoUrl ? `url(${miUsuario.fotoUrl}) center/cover` : "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.25)" }}>
          {!miUsuario.fotoUrl && <span style={{ color: CREAM, fontSize: 24, fontWeight: 700, fontFamily: "Georgia, serif" }}>{user.nombre.charAt(0).toUpperCase()}</span>}
        </div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ ...sectionTitle, color: CREAM, fontSize: 21, margin: 0 }}>{user.nombre}</h2>
          <p style={{ fontSize: 12.5, color: "#9BAAB8", margin: "3px 0 2px", textTransform: "capitalize" }}>{user.rol} · {fechaLarga}</p>
          {diasPaseando !== null && (
            <p style={{ fontSize: 12.5, color: GOLD, margin: 0, fontWeight: 600 }}>
              {diasPaseando === 0 ? "Hoy es tu primer día 🐾" : `${diasPaseando} día${diasPaseando === 1 ? "" : "s"} paseando con Howria 🐾`}
            </p>
          )}
        </div>
      </div>
    </div>
  );

  if (esEntrenador) {
    // Queda en la lista desde que se acepta la cita (estado "agendada")
    // hasta que se marca realizada en Agenda — no es una entidad nueva,
    // solo un filtro sobre citas_agenda pensado para reconocer rápido a
    // quién hay que atender, sin tener que ir a buscarlo en Clientes.
    const citasPorAtender = citasAgenda
      .filter((c) => c.adiestrador === user.nombre && c.estado === "agendada" && c.clienteId)
      .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));

    // Alumnos que el entrenador marcó a mano desde su caso en Alumnos
    // ("★ Agregar a Inicio") para entrar directo sin pasar por la lista.
    const alumnosDestacados = clientes.filter((c) => c.accesoRapido && c.adiestradorNombre === user.nombre);

    // Clientes que entraron por el link público pidiendo evaluación con
    // él — automático (no requiere marcarlos a mano como los alumnos
    // destacados), mismo estilo de chip para reconocerlos igual de rápido.
    const clientesEvaluacionPropios = clientes.filter((c) => c.tipoServicio?.includes("evaluacion") && c.adiestradorNombre === user.nombre && (c.estadoCliente || "activo") !== "baja");

    // Evaluaciones que pidieron hora CON ÉL por el link público y siguen
    // sin confirmar — prioridad 2 en su Inicio, justo después de sus
    // alumnos destacados (prioridad 1).
    const evaluacionesPendientesPropias = citasAgenda
      .filter((c) => c.tipo === "evaluacion" && c.estado === "pendiente" && c.adiestrador === user.nombre)
      .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));

    return (
      <div style={{ display: "grid", gap: 20 }}>
        <div className="howria-inicio-entrenador-encabezado">{encabezado}</div>
        {alumnosDestacados.length > 0 && (
          <div className="howria-card" style={tarjeta}>
            <h2 style={sectionTitle}>Accesos directos</h2>
            <p style={{ ...hint, marginTop: 8 }}>Alumnos que marcaste para entrar directo a su caso.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {alumnosDestacados.map((c) => (
                <button key={c.id} onClick={() => onAbrirAlumno && onAbrirAlumno(c._dbId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 20, border: "1px solid #E4DBC3", background: "#FFFDF7", cursor: "pointer" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
                  <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600 }}>{c.perro}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {clientesEvaluacionPropios.length > 0 && (
          <div className="howria-card" style={tarjeta}>
            <h2 style={sectionTitle}>Evaluación</h2>
            <p style={{ ...hint, marginTop: 8 }}>Clientes que pidieron evaluación contigo por el link público.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
              {clientesEvaluacionPropios.map((c) => (
                <button key={c.id} onClick={() => onAbrirCliente && onAbrirCliente(c._dbId)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 20, border: "1px solid #E4DBC3", background: "#FFFDF7", cursor: "pointer" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
                  <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600 }}>{c.perro}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <EvaluacionesPorConfirmar citas={evaluacionesPendientesPropias} setTab={setTab} />
        <LauncherMobile tabs={tabs} setTab={setTab} destacar={["alumnos", "agenda"]} />
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Clientes por atender</h2>
          <p style={{ ...hint, marginTop: 8 }}>Citas que ya aceptaste en Agenda — cada una queda acá hasta que la marques como realizada.</p>
          {citasPorAtender.length === 0 ? (
            <p style={{ ...hint, marginTop: 12 }}>No tienes citas aceptadas pendientes de atender.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
              {citasPorAtender.map((c) => {
                const cliente = clientes.find((cl) => cl._dbId === c.clienteId);
                if (!cliente) return null;
                const mascota = mascotas.find((m) => m.clienteId === c.clienteId);
                const energia = mascota?.nivelEnergia ? NIVELES_ENERGIA.find((n) => n.id === mascota.nivelEnergia)?.nombre : null;
                const temperamento = mascota?.temperamento?.length
                  ? mascota.temperamento.map((t) => TAGS_TEMPERAMENTO.find((x) => x.id === t)?.nombre || t).join(", ")
                  : null;
                const energiaTexto = [energia, temperamento].filter(Boolean).join(" · ") || "Sin datos registrados";
                return (
                  <div key={c.id} style={{ border: "1px solid #E4DBC3", borderRadius: 10, padding: 14, background: "#FFFDF7" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
                      <b style={{ color: NAVY, fontSize: 15 }}>{cliente.nombre}</b>
                      <span style={{ fontSize: 12, color: "#8A7E5C" }}>
                        {c.tipo === "evaluacion" ? "Evaluación" : "Clase"} · {new Date(c.fechaISO).toLocaleString("es-CL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                      <PuntoClave label="Perro" valor={`🐾 ${cliente.perro}${cliente.raza ? ` · ${cliente.raza}` : ""}`} />
                      <PuntoClave label="Objetivo" valor={cliente.objetivos || "Sin objetivo registrado"} />
                      <PuntoClave label="Energía / temperamento" valor={energiaTexto} />
                      <PuntoClave label="Teléfono" valor={cliente.telefono || "Sin teléfono"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  const dowHoy = (hoy.getDay() + 6) % 7;
  const clientesHoy = misClientes.filter((c) => c.diasHabituales?.includes(dowHoy));
  const pendientesHoy = clientesHoy.filter((c) => {
    const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`];
    return !r?.realizado && !r?.cancelado;
  });

  function resolverPaseo(clienteId, cambios) {
    const key = `${clienteId}_${fechaKey(hoy)}`;
    setRegistroPaseos((prev) => ({ ...prev, [key]: { ...prev[key], ...cambios } }));
  }

  const inicioSemanaVista = inicioSemana(hoy);
  const diasSemanaVista = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(inicioSemanaVista);
    d.setDate(d.getDate() + i);
    return d;
  });
  const resumenSemana = diasSemanaVista.map((d, i) => {
    const clientesDia = misClientes.filter((c) => c.diasHabituales?.includes(i));
    const realizados = clientesDia.filter((c) => registroPaseos[`${c.id}_${fechaKey(d)}`]?.realizado).length;
    return { fecha: d, total: clientesDia.length, realizados };
  });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {encabezado}

      {clientesHoy.length > 0 && pendientesHoy.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Paseo de hoy</h2>
          <p style={{ ...hint, marginTop: 8 }}>Confirma o rechaza — al tocar, desaparece de la lista.</p>
          <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
            {pendientesHoy.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid #E4DBC3", background: "#FFFDF7" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT, flex: "none" }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.nombre}</p>
                  <p style={{ margin: "2px 0 0", fontSize: 12, color: "#8A7E5C" }}>🐾 {c.perro}{c.horaHabitual ? ` · ${c.horaHabitual}` : ""}</p>
                </div>
                <div style={{ display: "flex", gap: 6, flex: "none" }}>
                  <button onClick={() => resolverPaseo(c.id, { realizado: true, cancelado: false })} title="Confirmar"
                    style={{ width: 38, height: 38, borderRadius: 8, border: "none", cursor: "pointer", background: "#2F6A46", color: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CircleCheck size={19} />
                  </button>
                  <button onClick={() => resolverPaseo(c.id, { cancelado: true, realizado: false })} title="Rechazar"
                    style={{ width: 38, height: 38, borderRadius: 8, border: "none", cursor: "pointer", background: "rgba(168,92,59,0.15)", color: RUST, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CircleX size={19} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Calendario exprés</h2>
        <p style={{ ...hint, marginTop: 8 }}>Tus paseos programados esta semana.</p>
        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginTop: 10 }}>
          {resumenSemana.map((d, i) => {
            const esHoyCol = fechaKey(d.fecha) === fechaKey(hoy);
            return (
              <div key={i} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: esHoyCol ? NAVY : CREAM_SOFT }}>
                <p style={{ margin: 0, fontSize: 10.5, color: esHoyCol ? "#9BAAB8" : "#8A7E5C" }}>{DIAS_SEMANA[i]} {d.fecha.getDate()}</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: esHoyCol ? CREAM : NAVY }}>{d.realizados}/{d.total}</p>
              </div>
            );
          })}
        </div>
        <button onClick={() => setTab("mis-paseos")}
          style={{ width: "100%", marginTop: 18, padding: "15px", borderRadius: 10, border: "none", cursor: "pointer", background: GOLD, color: NAVY, fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Footprints size={18} /> Ir a Mis paseos
        </button>
      </div>
    </div>
  );
}

// Grid de íconos tipo "app launcher" que aparece arriba de Inicio en
// mobile — mismo para administrador/coordinador y para el entrenador,
// cada uno con sus propias pestañas permitidas (tabs ya viene filtrado
// por rol desde App()).
function LauncherMobile({ tabs, setTab, destacar = [] }) {
  if (!tabs) return null;
  return (
    <div className="howria-launcher-mobile" style={{ display: "none" }}>
      {ORDEN_GRUPOS.map((grupo) => {
        const tabsDelGrupo = tabs.filter((t) => t.grupo === grupo);
        if (tabsDelGrupo.length === 0) return null;
        return (
          <div key={grupo} style={{ marginBottom: 18 }}>
            <p style={{ ...label, marginBottom: 10 }}>{grupo}</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              {tabsDelGrupo.map((t, i) => {
                const Icono = ICONOS_TAB[t.id] || Home;
                const { bg, color } = PALETA_LAUNCHER[i % PALETA_LAUNCHER.length];
                const esDestacado = destacar.includes(t.id);
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    style={{
                      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                      padding: "16px 6px", border: "none", borderRadius: 16, background: esDestacado ? GOLD : "#FFFFFF",
                      boxShadow: esDestacado ? "0 4px 14px rgba(201,150,47,0.35)" : "0 2px 10px rgba(20,33,61,0.08)", cursor: "pointer", font: "inherit",
                    }}>
                    <span style={{ width: 46, height: 46, borderRadius: 14, background: esDestacado ? NAVY : bg, display: "flex", alignItems: "center", justifyContent: "center", color: esDestacado ? CREAM : color, flex: "none" }}>
                      <Icono size={21} />
                    </span>
                    <span style={{ fontSize: 11.5, color: esDestacado ? NAVY : INK, textAlign: "center", lineHeight: 1.25, fontWeight: esDestacado ? 700 : 500 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Inicio (dashboard) ----------
function Inicio({ clientes, boletasEmitidas, registroPaseos, setRegistroPaseos, tareasEquipo, objetivosSemanales, usuarios, citasAgenda, prospectos, mascotas, setTab, user, tabs, faseDiaPaseador = {}, ausenciasPaseador = {}, onAbrirAlumno, onAbrirCliente }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dow = (hoy.getDay() + 6) % 7;
  if (user.rol === "paseador" || user.rol === "entrenador") {
    return <InicioPaseador clientes={clientes} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} usuarios={usuarios} user={user} setTab={setTab} citasAgenda={citasAgenda} mascotas={mascotas} tabs={tabs} onAbrirAlumno={onAbrirAlumno} onAbrirCliente={onAbrirCliente} />;
  }
  const todosLosAvisos = calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda, prospectos });

  const [descartados, setDescartados] = useState(() => {
    try { return JSON.parse(localStorage.getItem("howria_avisos_descartados") || "[]"); } catch { return []; }
  });
  function descartarAviso(clave) {
    setDescartados((prev) => {
      const next = [...prev, clave];
      localStorage.setItem("howria_avisos_descartados", JSON.stringify(next));
      return next;
    });
  }
  const avisos = todosLosAvisos.filter((a) => !descartados.includes(a.clave));

  const clientesHoy = clientes.filter((c) => c.diasHabituales?.includes(dow));
  const realizadosHoy = clientesHoy.filter((c) => registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.realizado).length;

  const pendientesCobro = boletasEmitidas.filter(esPorCobrar);
  const montoPendiente = pendientesCobro.reduce((acc, b) => acc + b.total, 0);

  const { desde, hasta } = rangoPeriodo("semana", hoy);
  const semanaKey = fechaKey(desde);
  const objetivosSemana = objetivosSemanales.filter((o) => o.semanaKey === semanaKey);
  const objetivosCumplidos = objetivosSemana.filter((o) => o.cumplido).length;

  const boletasVenta = boletasEmitidas.filter(esVenta);
  const ingresosSemana = boletasVenta.filter((b) => { const f = new Date(b.fechaISO); return f >= desde && f < hasta; });
  const totalIngresosSemana = ingresosSemana.reduce((acc, b) => acc + b.total, 0);
  const dataGraficoSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(desde); d.setDate(d.getDate() + i);
    const total = boletasVenta.filter((b) => fechaKey(new Date(b.fechaISO)) === fechaKey(d)).reduce((acc, b) => acc + b.total, 0);
    return { etiqueta: DIAS_SEMANA[i], total };
  });

  const hoyStr = fechaKey(hoy);
  const prospectosVencidos = prospectos.filter((p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido");
  const proximasCitas = citasAgenda.filter((c) => c.estado === "agendada" && new Date(c.fechaISO) >= hoy).sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO)).slice(0, 4);
  // Todas las evaluaciones pedidas por el link público sin confirmar
  // todavía (cualquier entrenador) — coordinación/administrador ven el
  // negocio completo, a diferencia del entrenador que solo ve las suyas.
  const evaluacionesPendientesTodas = citasAgenda
    .filter((c) => c.tipo === "evaluacion" && c.estado === "pendiente")
    .sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO));
  // Todos los clientes que entraron por evaluación (cualquier entrenador),
  // mismo criterio que la vista del entrenador pero sin acotar por quién
  // los atiende — coordinación/administrador ven el negocio completo.
  const clientesEvaluacionTodos = clientes.filter((c) => c.tipoServicio?.includes("evaluacion") && (c.estadoCliente || "activo") !== "baja");
  const equipoActivo = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador");

  const fechaLarga = hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  function iconoStat(i) {
    const { bg, color } = PALETA_LAUNCHER[i % PALETA_LAUNCHER.length];
    return { width: 38, height: 38, borderRadius: 11, background: bg, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 10, color };
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={{ ...tarjeta, background: NAVY, border: "none", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(201,150,47,0.12)" }} />
        <div style={{ position: "absolute", top: 30, right: 60, width: 70, height: 70, borderRadius: "50%", background: "rgba(255,255,255,0.05)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
          <div style={{ width: 52, height: 52, borderRadius: "50%", flex: "none", background: user.fotoUrl ? `url(${user.fotoUrl}) center/cover` : "rgba(255,255,255,0.14)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid rgba(255,255,255,0.25)" }}>
            {!user.fotoUrl && <span style={{ color: CREAM, fontSize: 19, fontWeight: 700, fontFamily: "Georgia, serif" }}>{user.nombre.charAt(0).toUpperCase()}</span>}
          </div>
          <div>
            <h2 style={{ ...sectionTitle, color: CREAM, fontSize: 22, margin: 0 }}>Hola, {user.nombre.split(" ")[0]} 🐾</h2>
            <p style={{ fontSize: 12.5, color: "#9BAAB8", margin: "3px 0 0", textTransform: "capitalize" }}>{fechaLarga}</p>
          </div>
        </div>
      </div>

      <LauncherMobile tabs={tabs} setTab={setTab} />

      {clientesEvaluacionTodos.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Evaluación</h2>
          <p style={{ ...hint, marginTop: 8 }}>Clientes que entraron pidiendo evaluación por el link público.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 12 }}>
            {clientesEvaluacionTodos.map((c) => (
              <button key={c.id} onClick={() => onAbrirCliente && onAbrirCliente(c._dbId)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 20, border: "1px solid #E4DBC3", background: "#FFFDF7", cursor: "pointer" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", flex: "none", background: c.fotoUrl ? `url(${c.fotoUrl}) center/cover` : CREAM_SOFT }} />
                <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600 }}>{c.perro}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <EvaluacionesPorConfirmar citas={evaluacionesPendientesTodas} setTab={setTab} />

      {avisos.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#F3E3B4", border: "1px solid #E3D08C" }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 700, color: "#6B5518", textTransform: "uppercase", letterSpacing: 0.5 }}>Avisos</p>
          {avisos.map((a) => (
            <div key={a.clave} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <p style={{ margin: 0, fontSize: 13.5, color: "#6B5518" }}>{a.icono} {a.texto}</p>
              <button onClick={() => descartarAviso(a.clave)} title="Descartar"
                style={{ border: "none", background: "none", color: "#9A8641", cursor: "pointer", fontSize: 15, lineHeight: 1, flexShrink: 0 }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="howria-inicio-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <button onClick={() => setTab("mis-paseos")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <div style={iconoStat(0)}><Footprints size={17} /></div>
          <p style={{ ...label, marginBottom: 8 }}>Paseos de hoy</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{realizadosHoy} / {clientesHoy.length}</p>
        </button>
        <button onClick={() => setTab("facturas")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <div style={iconoStat(1)}><Receipt size={17} /></div>
          <p style={{ ...label, marginBottom: 8 }}>Boletas por cobrar</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(montoPendiente)}</p>
        </button>
        <button onClick={() => setTab("agenda")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <div style={iconoStat(2)}><Calendar size={17} /></div>
          <p style={{ ...label, marginBottom: 8 }}>Evaluaciones agendadas</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{citasAgenda.filter((c) => c.estado === "agendada").length}</p>
        </button>
        <button onClick={() => setTab("seguimiento")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <div style={iconoStat(3)}><Target size={17} /></div>
          <p style={{ ...label, marginBottom: 8 }}>Prospectos por seguir</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{prospectosVencidos.length}</p>
        </button>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
        <div className="howria-card" style={tarjeta}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <h2 style={sectionTitle}>Ingresos de esta semana</h2>
            <b style={{ color: NAVY, fontSize: 16 }}>{fmtCLP(totalIngresosSemana)}</b>
          </div>
          <div style={{ width: "100%", height: 160, marginTop: 10 }}>
            <Suspense fallback={<div style={{ width: "100%", height: "100%" }} />}>
              <GraficoIngresosSemana data={dataGraficoSemana} />
            </Suspense>
          </div>
        </div>

        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Estado del equipo</h2>
          <p style={{ ...hint, marginTop: -2 }}>Fase del día de cada paseador/entrenador.</p>
          <div style={{ marginTop: 8, display: "grid", gap: 10 }}>
            {equipoActivo.length === 0 ? (
              <p style={hint}>No hay paseadores ni entrenadores cargados.</p>
            ) : (
              equipoActivo.map((u) => {
                const motivoAusencia = ausenciasPaseador[u.nombre];
                const faseId = faseDiaPaseador[u.nombre] || "pendiente";
                const fase = FASES_PASEADOR.find((f) => f.id === faseId) || FASES_PASEADOR[0];
                return (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: u.fotoUrl ? `url(${u.fotoUrl}) center/cover` : CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5, fontWeight: 700, color: NAVY, flex: "none" }}>
                      {!u.fotoUrl && u.nombre.charAt(0).toUpperCase()}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: INK, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.nombre}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 20, background: motivoAusencia ? "#F1DCD2" : fase.bg, color: motivoAusencia ? RUST : fase.color, flex: "none" }}>
                      {motivoAusencia ? "Ausente" : fase.nombre}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Prospectos por seguir</h2>
          {prospectosVencidos.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Ninguno vencido — al día.</p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {prospectosVencidos.map((p) => (
                <FilaLista key={p.id} Icono={Target} titulo={p.nombre} subtitulo="Prospecto vencido"
                  valor={p.origen} valorColor={RUST} onClick={() => setTab("seguimiento")} />
              ))}
            </div>
          )}
        </div>

        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Próximas citas de agenda</h2>
          {proximasCitas.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>No hay citas próximas.</p>
          ) : (
            <div style={{ marginTop: 6 }}>
              {proximasCitas.map((c) => (
                <FilaLista key={c.id} Icono={Calendar} titulo={c.clienteNombre} subtitulo={c.adiestrador}
                  valor={new Date(c.fechaISO).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  onClick={() => setTab("agenda")} />
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Paseos de hoy</h2>
        {clientesHoy.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>No hay paseos programados para hoy.</p>
        ) : (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  <th style={{ padding: "8px 10px" }}>Cliente</th>
                  <th style={{ padding: "8px 10px" }}>Paseador</th>
                  <th style={{ padding: "8px 10px" }}>Horario</th>
                  <th style={{ padding: "8px 10px" }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {clientesHoy.map((c) => {
                  const registro = registroPaseos[`${c.id}_${fechaKey(hoy)}`];
                  const estado = registro?.realizado ? "Realizado" : registro?.cancelado ? "Cancelado" : "Pendiente";
                  const colorEstado = registro?.realizado ? "#2F6A46" : registro?.cancelado ? RUST : "#8A6A1E";
                  const bgEstado = registro?.realizado ? "#D8ECDE" : registro?.cancelado ? "#F1DCD2" : "#F3E3B4";
                  return (
                    <tr key={c.id} onClick={() => setTab("mis-paseos")} style={{ borderTop: "1px solid #EDE4CE", cursor: "pointer" }}>
                      <td style={{ padding: "10px" }}>{c.nombre} <span style={{ color: "#8A7E5C" }}>· 🐾 {c.perro}</span></td>
                      <td style={{ padding: "10px", color: "#6B6248" }}>{c.paseadorNombre || "Sin asignar"}</td>
                      <td style={{ padding: "10px", color: "#6B6248" }}>{c.horaHabitual || "—"}</td>
                      <td style={{ padding: "10px" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: bgEstado, color: colorEstado }}>{estado}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}




// ---------- Estilos compartidos ----------
export const sectionTitle = { fontSize: 18, color: NAVY, fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, letterSpacing: 0.1, marginBottom: 6, marginTop: 0 };
export const hint = { fontSize: 12.5, color: "#9A9179", margin: "0 0 12px" };
export const label = { display: "block", fontSize: 11.5, color: "#8A7E5C", marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" };
// fontSize 16 (no 14) a propósito: por debajo de 16px, Safari en iPhone
// hace zoom automático al enfocar el campo (para que se pueda leer),
// lo que Javier reportó como "de repente se activa el zoom" al usar la
// app — pasa en cualquier <input>/<select>/<textarea> que use este
// estilo, o sea, prácticamente todos los formularios de la app.
export const input = { width: "100%", boxSizing: "border-box", padding: "10px 13px", marginBottom: 16, border: "1px solid #E1D7B8", borderRadius: 8, fontSize: 16, background: "#FFFFFF", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: INK, transition: "border-color .15s" };
export const botonPrincipal = { width: "100%", padding: "12px", background: NAVY, color: CREAM, border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600, letterSpacing: 0.3, fontFamily: "'Inter', sans-serif", boxShadow: "0 2px 8px rgba(20,33,61,0.18)", transition: "transform .12s, box-shadow .12s" };
export const botonSecundario = { padding: "10px 18px", background: "transparent", color: NAVY, border: `1.5px solid ${NAVY}`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, fontFamily: "'Inter', sans-serif", transition: "background .12s" };
export const tarjeta = { background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(20,33,61,0.05)" };

// Spinner giratorio genérico — trae su propio @keyframes así funciona sin
// depender del <style> global (que solo se monta después del login), por
// eso sirve también para la pantalla de carga inicial.
export function Spinner({ size = 22, color = GOLD, pista = "rgba(255,255,255,0.25)" }) {
  return (
    <>
      <span style={{
        display: "inline-block", width: size, height: size, borderRadius: "50%",
        border: `${Math.max(2, size / 9)}px solid ${pista}`, borderTopColor: color,
        animation: "howria-spin 0.7s linear infinite",
      }} />
      <style>{"@keyframes howria-spin { to { transform: rotate(360deg); } }"}</style>
    </>
  );
}

// ---------- Confirmación en dos pasos (genérico) ----------
// Cualquier acción de bajo riesgo y reversible a mano (borrar, cancelar,
// revertir un estado) usa este mismo patrón: un clic muestra confirmar/
// cancelar inline, sin modal. `BotonEliminar` es el caso particular para
// borrar (rojo, label "Eliminar").
export function BotonConfirmable({ onConfirm, label, confirmLabel = "Confirmar", cancelLabel = "Cancelar", colorConfirmar = RUST, style, disabled = false, title }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => { onConfirm(); setConfirmando(false); }}
          style={{ border: "none", background: colorConfirmar, color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          {confirmLabel}
        </button>
        <button onClick={() => setConfirmando(false)}
          style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          {cancelLabel}
        </button>
      </div>
    );
  }
  return <button onClick={() => setConfirmando(true)} disabled={disabled} title={title} style={{ ...style, opacity: disabled ? 0.5 : 1 }}>{label}</button>;
}

export function BotonEliminar({ onConfirm, label = "Eliminar", style, disabled = false, title }) {
  return <BotonConfirmable onConfirm={onConfirm} label={label} colorConfirmar={RUST} style={style} disabled={disabled} title={title} />;
}

// Modal real (overlay + tarjeta centrada) para las acciones irreversibles
// más delicadas — eliminar un usuario o un cliente. El resto de los
// borrados (boletas, tareas, objetivos) se quedan con BotonEliminar, el
// confirmar/cancelar inline, porque son de bajo riesgo y reversibles a
// mano; esto es solo para lo que de verdad conviene que cueste un poco
// más tocar por error, sobre todo en el celular.
export function ModalConfirmacion({ titulo, mensaje, textoConfirmar = "Eliminar", onConfirmar, onCancelar }) {
  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCancelar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCancelar]);
  return (
    <div onClick={onCancelar} style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-confirmacion-titulo"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 380, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <h3 id="modal-confirmacion-titulo" style={{ margin: "0 0 10px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>{titulo}</h3>
        <p style={{ margin: "0 0 22px", fontSize: 13.5, color: "#6B6248", lineHeight: 1.55 }}>{mensaje}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancelar} style={{ ...botonSecundario, flex: "none" }}>Cancelar</button>
          <button onClick={onConfirmar} autoFocus
            style={{ border: "none", background: RUST, color: "#fff", borderRadius: 999, padding: "10px 20px", fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
            {textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}


// Cambiar la propia contraseña, disponible para cualquier rol logueado
// (paseador, entrenador, coordinador, administrador) — antes la única
// forma de cambiarla era que un administrador la reseteara desde
// Usuarios. supabase.auth.updateUser() actúa siempre sobre la sesión ya
// autenticada, así que no hace falta la contraseña actual ni tocar la
// service role key.
export function ModalCambiarPassword({ onCerrar }) {
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function alEscape(e) { if (e.key === "Escape") onCerrar(); }
    window.addEventListener("keydown", alEscape);
    return () => window.removeEventListener("keydown", alEscape);
  }, [onCerrar]);

  const muyCorta = nueva.length > 0 && nueva.length < 6;
  const noCoincide = confirmar.length > 0 && nueva !== confirmar;
  const valido = nueva.length >= 6 && nueva === confirmar;

  async function guardar() {
    if (!valido || guardando) return;
    setGuardando(true);
    setError("");
    const { error: err } = await supabase.auth.updateUser({ password: nueva });
    setGuardando(false);
    if (err) {
      setError(err.message || "No se pudo cambiar la contraseña.");
      return;
    }
    showToast("Contraseña actualizada.", "exito");
    onCerrar();
  }

  return (
    <div onClick={onCerrar} style={{ position: "fixed", inset: 0, background: "rgba(18,42,64,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-password-titulo"
        style={{ background: "#FFFFFF", borderRadius: 14, padding: 26, maxWidth: 380, width: "100%", boxShadow: "0 20px 50px rgba(0,0,0,0.35)" }}>
        <h3 id="modal-password-titulo" style={{ margin: "0 0 10px", fontFamily: "'Fraunces', Georgia, serif", fontSize: 18, color: NAVY }}>Cambiar tu contraseña</h3>
        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#6B6248", lineHeight: 1.5 }}>Elige una contraseña nueva para tu cuenta — la vas a usar la próxima vez que inicies sesión.</p>

        <label style={label} htmlFor="password-nueva">Contraseña nueva</label>
        <input id="password-nueva" type="password" value={nueva} onChange={(e) => setNueva(e.target.value)}
          style={{ ...input, marginBottom: 12 }} autoFocus />

        <label style={label} htmlFor="password-confirmar">Confirmar contraseña</label>
        <input id="password-confirmar" type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && guardar()} style={{ ...input, marginBottom: 6 }} />

        {muyCorta && <p style={{ margin: "0 0 10px", fontSize: 12, color: RUST }}>Mínimo 6 caracteres.</p>}
        {noCoincide && <p style={{ margin: "0 0 10px", fontSize: 12, color: RUST }}>Las contraseñas no coinciden.</p>}
        {error && <p style={{ margin: "0 0 10px", fontSize: 12, color: RUST }}>{error}</p>}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={onCerrar} style={{ ...botonSecundario, flex: "none" }}>Cancelar</button>
          <button onClick={guardar} disabled={!valido || guardando}
            style={{ border: "none", background: NAVY, color: "#fff", borderRadius: 999, padding: "10px 20px", fontSize: 13.5, fontWeight: 600,
              cursor: valido && !guardando ? "pointer" : "default", opacity: valido && !guardando ? 1 : 0.5 }}>
            {guardando ? "Guardando..." : "Guardar contraseña"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Notificaciones de error (toast) ----------
let toastListeners = [];
export function showToast(mensaje, tipo = "error") {
  const t = { id: Date.now() + Math.random(), mensaje, tipo };
  toastListeners.forEach((fn) => fn(t));
}
export function ToastHost() {
  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    const listener = (t) => {
      setToasts((prev) => [...prev, t]);
      setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), 5000);
    };
    toastListeners.push(listener);
    return () => { toastListeners = toastListeners.filter((l) => l !== listener); };
  }, []);
  if (!toasts.length) return null;
  return (
    // zIndex por encima de RutaGuiada (10020, ver estadoGlobalUI más abajo)
    // — un error de guardado tiene que seguir siendo visible aunque la
    // ruta guiada esté abierta a pantalla completa.
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 10030, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: t.tipo === "error" ? RUST : NAVY, color: "#fff", padding: "12px 18px", borderRadius: 8, fontSize: 13.5, boxShadow: "0 4px 14px rgba(0,0,0,0.25)", maxWidth: 320 }}>
          {t.mensaje}
        </div>
      ))}
    </div>
  );
}

// ---------- Aviso de nueva versión disponible ----------
// public/version.json lo regenera scripts/generar-version.mjs en cada
// build (nunca a mano) — un valor distinto por deploy. Se guarda el que
// tenía la pestaña al cargar y se compara contra el actual cada tanto; si
// cambiaron, alguien desplegó una versión nueva mientras esta pestaña
// seguía abierta. Pensado sobre todo para el PWA instalado, que la gente
// no recarga solo como una pestaña de navegador común.
export function AvisoNuevaVersion() {
  const [hayNueva, setHayNueva] = useState(false);
  const versionInicialRef = useRef(null);

  useEffect(() => {
    let activo = true;
    async function chequear() {
      try {
        const resp = await fetch("/version.json", { cache: "no-store" });
        if (!resp.ok || !activo) return;
        const { version } = await resp.json();
        if (!activo) return;
        if (versionInicialRef.current === null) versionInicialRef.current = version;
        else if (version !== versionInicialRef.current) setHayNueva(true);
      } catch {
        // sin internet o falló el fetch — se reintenta en el próximo chequeo
      }
    }
    chequear();
    const intervalo = setInterval(chequear, 5 * 60 * 1000);
    function alVolverAlFrente() { if (document.visibilityState === "visible") chequear(); }
    document.addEventListener("visibilitychange", alVolverAlFrente);
    return () => { activo = false; clearInterval(intervalo); document.removeEventListener("visibilitychange", alVolverAlFrente); };
  }, []);

  if (!hayNueva) return null;
  return (
    <div style={{ position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)", zIndex: 10000, background: NAVY, color: CREAM, padding: "12px 16px", borderRadius: 10, boxShadow: "0 4px 14px rgba(0,0,0,0.3)", display: "flex", alignItems: "center", gap: 12, maxWidth: "90vw" }}>
      <span style={{ fontSize: 13.5 }}>Hay una nueva versión de Howria — actualiza para verla.</span>
      <button onClick={() => window.location.reload()}
        style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: GOLD, color: NAVY, fontWeight: 700, fontSize: 13, cursor: "pointer", flex: "none" }}>
        Actualizar
      </button>
    </div>
  );
}

// ---------- Deslizar hacia abajo para recargar ----------
// El navegador ya trae este gesto nativo en una pestaña común, pero
// desaparece en el PWA instalado (sin "chrome" del navegador que lo
// dispare) — se reimplementa a mano, solo para recuperarlo ahí. Únicamente
// arranca si el gesto empieza con la página ya en el tope del scroll (no
// interrumpe un scroll normal) y no toca elementos con `touch-action: none`
// propio (p. ej. las tarjetas arrastrables del armador de manada en Mapa),
// para no pisarles su propio gesto táctil.
const UMBRAL_PULL_REFRESH = 70;
const MAX_PULL_REFRESH = 120;

// Objeto mutable simple (no estado de React) para que la ruta guiada de
// Mis Paseos (src/RutaGuiada.jsx, montada aparte y lazy) pueda avisarle a
// este gesto que no se arme mientras está abierta a pantalla completa —
// un swipe accidental ahí recargaría la página y tiraría el progreso de
// la ruta. Se lee una sola vez por gesto (en alIniciar), no hace falta
// que dispare renders.
export const estadoGlobalUI = { rutaGuiadaAbierta: false };

function tieneTouchActionPropio(el) {
  let cur = el;
  while (cur && cur !== document.body) {
    if (cur.style && getComputedStyle(cur).touchAction === "none") return true;
    cur = cur.parentElement;
  }
  return false;
}

export function PullToRefresh() {
  const [distancia, setDistancia] = useState(0);
  const [arrastrando, setArrastrando] = useState(false);
  const estadoRef = useRef({ activo: false, inicioY: 0, inicioX: 0 });

  useEffect(() => {
    function alIniciar(e) {
      if (estadoGlobalUI.rutaGuiadaAbierta || window.scrollY > 0 || e.touches.length !== 1 || tieneTouchActionPropio(e.target)) return;
      estadoRef.current = { activo: true, inicioY: e.touches[0].clientY, inicioX: e.touches[0].clientX };
      setArrastrando(true);
    }
    function alMover(e) {
      if (!estadoRef.current.activo) return;
      const dy = e.touches[0].clientY - estadoRef.current.inicioY;
      const dx = e.touches[0].clientX - estadoRef.current.inicioX;
      if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || window.scrollY > 0) {
        estadoRef.current.activo = false;
        setArrastrando(false);
        setDistancia(0);
        return;
      }
      e.preventDefault();
      setDistancia(Math.min(dy, MAX_PULL_REFRESH));
    }
    function alSoltar() {
      if (!estadoRef.current.activo) { setArrastrando(false); return; }
      estadoRef.current.activo = false;
      setArrastrando(false);
      setDistancia((actual) => {
        if (actual >= UMBRAL_PULL_REFRESH) window.location.reload();
        return 0;
      });
    }
    document.addEventListener("touchstart", alIniciar, { passive: true });
    document.addEventListener("touchmove", alMover, { passive: false });
    document.addEventListener("touchend", alSoltar);
    document.addEventListener("touchcancel", alSoltar);
    return () => {
      document.removeEventListener("touchstart", alIniciar);
      document.removeEventListener("touchmove", alMover);
      document.removeEventListener("touchend", alSoltar);
      document.removeEventListener("touchcancel", alSoltar);
    };
  }, []);

  if (distancia <= 0) return null;
  const listo = distancia >= UMBRAL_PULL_REFRESH;
  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 10001, pointerEvents: "none",
      display: "flex", justifyContent: "center", alignItems: "flex-end",
      height: distancia, transition: arrastrando ? "none" : "height .2s",
    }}>
      <div style={{
        marginBottom: 8, padding: "6px 14px", borderRadius: 20, background: NAVY, color: CREAM,
        fontSize: 12.5, fontWeight: 600, opacity: Math.min(distancia / 40, 1),
      }}>
        {listo ? "Soltá para recargar ↻" : "Deslizá para recargar"}
      </div>
    </div>
  );
}

// Qué secciones van fijas en la barra inferior (además de Inicio, que
// siempre va primero) — las que no entran quedan agrupadas bajo "Más".
const PRIORIDAD_BARRA_NAV = ["boletas", "facturas", "clientes", "agenda", "mail", "mis-paseos", "coordinacion", "seguimiento", "finanzas", "pagos", "equipo", "mapa", "usuarios"];

function ItemBarraNav({ activo, Icono, label, onClick }) {
  if (activo) {
    return (
      <button onClick={onClick}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 10px", borderRadius: 999, background: NAVY, border: "none", cursor: "pointer", flex: "1 1 0", minWidth: 0 }}>
        <Icono size={17} color={CREAM} style={{ flex: "none" }} />
        <span style={{ fontSize: 12, color: CREAM, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
      </button>
    );
  }
  return (
    <button onClick={onClick}
      style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, padding: "7px 4px", border: "none", background: "none", cursor: "pointer", flex: "1 1 0", minWidth: 0 }}>
      <Icono size={18} color="#8A7E5C" />
      <span style={{ fontSize: 9.5, color: "#8A7E5C", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{label}</span>
    </button>
  );
}

// Barra de navegación flotante en mobile, tipo apps nativas: Inicio + las
// secciones más usadas (PRIORIDAD_BARRA_NAV), y "Más" agrupa el resto por
// categoría en un panel arriba de la barra.
function BarraNavegacionMobile({ tabs, tab, setTab }) {
  const [masAbierto, setMasAbierto] = useState(false);
  if (!tabs) return null;

  const tieneInicio = tabs.some((t) => t.id === "inicio");
  const otras = tabs.filter((t) => t.id !== "inicio");
  const destacadas = PRIORIDAD_BARRA_NAV.map((id) => otras.find((t) => t.id === id)).filter(Boolean).slice(0, 3);
  const resto = otras.filter((t) => !destacadas.includes(t));

  function ir(tabId) {
    setTab(tabId);
    setMasAbierto(false);
  }

  return (
    <div className="howria-bottom-nav" style={{ display: "none", position: "fixed", left: 12, right: 12, bottom: "calc(12px + env(safe-area-inset-bottom))", zIndex: 70, justifyContent: "center" }}>
      {masAbierto && (
        <>
          <div onClick={() => setMasAbierto(false)} style={{ position: "fixed", inset: 0, zIndex: 69 }} />
          <div style={{ position: "absolute", bottom: 66, left: 0, right: 0, maxHeight: "60vh", overflowY: "auto", background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(20,33,61,0.06)", borderRadius: 14, boxShadow: "0 12px 30px rgba(0,0,0,0.25)", padding: 12, zIndex: 70 }}>
            {ORDEN_GRUPOS.map((grupo) => {
              const tabsDelGrupo = resto.filter((t) => t.grupo === grupo);
              if (tabsDelGrupo.length === 0) return null;
              return (
                <div key={grupo} style={{ marginBottom: 6 }}>
                  <p style={{ margin: "4px 0 2px 8px", fontSize: 10.5, color: "#B0A587", textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 700 }}>{grupo}</p>
                  {tabsDelGrupo.map((t) => {
                    const Icono = ICONOS_TAB[t.id] || Home;
                    const activo = tab === t.id;
                    return (
                      <button key={t.id} onClick={() => ir(t.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 8px", border: "none", background: activo ? CREAM_SOFT : "none", borderRadius: 8, cursor: "pointer", font: "inherit" }}>
                        <Icono size={17} color={NAVY} />
                        <span style={{ fontSize: 13.5, color: INK, fontWeight: activo ? 700 : 400 }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(20,33,61,0.06)", borderRadius: 999, boxShadow: "0 8px 24px rgba(20,33,61,0.18)", padding: 6, position: "relative", zIndex: 70, maxWidth: 380, width: "100%" }}>
        {tieneInicio && <ItemBarraNav activo={tab === "inicio"} Icono={Home} label="Inicio" onClick={() => ir("inicio")} />}
        {destacadas.map((t) => {
          const Icono = ICONOS_TAB[t.id] || Home;
          return <ItemBarraNav key={t.id} activo={tab === t.id} Icono={Icono} label={t.label} onClick={() => ir(t.id)} />;
        })}
        {resto.length > 0 && (
          <ItemBarraNav activo={masAbierto} Icono={LayoutGrid} label="Más" onClick={() => setMasAbierto((v) => !v)} />
        )}
      </div>
    </div>
  );
}

const USUARIOS_INICIAL = [
  { id: 1, nombre: "Camila Soto", rol: "coordinador", fotoUrl: null },
  { id: 2, nombre: "Pedro Vidal", rol: "entrenador", fotoUrl: null },
  { id: 3, nombre: "Ignacio Muñoz", rol: "entrenador", fotoUrl: null },
];

// ---------- App ----------
export default function HowriaAdmin() {
  const [user, setUser] = useState(null);
  const [verificandoSesion, setVerificandoSesion] = useState(true);
  const [clienteSesion, setClienteSesion] = useState(null);
  const [clientesParaElegir, setClientesParaElegir] = useState(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  // Permite entrar directo a una pestaña desde un link (ej. una
  // notificación push manda a /admin?tab=agenda) — se lee al montar. La
  // URL se mantiene sincronizada con la pestaña actual en todo momento
  // (no se limpia después) para que un refresh (pull-to-refresh, o que
  // iOS descargue la pestaña en segundo plano y la recargue) vuelva a
  // la misma pestaña en vez de rebotar siempre a Inicio.
  const [tab, setTab] = useState(() => {
    try {
      return new URLSearchParams(window.location.search).get("tab") || "inicio";
    } catch {
      return "inicio";
    }
  });
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (tab === "inicio") url.searchParams.delete("tab");
      else url.searchParams.set("tab", tab);
      window.history.replaceState(null, "", url.pathname + url.search);
    } catch {}
    // Safari/iOS a veces queda con el zoom trabado (todo se ve chico,
    // como aplastado, sin importar el scroll/foco) cuando un toque
    // reemplaza de golpe el contenido debajo del botón tocado — ej.
    // entrar a un cliente desde un acceso directo de Inicio. Javier lo
    // confirmó reproducible siempre (no es al azar) y que el blur/scroll
    // solo no alcanzaba. Forzar `maximum-scale` un instante obliga a
    // Safari a recalcular el zoom real de la página a 100% — truco
    // conocido para "despegar" un WebView que quedó en una escala
    // vieja tras un cambio de contenido muy abrupto — y se revierte
    // enseguida para no bloquear que el usuario pueda hacer zoom normal.
    document.activeElement?.blur?.();
    window.scrollTo(0, 0);
    forzarRecalculoZoomIOS();
  }, [tab]);
  const [mapaPaseadorSel, setMapaPaseadorSel] = useState("");
  // Se levanta al padre (mismo motivo que mapaPaseadorSel arriba) — Mapa
  // de rutas se desmonta al salir de la pestaña, y sin esto la ruta ya
  // armada (clientes incluidos, orden calculado) se perdía por completo
  // cada vez que un coordinador se distraía y volvía.
  const [mapaIncluidos, setMapaIncluidos] = useState({});
  const [mapaRuta, setMapaRuta] = useState(null);
  const [mapaVelocidad, setMapaVelocidad] = useState(20);
  const [mapaDuracionParada, setMapaDuracionParada] = useState(25);
  const [clientes, setClientes, cargandoClientes] = useSyncedTable("clientes", clienteToDb, dbToCliente, "nombre", sessionVersion);
  const [boletasEmitidas, setBoletasEmitidas, cargandoBoletas] = useSyncedTable("boletas", boletaToDb, dbToBoleta, "numero", sessionVersion);
  const [usuarios, setUsuarios, cargandoUsuarios] = useSyncedTable("usuarios", usuarioToDb, dbToUsuario, "nombre", sessionVersion, "usuarios_seguro");
  const [loginsPendientes, setLoginsPendientes] = useSyncedTable("logins_pendientes_borrar", loginPendienteToDb, dbToLoginPendiente, "eliminado_en", sessionVersion);
  const [pagosRegistrados, setPagosRegistrados, cargandoPagos] = useSyncedTable("pagos_trabajadores", pagoToDb, dbToPago, "fecha_pago", sessionVersion);
  const [boletasAdiestramiento, setBoletasAdiestramiento, cargandoBoletasAdiestramiento] = useSyncedTable("boletas_adiestramiento", boletaAdiestramientoToDb, dbToBoletaAdiestramiento, "numero", sessionVersion);
  const [mascotas, setMascotas, cargandoMascotas] = useSyncedTable("mascotas", mascotaToDb, dbToMascota, "nombre", sessionVersion);
  const [mascotaIncompatibilidades, setMascotaIncompatibilidades] = useSyncedTable("mascota_incompatibilidades", incompatibilidadToDb, dbToIncompatibilidad, "creado_en", sessionVersion);
  const [registroPaseos, setRegistroPaseos] = useRegistroPaseosSincronizado(clientes);
  const [faseDiaPaseador, actualizarFaseDia, ausenciasPaseador, justificarAusencia, deshacerAusencia] = useFaseDiaPaseador(sessionVersion);
  const [permisosRoles, actualizarPermisoRol] = usePermisosRoles(sessionVersion);
  const [notificacionesRoles, actualizarNotificacionRol] = useNotificacionesRoles(sessionVersion);
  const [configuracion, actualizarConfiguracion] = useConfiguracion(sessionVersion);

  useEffect(() => {
    if (!user || !permisosRoles) return;
    const permitidos = permisosRoles[user.rol] || [];
    if (!permitidos.includes(tab)) {
      setTab(permitidos[0] || "inicio");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permisosRoles, user, tab]);

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") setSessionVersion((v) => v + 1);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setSessionVersion((v) => v + 1);
      } else {
        setVerificandoSesion(false);
      }
    });
  }, []);

  useEffect(() => {
    if (!verificandoSesion || usuarios.length === 0 || clientes.length === 0 || user || clienteSesion) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const emailSesion = data.session.user.email;
        const perfil = usuarios.find((u) => u.email === emailSesion);
        if (perfil) {
          setUser(perfil);
        } else {
          const fichas = clientes.filter((c) => c.email && c.email === emailSesion);
          if (fichas.length === 1) {
            setClienteSesion(fichas[0]);
          } else if (fichas.length > 1) {
            setClientesParaElegir(fichas);
          } else {
            showToast("Tu correo no está asociado a ninguna cuenta. Contáctanos si crees que es un error.");
            supabase.auth.signOut();
          }
        }
      }
      setVerificandoSesion(false);
    });
  }, [usuarios, clientes, verificandoSesion, user, clienteSesion]);

  function cerrarSesion() {
    supabase.auth.signOut();
    setUser(null);
  }

  const [mostrarCambiarPassword, setMostrarCambiarPassword] = useState(false);

  const [objetivosSemanales, setObjetivosSemanales, cargandoObjetivosSemanales] = useSyncedTable("objetivos_semanales", objetivoSemanalToDb, dbToObjetivoSemanal, "created_at", sessionVersion);
  const [objetivosMensuales, setObjetivosMensuales, cargandoObjetivosMensuales] = useSyncedTable("objetivos_mensuales", objetivoMensualToDb, dbToObjetivoMensual, "created_at", sessionVersion);
  const [tareasEquipo, setTareasEquipo, cargandoTareasEquipo] = useSyncedTable("tareas_equipo", tareaToDb, dbToTarea, "created_at", sessionVersion);
  const [citasAgenda, setCitasAgenda, cargandoCitasAgenda] = useSyncedTable("citas_agenda", citaToDb, dbToCita, "created_at", sessionVersion, "citas_agenda", true);
  const [disponibilidadFecha, toggleBloqueDisponibilidad, , aplicarPatronSemanal] = useDisponibilidadFecha(sessionVersion);
  const [planesClases, setPlanesClases, cargandoPlanesClases] = useSyncedTable("planes_clases", planClaseToDb, dbToPlanClase, "creado_en", sessionVersion);
  const [clasesRealizadas, marcarClase, cargandoClasesRealizadas, deshacerClase] = useClasesRealizadas(sessionVersion);
  const [tarifas, actualizarTarifas] = useTarifas(sessionVersion);
  const [prospectos, setProspectos, cargandoProspectos] = useSyncedTable("prospectos", prospectoToDb, dbToProspecto, "created_at", sessionVersion);
  const [correos, setCorreos, cargandoCorreos] = useCorreos(sessionVersion);
  const [solicitudesRegistro, setSolicitudesRegistro] = useSolicitudesRegistro(sessionVersion);
  const [saltarClienteDbId, setSaltarClienteDbId] = useState(null);
  const [saltarAlumnoDbId, setSaltarAlumnoDbId] = useState(null);
  const [enfoqueEmailProspecto, setEnfoqueEmailProspecto] = useState(null);
  const correosNoLeidos = correos.filter((c) => c.direccion === "entrante" && !c.leido).length;
  const cargandoEquipo = cargandoObjetivosSemanales || cargandoObjetivosMensuales || cargandoTareasEquipo;

  if (clientesParaElegir) {
    return (
      <SeleccionarPerrito
        opciones={clientesParaElegir}
        onElegir={(c) => { setClienteSesion(c); setClientesParaElegir(null); }}
        onSalir={() => { supabase.auth.signOut(); setClientesParaElegir(null); }}
      />
    );
  }

  if (clienteSesion) {
    return (
      <PortalCliente
        cliente={clienteSesion}
        boletasCliente={boletasEmitidas.filter((b) => esBoletaDeCliente(b, clienteSesion))}
        onSalir={() => { supabase.auth.signOut(); setClienteSesion(null); }}
      />
    );
  }

  if (verificandoSesion) {
    return (
      <div style={{ minHeight: "100vh", background: NAVY, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, color: "#9BAAB8", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 14 }}>
        <Spinner size={28} />
        Cargando...
      </div>
    );
  }
  if (!user) return <Login usuarios={usuarios} onLogin={(u) => { setUser(u); if (u.rol === "entrenador" || u.rol === "paseador") setTab("mis-paseos"); }} />;

  const esAdmin = user.rol === "administrador";
  // "esPaseador" agrupa a quienes trabajan en terreno (paseos y/o
  // adiestramiento) — se usa para simplificar su vista (menos avisos,
  // arranca en Mis paseos), no para permisos: qué pestañas ve cada rol se
  // define aparte en permisos_roles.
  const esPaseador = user.rol === "entrenador" || user.rol === "paseador";
  // Administrador siempre debe poder llegar a "Usuarios" — es la única
  // pantalla desde donde se arregla permisos_roles, así que si esa fila
  // llegara a quedar sin "usuarios" (edición manual, migración a medias),
  // esto evita que quede sin forma de recuperarse desde la propia app. El
  // checkbox de "Permisos por rol" ya sugería esta garantía visualmente,
  // pero antes no era real — dependía solo de lo que hubiera en la base.
  const tabsPermitidosRol = esAdmin
    ? Array.from(new Set([...(permisosRoles?.[user.rol] || []), "usuarios"]))
    : (permisosRoles?.[user.rol] || []);
  const tabs = TODOS_LOS_TABS.filter((t) => tabsPermitidosRol.includes(t.id));

  return (
    <div style={{ minHeight: "100vh", background: PANEL_BG, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <style>{`
        * { -webkit-tap-highlight-color: transparent; -webkit-overflow-scrolling: touch; }
        .howria-card { transition: box-shadow .18s ease, transform .18s ease; }
        .howria-card:hover { box-shadow: 0 6px 18px rgba(20,33,61,0.09); }
        button { font-family: 'Inter', sans-serif; }
        button:not(:disabled) { transition: filter .12s ease, transform .05s ease; }
        button:not(:disabled):hover { filter: brightness(0.93); }
        button:not(:disabled):active { transform: scale(0.98); }
        input:focus-visible, select:focus-visible, textarea:focus-visible {
          outline: none; border-color: ${NAVY} !important; box-shadow: 0 0 0 3px rgba(18,42,64,0.15);
        }
        h1, h2, h3 { font-family: 'Fraunces', Georgia, serif; }
        @media (prefers-reduced-motion: reduce) {
          .howria-card, button:not(:disabled) { transition: none !important; }
        }
        .howria-shell { display: flex; }
        .howria-sidebar { display: none; }
        .howria-header { display: flex; }
        .howria-facturas-tabla { display: block; }
        .howria-facturas-tarjetas { display: none; }
        .howria-pagos-tabla { display: block; }
        .howria-pagos-tarjetas { display: none; }
        .howria-mispaseos-tabla { display: block; }
        .howria-mispaseos-tarjetas { display: none; }
        .howria-agenda-link-boton { display: none; }
        .howria-cal-celda { min-height: 92px; }
        .howria-cal-punto { display: none; }
        @media (min-width: 681px) {
          .howria-sidebar { display: flex; }
          .howria-header { display: none; }
          .howria-shell-contenido { margin-left: 232px; }
        }
        @media (max-width: 680px) {
          .howria-g2, .howria-g3, .howria-g4, .howria-split, .howria-photo-row {
            grid-template-columns: 1fr !important;
          }
          .howria-week {
            grid-template-columns: 1fr !important;
          }
          .howria-mispaseos-tabla { display: none !important; }
          .howria-mispaseos-tarjetas { display: flex !important; flex-direction: column; gap: 8px; }
          .howria-photo-row > div:first-child {
            display: flex !important; align-items: center; gap: 14px;
          }
          .howria-card { padding: 16px !important; }
          .howria-header { padding: 12px 16px !important; }
          .howria-header h1, .howria-header-logo { height: 30px !important; }
          .howria-main { padding: 16px 16px 100px !important; }
          table { font-size: 12.5px !important; }
          .howria-horario-fila { flex-wrap: wrap; row-gap: 8px; }
          .howria-horario-fila > label { width: 100% !important; }
          .howria-horario-fila input[type="time"] { width: 0 !important; flex: 1 1 90px; min-width: 90px; }
          .howria-launcher-mobile { display: block !important; }
          .howria-bottom-nav { display: flex !important; }
          .howria-inicio-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .howria-finanzas-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .howria-stats-3 { grid-template-columns: repeat(2, 1fr) !important; }
          .howria-dia-selector-movil { display: flex !important; }
          .howria-dia-col-oculta-movil { display: none !important; }
          .howria-facturas-tabla { display: none !important; }
          .howria-facturas-tarjetas { display: flex !important; flex-direction: column; gap: 12px; }
          .howria-pagos-tabla { display: none !important; }
          .howria-pagos-tarjetas { display: flex !important; flex-direction: column; gap: 12px; }
          .howria-inicio-entrenador-encabezado { display: none !important; }
          .howria-agenda-link-tarjeta { display: none !important; }
          .howria-agenda-link-boton { display: flex !important; }
          .howria-agenda-link { order: 1; }
          .howria-agenda-pendientes { order: 2; }
          .howria-agenda-form { order: 3; }
          .howria-agenda-proximas { order: 4; }
          .howria-agenda-disponibilidad { order: 5; }
          .howria-agenda-precios { order: 6; }
          .howria-agenda-historial { order: 7; }
          .howria-cal-grid { gap: 4px !important; }
          .howria-cal-celda { min-height: 38px !important; padding: 3px !important; }
          .howria-cal-nombres { display: none !important; }
          .howria-cal-punto { display: block !important; }
        }
      `}</style>
      <div className="howria-header" style={{ background: NAVY, padding: "14px 32px", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)", position: "relative", zIndex: 30 }}>
        <LogoHowria height={56} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!esPaseador && <NotificacionesBell avisos={calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda, prospectos })} setTab={setTab} />}
          <BotonNotificacionesPush usuarioEmail={user.email} />
          <div style={{ fontSize: 13, textAlign: "right", color: CREAM }}>
            <div>{user.nombre}</div>
            <div style={{ fontSize: 11, color: "#9BAAB8", textTransform: "capitalize" }}>{user.rol}</div>
          </div>
          <button onClick={() => setMostrarCambiarPassword(true)} title="Cambiar contraseña"
            style={{ background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#C9CEDA", borderRadius: 6, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <KeyRound size={14} />
          </button>
          <button onClick={cerrarSesion} style={{ background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#C9CEDA", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      <div className="howria-shell">
        <aside className="howria-sidebar" style={{ width: 232, flex: "none", background: NAVY, flexDirection: "column", padding: "20px 12px", position: "fixed", top: 0, left: 0, height: "100vh", overflowY: "auto", zIndex: 25 }}>
          <div style={{ padding: "4px 10px 20px", flex: "none" }}>
            <LogoHowria height={38} />
          </div>
          <nav style={{ flex: "1 1 auto", minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2 }}>
            {tabs.some((t) => t.id === "inicio") && (
              <button onClick={() => setTab("inicio")}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "none", borderRadius: 8,
                  background: tab === "inicio" ? "rgba(201,150,47,0.16)" : "none", cursor: "pointer", textAlign: "left",
                  color: tab === "inicio" ? GOLD : "#C9CEDA", fontWeight: tab === "inicio" ? 700 : 500, fontSize: 13.5,
                }}>
                <Home size={16} /> Inicio
              </button>
            )}
            {ORDEN_GRUPOS.map((grupo) => {
              const tabsDelGrupo = tabs.filter((t) => t.grupo === grupo);
              if (tabsDelGrupo.length === 0) return null;
              return (
                <div key={grupo} style={{ marginTop: 14 }}>
                  <p style={{ margin: "0 0 4px 12px", fontSize: 10.5, color: "#7C8797", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>{grupo}</p>
                  {tabsDelGrupo.map((t) => {
                    const Icono = ICONOS_TAB[t.id] || Home;
                    const activo = tab === t.id;
                    return (
                      <button key={t.id} onClick={() => setTab(t.id)}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: 10,
                          padding: "10px 12px", border: "none", borderRadius: 8, background: activo ? "rgba(201,150,47,0.16)" : "none",
                          cursor: "pointer", textAlign: "left", color: activo ? GOLD : "#C9CEDA", fontWeight: activo ? 700 : 500, fontSize: 13.5,
                        }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}><Icono size={16} /> {t.label}</span>
                        {t.id === "mail" && correosNoLeidos > 0 && (
                          <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 20, background: RUST, color: "#FFFFFF" }}>{correosNoLeidos}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </nav>

          <div style={{ flex: "none", borderTop: "1px solid rgba(255,255,255,0.12)", marginTop: 12, paddingTop: 14, paddingBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px 10px" }}>
              {!esPaseador && <NotificacionesBell avisos={calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda, prospectos })} setTab={setTab} />}
              <BotonNotificacionesPush usuarioEmail={user.email} />
            </div>
            <div style={{ padding: "0 8px", fontSize: 13, color: CREAM }}>
              <div>{user.nombre}</div>
              <div style={{ fontSize: 11, color: "#9BAAB8", textTransform: "capitalize" }}>{user.rol}</div>
            </div>
            <button onClick={() => setMostrarCambiarPassword(true)} style={{ marginTop: 10, width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#C9CEDA", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              <KeyRound size={13} /> Cambiar contraseña
            </button>
            <button onClick={cerrarSesion} style={{ marginTop: 8, width: "100%", background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#C9CEDA", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>
              Cerrar sesión
            </button>
          </div>
        </aside>

        {mostrarCambiarPassword && <ModalCambiarPassword onCerrar={() => setMostrarCambiarPassword(false)} />}

        <div className="howria-shell-contenido" style={{ flex: "1 1 auto", minWidth: 0 }}>
          <div className="howria-main" style={{ padding: "28px 32px", maxWidth: 1040, margin: "0 auto" }}>
      <Suspense fallback={<div className="howria-card" style={tarjeta}><p style={{ ...hint, display: "flex", alignItems: "center", gap: 8, margin: 0 }}><Spinner size={15} color={GOLD} pista="#E4DBC3" /> Cargando…</p></div>}>
      <LimiteDeError key={tab} onVolver={() => setTab("inicio")}>
        {tab === "inicio" && tabsPermitidosRol.includes("inicio") && <Inicio clientes={clientes} boletasEmitidas={boletasEmitidas} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} tareasEquipo={tareasEquipo} objetivosSemanales={objetivosSemanales} usuarios={usuarios} citasAgenda={citasAgenda} prospectos={prospectos} mascotas={mascotas} setTab={setTab} user={user} tabs={tabs} faseDiaPaseador={faseDiaPaseador} ausenciasPaseador={ausenciasPaseador} onAbrirAlumno={(dbId) => { setSaltarAlumnoDbId(dbId); setTab("alumnos"); }} onAbrirCliente={(dbId) => { setSaltarClienteDbId(dbId); setTab("clientes"); }} />}
        {tab === "mis-paseos" && tabsPermitidosRol.includes("mis-paseos") && <MisPaseos clientes={clientes} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} user={user} usuarios={usuarios} faseDiaPaseador={faseDiaPaseador} actualizarFaseDia={actualizarFaseDia} mascotas={mascotas} ausenciasPaseador={ausenciasPaseador} justificarAusencia={justificarAusencia} deshacerAusencia={deshacerAusencia} />}
        {tab === "boletas" && tabsPermitidosRol.includes("boletas") && (
          <Boletas clientes={clientes} boletasEmitidas={boletasEmitidas} boletasAdiestramiento={boletasAdiestramiento}
            onRegistrarBoleta={(b) => setBoletasEmitidas((prev) => [...prev, b])}
            onRegistrarBoletaAdiestramiento={(b) => setBoletasAdiestramiento((prev) => [...prev, b])}
            recargoPct={configuracion?.recargo_fin_semana ?? RECARGO_FIN_SEMANA_FERIADO_DEFAULT}
            actualizarRecargoPct={(v) => actualizarConfiguracion("recargo_fin_semana", v)}
            rolActual={user.rol} />
        )}
        {tab === "facturas" && tabsPermitidosRol.includes("facturas") && <Facturas boletasEmitidas={boletasEmitidas} setBoletasEmitidas={setBoletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} setBoletasAdiestramiento={setBoletasAdiestramiento} clientes={clientes} setClientes={setClientes} usuarios={usuarios} cargandoBoletas={cargandoBoletas || cargandoBoletasAdiestramiento} nombreUsuario={user.nombre} />}
        {tab === "clientes" && tabsPermitidosRol.includes("clientes") && <Clientes clientes={clientes} setClientes={setClientes} boletasEmitidas={boletasEmitidas} setBoletasEmitidas={setBoletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} setBoletasAdiestramiento={setBoletasAdiestramiento} usuarios={usuarios} puedeEliminar={esAdmin} cargandoClientes={cargandoClientes} correos={correos} citasAgenda={citasAgenda} setCitas={setCitasAgenda} saltarClienteDbId={saltarClienteDbId} limpiarSaltoCliente={() => setSaltarClienteDbId(null)} nombreUsuario={user.nombre} mascotas={mascotas} setMascotas={setMascotas} mascotaIncompatibilidades={mascotaIncompatibilidades} setMascotaIncompatibilidades={setMascotaIncompatibilidades} />}
        {tab === "finanzas" && tabsPermitidosRol.includes("finanzas") && <Finanzas boletasEmitidas={boletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} clientes={clientes} pagosRegistrados={pagosRegistrados} registroPaseos={registroPaseos} user={user} onVerPagos={tabsPermitidosRol.includes("pagos") ? () => setTab("pagos") : undefined} />}
        {tab === "pagos" && tabsPermitidosRol.includes("pagos") && <PagoTrabajadores boletasEmitidas={boletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} setBoletasAdiestramiento={setBoletasAdiestramiento} clientes={clientes} usuarios={usuarios} registroPaseos={registroPaseos} pagosRegistrados={pagosRegistrados} setPagosRegistrados={setPagosRegistrados} cargandoPagos={cargandoPagos} nombreUsuario={user.nombre} />}
        {tab === "coordinacion" && tabsPermitidosRol.includes("coordinacion") && <Coordinacion clientes={clientes} setClientes={setClientes} usuarios={usuarios} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} setTab={setTab} setMapaPaseadorSel={setMapaPaseadorSel} faseDiaPaseador={faseDiaPaseador} ausenciasPaseador={ausenciasPaseador} />}
        {tab === "mapa" && tabsPermitidosRol.includes("mapa") && <MapaRutas clientes={clientes} setClientes={setClientes} usuarios={usuarios} paseadorId={mapaPaseadorSel} setPaseadorId={setMapaPaseadorSel} mascotas={mascotas} mascotaIncompatibilidades={mascotaIncompatibilidades} incluidos={mapaIncluidos} setIncluidos={setMapaIncluidos} ruta={mapaRuta} setRuta={setMapaRuta} velocidad={mapaVelocidad} setVelocidad={setMapaVelocidad} duracionParada={mapaDuracionParada} setDuracionParada={setMapaDuracionParada} />}
        {tab === "equipo" && tabsPermitidosRol.includes("equipo") && <EquipoTrabajo usuarios={usuarios} objetivos={objetivosSemanales} setObjetivos={setObjetivosSemanales} objetivosMensuales={objetivosMensuales} setObjetivosMensuales={setObjetivosMensuales} tareas={tareasEquipo} setTareas={setTareasEquipo} cargando={cargandoEquipo} />}
        {tab === "agenda" && tabsPermitidosRol.includes("agenda") && <Agenda clientes={clientes} usuarios={usuarios} citas={citasAgenda} setCitas={setCitasAgenda} cargando={cargandoCitasAgenda} disponibilidadFecha={disponibilidadFecha} toggleBloqueDisponibilidad={toggleBloqueDisponibilidad} aplicarPatronSemanal={aplicarPatronSemanal} tarifas={tarifas} actualizarTarifas={actualizarTarifas} rolActual={user.rol} nombreActual={user.nombre} />}
        {tab === "calendario" && tabsPermitidosRol.includes("calendario") && <CalendarioAlumnos citasAgenda={citasAgenda} setCitas={setCitasAgenda} clientes={clientes} setClientes={setClientes} registroPaseos={registroPaseos} rolActual={user.rol} nombreActual={user.nombre} />}
        {tab === "itinerario" && tabsPermitidosRol.includes("itinerario") && <Itinerario citasAgenda={citasAgenda} setCitas={setCitasAgenda} clientes={clientes} setClientes={setClientes} registroPaseos={registroPaseos} rolActual={user.rol} nombreActual={user.nombre} />}
        {tab === "alumnos" && tabsPermitidosRol.includes("alumnos") && <Alumnos clientes={clientes} setClientes={setClientes} boletasAdiestramiento={boletasAdiestramiento} usuarios={usuarios} citasAgenda={citasAgenda} setCitas={setCitasAgenda} registroPaseos={registroPaseos} planesClases={planesClases} setPlanesClases={setPlanesClases} cargandoPlanesClases={cargandoPlanesClases} clasesRealizadas={clasesRealizadas} marcarClase={marcarClase} deshacerClase={deshacerClase} cargandoClasesRealizadas={cargandoClasesRealizadas} rolActual={user.rol} nombreActual={user.nombre} esAdmin={esAdmin} saltarAlumnoDbId={saltarAlumnoDbId} limpiarSaltoAlumno={() => setSaltarAlumnoDbId(null)} />}
        {tab === "seguimiento" && tabsPermitidosRol.includes("seguimiento") && <Prospectos prospectos={prospectos} setProspectos={setProspectos} setClientes={setClientes} usuarios={usuarios} permisosRoles={permisosRoles} cargando={cargandoProspectos} correos={correos} enfoqueEmail={enfoqueEmailProspecto} limpiarEnfoque={() => setEnfoqueEmailProspecto(null)} rolActual={user.rol} />}
        {tab === "mail" && tabsPermitidosRol.includes("mail") && <Mail correos={correos} setCorreos={setCorreos} cargando={cargandoCorreos} clientes={clientes} prospectos={prospectos} onVerCliente={(id) => { setSaltarClienteDbId(id); setTab("clientes"); }} onVerProspecto={(email) => { setEnfoqueEmailProspecto(email); setTab("seguimiento"); }} />}
        {tab === "usuarios" && tabsPermitidosRol.includes("usuarios") && <PanelAdmin usuarios={usuarios} setUsuarios={setUsuarios} clientes={clientes} setClientes={setClientes} usuarioActual={user} permisosRoles={permisosRoles} actualizarPermisoRol={actualizarPermisoRol} notificacionesRoles={notificacionesRoles} actualizarNotificacionRol={actualizarNotificacionRol} esAdmin={esAdmin} cargandoUsuarios={cargandoUsuarios} loginsPendientes={loginsPendientes} setLoginsPendientes={setLoginsPendientes} solicitudesRegistro={solicitudesRegistro} setSolicitudesRegistro={setSolicitudesRegistro} setTareasEquipo={setTareasEquipo} setObjetivosSemanales={setObjetivosSemanales} setObjetivosMensuales={setObjetivosMensuales} setProspectos={setProspectos} setCitasAgenda={setCitasAgenda} />}
      </LimiteDeError>
      </Suspense>
          </div>
        </div>
      </div>
      <BarraNavegacionMobile tabs={tabs} tab={tab} setTab={setTab} />
    </div>
  );
}
