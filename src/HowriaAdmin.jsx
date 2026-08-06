import React, { useState, useRef, useMemo, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Search, ArrowUpDown, Bell, BellOff, Home, Footprints, MapPinned, Map, Calendar, Mail as MailIcon, Dog, Receipt,
  GraduationCap, FileText, TrendingUp, Banknote, Users, UserPlus, ShieldCheck, Target,
} from "lucide-react";
import { supabase, crearCuentaAcceso } from "./lib/supabaseClient.js";
import { soportaPush, suscripcionActiva, suscribirNotificaciones, desuscribirNotificaciones, esIOSFueraDeApp } from "./lib/pushNotificaciones.js";
import {
  diasDelMes, FERIADOS_CHILE, RECARGO_FIN_SEMANA_FERIADO_DEFAULT, esFinDeSemanaOFeriado,
  valorConRecargo, diasSegunPlan, calcularBoletaPaseos, calcularBoletaAdiestramiento, calcularTotales,
} from "./lib/calculosBoletas.js";
import { jsPDF } from "jspdf";

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
    direccion: c.direccion,
    lat: c.lat,
    lng: c.lng,
    tipo_servicio: c.tipoServicio || [],
    estado_cliente: c.estadoCliente,
    fecha_inicio: c.fechaInicio,
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
    direccion: row.direccion,
    lat: row.lat,
    lng: row.lng,
    tipoServicio: row.tipo_servicio || [],
    estadoCliente: row.estado_cliente,
    fechaInicio: row.fecha_inicio,
  };
}

function boletaToDb(b) {
  return {
    numero: b.numero,
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
  };
}

function dbToBoleta(row) {
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
  };
}

function slugEmailUsuario(nombre) {
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
  };
}

function loginPendienteToDb(l) {
  return { nombre: l.nombre, email: l.email, eliminado_en: l.eliminadoEn || new Date().toISOString() };
}
function dbToLoginPendiente(row) {
  return { nombre: row.nombre, email: row.email, eliminadoEn: row.eliminado_en };
}

function esBoletaDeCliente(b, c) {
  if (b.clienteId && c._dbId) return b.clienteId === c._dbId;
  return b.cliente === c.nombre;
}


function boletaAdiestramientoToDb(b) {
  return {
    numero: b.numero,
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
    mensaje_personalizado: b.mensajePersonalizado || null,
    estado: b.estado,
  };
}

function dbToBoletaAdiestramiento(row) {
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
    mensajePersonalizado: row.mensaje_personalizado,
    estado: row.estado,
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
    fecha_pago: p.fechaPagoISO || new Date().toISOString().slice(0, 10),
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
  };
}

function equipoToDb(p) {
  return { nombre: p.nombre };
}
function dbToEquipo(row) {
  return { nombre: row.nombre };
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
  };
}
function dbToCita(row) {
  return {
    clienteId: row.cliente_id,
    clienteNombre: row.cliente_nombre,
    perro: row.perro,
    tipo: row.tipo,
    adiestrador: row.adiestrador,
    fechaISO: row.fecha_hora,
    estado: row.estado,
    notas: row.notas,
    origen: row.origen || "staff",
    duracionMin: row.duracion_min || 60,
    confirmadaEn: row.confirmada_en,
    emailEnviado: row.email_enviado || false,
  };
}

function disponibilidadToDb(d) {
  return {
    adiestrador: d.adiestrador,
    dia_semana: d.diaSemana,
    hora_inicio: d.horaInicio,
    hora_fin: d.horaFin,
    activo: d.activo,
  };
}
function dbToDisponibilidad(row) {
  return {
    adiestrador: row.adiestrador,
    diaSemana: row.dia_semana,
    horaInicio: row.hora_inicio,
    horaFin: row.hora_fin,
    activo: row.activo,
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
function useSyncedTable(tableName, mapToDb, mapFromDb, orderBy, sessionVersion = 0, selectFrom = tableName) {
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
          if (estado) {
            supabase.from("registro_paseos").upsert(
              { cliente_id: cliente._dbId, fecha, estado, nota: r.nota || null, paseador_nombre: cliente.paseadorNombre || null },
              { onConflict: "cliente_id,fecha" }
            );
          }
        }
      });
      return next;
    });
  }

  return [registro, setRegistro];
}

const LOGO_B64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBAUEBAYFBQUGBgYHCQ4JCQgICRINDQoOFRIWFhUSFBQXGiEcFxgfGRQUHScdHyIjJSUlFhwpLCgkKyEkJST/2wBDAQYGBgkICREJCREkGBQYJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCT/wAARCAFAAUADASIAAhEBAxEB/8QAHQABAAIDAQEBAQAAAAAAAAAAAAcIAQUGBAMCCf/EAEoQAAEDAwIDBQUECAQDBQkAAAEAAgMEBREGBxIhMQgTQVFhFCJxgZEjMoKhFSRCUmJykrEzQ6LBF1NjFiVzsuE3RFR1g8PR0vD/xAAZAQEBAQEBAQAAAAAAAAAAAAAABAIDAQX/xAApEQADAAICAgICAQQDAQAAAAAAAQIDERIhBDEiQRNRIzIzYXFCgbGR/9oADAMBAAIRAxEAPwCBkRF9U+WEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEXc7U7V1+512liZMaK2UmDVVnBxcJPRjB0Lz18gOZ8Ad7vTsvBtpTW+5WuuqqygqpDTye0hvHFKBxDm0AEOAd4ciPVYeWVXDfZtY648voilERbMBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAERbGwacu+qbky22W31FfVvGRHC3OB+849Gj1JARvXbCWzXLotBaGue4OoobNbQGZHeT1DxllPEDze7+wHiSApFs/ZX1hXcDrjcLTbmn7zQ9872j4NAGfxLrNTXCxdnjREtj0zWx1Wqbk4d5Uv4XSs5c5XNGQ0NGQxp8TnnzXCs6fxjtnacTXd9I8+t9zaHZKlptCaDpaWWppBx1tVVN7zhkdzIcARxSHkT4NGAB5ffWGr3bndnOuvtdSxU9ZS1cbZGx54O8ZK1vE3PMAtk6c8cwq4TzyVM0k88r5ZZHF8kj3Zc5xOSST1JPPKsrTbeX24dnW0abtFK11fc6iGsnErwxsbHyGQucT4Boj8z6LneOY4t+9+zpF1e0vWis6Lut0tp67a6e2sqa+G4RV8TnCWKMsDJGkcTMEnP3gQfHyC4VVTSpbRNUuXphERengREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEReq12qvvdfFb7ZRz1tZMcRwQMLnu+Q8PXogPpYrJX6kvFJaLZAZ6yrkEUTB5nxJ8ABkk+ABVrXDTfZy28Dmxtq7hOQwke7JcanGeZ6tjb/pHqefy2W2hi22t818vz6f8ATU8R7x3EDHQw4y5od0zyy53TlgcskwDvFuE/cTWE9ZA9/wCi6QGmoGH/AJYPOTHm88/hwjwUbf5r4r+lFSX4p5P2yRbZYdbbr2t2rdZa3OmdOykmCJkndRuZnGWt4mtDeRALi4nGVDus6PT9v1FU02mLjVXO2xhobV1DQHTPx7xGAMtz0JHNfG+aou+o4aCnuVW6Wnt1OympYAA2OFjQAMNHLiOObupWqVEQ59//AA43aZgjII8xhTTP2hdZaot1u0vp63U9tuVR3VIKqmcXyPdyaO7BGI/MnngZxhQt06qz2wG1sOlbUdbaiY2GtmgdJTNmGBR0/DkyO8nObz9G+pKxncJbpb/RrCqb1JrO1fUsjtmlbfJKJatr55Xu8wGMYXfN2VXVdbulrqXcLWNXePebRt+woo3fsQNJ4c+rslx9T6LklrDDmEmZy1yptBERdTmEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAX0p6earnjp6eGSaaVwYyONpc57j0AA5kr5reaJ1fX6E1LSX+2shknp8gxyjLZGOGHNPiMjxHMI966PVrfZKmgezFdrsI67V1Q600pw4UUOHVLx5OPNsf5n0ClO56g242GtnsVNTQ09XI3iFHSjvKuo8nSOJyB6uIHkF0G3u5dh3GtoqbVN3dXG0GooZSO+gPqP2m+ThyPoeSiDdfs63e4Xqrv2k5RXCskdNPRVM+JWPJyeB7uTm+QJBHTmF83m7vjlei7ioneNbOD3H311HuBDJbmNZabO8+9SQOJdMPASP6uH8IAHoVG66DUO32rNKQe0XzT9woKfiDO/ljzHxHoOIEjJ+K59fQiZS1Poit038giItGSS9g9vo9c6xFRXwiS1WkNqahrh7sr8/Zxn0JBJ9GnzU1dpbVMli2//RsEhZPeZxTEjke5aOKT6+638RXq7OWnmWTbKjqywCe7SvrZHY5lueBg/pbn8Sj3tazvN10zT5PdtpqiQD+IvaP7AKDl+TOk/SLePDDv9kBIiK8iCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIpE2e2jl3Prqx89a+htlDwiaWNgdI97skMaDyHIEknOOXLmvKpSts9mXT0iO0Uu7ubBz6Ct4vdkqqi5WlmBUiZo72mz0ceHk5h6ZwMHryOVES8i1a3J7UOXphERaMn3oLhWWusiraCqnpKqI5jmgeWPYfQjmre7B6l1PqvRL7jqWcVJ9pdFSVDmBsk0bQA4uxyOHZAOOeCqiWu21N5uVJbaJhkqquZkETR4vcQB/dXbrqm37UbdcUbOOnstE2KGMDnPLya0epe8/mVH5bWlOu2VeNvbf0Qb2ndfG5XmHR1FJ+q24ias4TyfUEe60/yNP1d6KDVs9S016p7xPLqCmqKe5VZ9slbUN4Xu7wl3EQeYzzwD4LWKnFCiUkcMlOqbYREWzBb7RG4NoslBt5o7hL6q7WmN4c1w4YcR5ZkeJe4PA+C5HtZ2l0ls07eGty2GaakefLjaHt/NjlXy1Xeps92obrDI8z0M0c0RJJxwOBDR6csY9VcHdm1wa/2juE9ABNx0rLpRkc8lgEgA+LeIfNQ1CxZJr9lk3+SHJTFFgEEZHQ9FlXEYRF7bNZLlqG4xW20UNRXVk33IYG8Tj5n0A8SeQTegeJFv9W6C1LoaSnZqG1S0XtIJheXNex+OoDmkjIyMjqtAiaa2j1prphERDwIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAKwXZ1vktl251xWUkDairt59sjhP7ZEDsA+mWFc52YLLRXXcCpqauGOZ9voXTwB4yGyF7WcWPMAnHllTxpB+iLnq6/1un6qIXOf9TutvA7vjfG8jvDGRnJ94FzeRB581J5ORdxoqwY/VbIY0X2l7w+7tpdaR0NbZqv7KZ8VMGGBruXFgcns582nnjx8Dz+9u1A0RcW3qyRmXTNfh8MkZ420rnc+7Lv3T1YT1HLqOfA6moKe16ku1BSPD6alrZ4YnA5BY2RwH5AKTdqt7bppizy2K72Wp1FYYGYxGzjfSsJ+6cgtdH1w12MeBxyW3HD541/0YV8vjZECKwtHDsJuVVClp4JtO3KoPCwAmlDnnwHN0RPpyyuB3V2Uu22zhXRSuuVlkfwNqwzhfC49Gyt8CfBw5H0PJbnMm+L6ZisTS2u0b/swaSF31hU6gnjDqezxfZE/wDxEgIb9Gh5+YVn7nW0lst9RcK5zWUtHG6oke4fcawcRI9eXJRn2abdTUe18FTC5jpq2rnlnI6hzXcAafg1o+q8nac1SbNoSKzQycM95nETgOvcMw5/1PAPmVDl3kzcSzHrHi2Vo1dqWq1hqW436syJa6Z0vCT/AIbOjWfJoA+S1CIvppaWkQN77CIiHh7bJQw3S8UVBU1sdBDUzshdVSNLmwhxxxEDwBIVztqdMX3SGkhpzUUlJViimfFTSwPLmy0x5gEEAjBLhg+GFSPryPMK5GwetJdY7f04rJTJX2t/sM73HJeGgGNx9SwgH1aVJ5ifHf0VeK1yKra801Jo/WN3sb2kNpKlwiP70R96M/0kLQqaO0jBT37c+gt1jidXXY0bKeohp28bjLxOLGYH7QYefkMZX5sPZb1XXxNnvNxttmjxlzCTPIwevDho/qXWc0qE6ejlWJumpIcgglqZo4IInyzSuDGRsbxOe4nAAHiSVZrSh0z2c9KU8upnPk1JeB3k0FKwSTBg6RjmAGN8STguz1wMea1W/afYsOuc15ZqDUMTSIgx7JJWuxjDGMy2LPQuccgePgoF1lq24641HV325uHf1DsNjafdhjHJsbfQD6nJ8Vh/zdf8f/TS/i7+yye592sO6uyNzvlokdMygcKpneM4ZIJY3APY4eB4Hn0IIKqkeqsPoDSt2f2b73Da6OWsuGoJnGGCPGSzjZFnngAYY458lGmvtmtRbd2ahu12loZYqqTuXtpnlxp5MEhriQAcgHmOWQmBzG439nuZVWq19HBoiKknCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgJH7P2potNbl0IqZBHTXKN9A9zjgNc/BYT+NrR810/aN26q9PahdrS1iVtFcJB7S6IlrqapIwTkcw1+Ov72R4hQi1xa4Oa4tcDkEHBB8wrnbaako92ttGC8wx1Uj2OoLnC7o94Ay704gWuB8CeXRS528dLIv9MpxauXDKYrpNB6/ve3d5Nzs0seZGd3PTzAmKdmc4cAQeR6Ecx9V9dytC1O3mrKqyzOdLT8pqSdw/wAaF2eEn1GC0+oK5ZUdXP8AhnDuX/kmLW+qdE7qaLrrwy20tg1bbAyZ8LeENroi4NcGuAHGRxZwRxDHiCV3Owu4MOvLBV6E1RwVs8NOWx9+c+10vQscfFzOXPrjB6tyqyL32C+1+mbzR3i2TdzWUcgljd4ZHUEeIIyCPEErlWBOeK/6Ok5mq5MmSjqLr2cNxhQ1M1RU6Ruj+IOI4g6Ppxgf82PIDsfeb8Rjn+0Zqyk1RruFluroa2goaKKOKWB4fG5z8vcQR8Wj5KcLbdtIdoTRMlDUAR1LWh81MHD2igmAwJGZ6t8ndCDgqt24u1N/23rS2vh9otsj+GC4QtPdSeQd+4/+E/IlcsLTvddUjplTU/H+k41ERWEoREQBdztjutcNsmXltHTMqRcacNj438Ignbngl6cwA45HjyXC9Bk9FOWy2wlRfJabUerKZ8NsBElNQSDD6vxDnjq2P06u9B155alT8/R0xqnXxOy2G0XFpPTVbr/U7+CvuET6kz1HN8FLzc55z+1JzcfHHCPFR6y8X3tC67noam7S2jTlNHJVOiD8R01MwgcThkB0hyMl3IZPgMLoO0buvT1cT9EWOdskbXg3KeI+7lp5QAjkcEAu8OQHmoEgrKmmiqIYKiWKOpYI52McQJWAh3C4eIyAcHyXHFFVvI/b9f4OuS1OoXpEl7gnaGy2SS06OpKy7XZxDf0m+ok7qHB5uHRryemA3h55youRFRE8VrezhVbeyV9M9oHVdj0pQaUs1qt8lRAwUtLUljnynLjwgR54S7JwD4+SkXf11VbNlrLbb3VOqrvJUUrZpXkF0krWOdIfl0+i+PZ02kbb6aDWt7p81s7c22B4/wAGMj/GI/ecPu+TefU8o23+3AbrbWTqSilD7VaOKmgLT7ssmftJPgSA0ejfVSpTWXUL17KN1OPdP2RkiIrCUIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAKwnZJrJO/1PRZPdcFNOB4B2Xt/tj6Kvasl2TLW6O06iurgQJqiGlYfPgaXH83hcPJ/ts7eP/Wjd9pvSTLxoiO/RR/rdmlDnOA5mCQhrx8A7gd9VVJXM1Tq+0aiqtZbeyt7uqprM+fjc4cMvFEXOAHgWZYfn6KmTTxMa4+IBWPEb46ZryUuW0ZWOnNZWMZGD0VROdba9Hbg2SajvVrsGoaWUgS01VTUz8kEZBBaDyI8DyI8Fa/b2s1Bq3Rfda908ylqpMxSxVEbeGsjwMPdFz4CehafEZGPDW7Da0bq/b+jZJJmvtQFDUjPM8I+zf8AiZj5tK57fXdvVW3dzoaGzUVCymrKcytraiMyEvDiHMAyGjA4Tzz95fOyVWWuGu0XRM45576I+3x2Tt2h6Y6hsddFDb5ZQw26ok+0Y4n/ACSeb2jxB5tHiQoYWy1DqW8aruL7le7jPX1TuXHK7k0eTQOTR6ABa1XY5pTqntkltN7laC91jsdx1Jdae02mkkq62pdwxQsxl3LJOTyAABJJ6ALwr2Wa8V+n7pTXW11L6WtpXiSKVnVp/sQRkEHkQVt710ZWt9lmtq+zrQ6Yliu+qTT3O6MIdFSt96npneZz/iOHmRwjwB6rkt3+0PPcX1Vg0fNJTUrS6KpuXNssvgWx+LG9RxH3j4YHXeaJ7UlFXPp6HVdqfRzPc2M1tF78RJOMujPvN+RcpduOg9K3e5fpCv03aKutzjv5qVjnOPqcc/nlfNdOb5Zlv9FylVOsb0UMBBGQQR6LK6rdO5W+7bhXyotVNT09C2pMMLKdgYwtjAZxADlzLSfmuVX0Ze1sha09Bd3svoJuv9b09JVRl1sox7XW+TmNPJn4nYHwyuEVpuyzYI6HRNbenN+2uVY5gdj/AC4hwgf1F5XLPfCG0dMMcrSZ2m8OpX6Q22vFfSuEVQ6IUlOW8uB8h4AR5YBJHwVJAABgdArY9qMuG2sPDnhNzg4v6ZP91U9c/DXw2dPKfy0ERFUTBERAEREAREQBERAEREAREQBERAEREAREQBXQ2I0+dP7X2WKRnBNWtdXS55EGU5GfwcKp7YbTJf75b7RCCZK6pjphj+NwBP0JV19xrzHovbq811NiP2OhMFMByw4gRx/QkfRR+W96hfZV4y1umU/13qaa86+v96pKiWIVVXO1j43lpMXNgGR4FgwR4grmlgDAAznHLKyq0tLRM3t7CIi9PDudndxXbc6tjrJy91rq2inro28zwZyHgeJYefqCR4q1Ou9HWndPR5oTPE9kzRU0FdH7wjkx7rwR1aQcEeIJ8VTzRGoaDTV/iq7tZqS822RphqqSoja7ijOMlhP3XjGQfl4q5O3UmlZNKU3/AGNkYbPxOdHG2RzjC5xy5hDiSwgk+6engofLXGla9lnjPacspRqHT1y0reKmz3emdTVtM7hew8wR4OafFpHMHxWuV4NxNsbDuTbmwXSN0NXCCKauhA72HPhz+83zaeXlg81VnXuzOq9AvkmqqM11safduFI0vjx/GOsZ+PL1K7YfIm1p+zllwOO16OFRBz5jmCpY2q2CuWu6envd1qf0bYpTlhZznqmg4PAOjW5BHEfkCu12oW6OUw6ekers9bVu1VeWamusJ/Q9tlBhY4cqqobzA9WsOCfM4Hmpx3n14zQeiauoimDbnXB1LQtz73eOHvP+DGkn44810FVU2HbvSjpXiK22a1wANYwfdaOQa0dXOJPxJKptuTuDcNx9SS3WrBhp2AxUdLxZFPFnp6uPVx8T6AKGE898n6RXTWGOK9s5X6n4oiL6BEFN2kt6abR+kdC2C1TB0jKx0l5yz7kTpnDuwSOpDuLI6Bo58yoRWCMgjOM8li4VrTNxbl7Rc3f60G7bVXtrBxvoxHWNx4928E/6S5UzV4NCXGLX+2NsmqsPFxt3stT4+/wmJ/5glUnuNBNarhVW+oBE1JM+CQH95ji0/wBlP4j0nD+jv5K3ql9nnREVZKEREAREQBERAEREAREQBERAEREAREQBERASFsDQNuG7NjDwC2nMtT82ROI/MhTn2nKl9PteYmkgVFwp43fAcTv7tChbs4zth3ZtgcQO9p6mMfExE/7Kb+0tQOrNrKiZgz7JWU85/l4iw/8AnCizP+edleL+1RURERWkgREQBbfTOrb5o64C4WG5T0M/IO4Dlkg8ntPJw9CF2ejuz9rTV0EdW+mis9FIOJk1wy17x5tjA4sepwtFr/SNg0dUx2+26qjv9wa4iqFNT8MEGPAScR4nZ8B08Tnksc4p8fZvhSXIl/SHarhe2On1bZ3Ru6Gst3vNPq6JxyPwk/BTDpvcLSer2gWS/UNXI4c4O84JfgY3Yd+SokgJDg4HDm8wR1HwXC/Eh+ujrHk0vfZc3WGxGidXOfNJbTaq53M1NvxESfNzMcDvpn1UbVO0u6u2zTLobU09yoWEu9kjeGP+cMmWO/Cc+ii/TW8mutK8DKLUFTPTt6U1b+sR48sO5j5EKYtH9qe21jmU2rLU+3vPI1dFmWH4uYfeb8uJc3jzQv2jorxX/hmkbv8AGspKnSu6ekXyxyN7uoMEZhlHk4xPxgg8w5pHPooSvsNsp7vVR2WrmrLaH5p5pozHI5h5gOaf2h0PgcZ8Vdm5WbR26thZJUR0F7oJB9lUxOBdGf4Xj3mEeXL1Crlun2f7pomKa72SSW7WVmXSZb+sUrfN4H3m/wAQ6eIHVawZY3rWmZzY71v2iJURFYShERAWn7LF2dWaFuFte7JoK93CPJsjA7/zByhnfu0ttG618axvCyqdHWNH/iMBP+oOUh9kiV/faoh/y+Clf+LMg/suY7UIZ/xMj4ccRtlPxY8+KTGflhRx1naKr7wpkRIiKwlCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgOj23vrdM69sN2kdwxU9bH3p/6bjwO/JxV1NY6eZqrS12sT8fr1NJA1x8Hke6fk4NKoORkEHoVdXZfWzdcaCoamSQOr6Joo6wZ594wAB34m4d9fJReXLWrRX41LuGUungmpZ5KeojMc0TzHIwjm1wOCPkQV+FM/aU28dYNRN1TQw4t93fio4Ryiqsc/k8Di+IcoYVWO1cqkTXLl6YVltg9lqeioqbV2pKQTV04EtBSStyKdh+7K5p6vPUA/dGD1PKJtktDs11rykpqqPvLdRD2ysB6PY0jhYf5nED4ZVmt5NZO0PoC4XCneI66oAo6Qj9mV+RxD+Voc75BT+Rke1jn2zvghad19EN79701VzuFVpPTtW+G3QOMVdVROw6qkHJzA4dGA8jj7xz4DnBfQYHILPzJ+KKjHjULSOF26e2ERb7Smg9S63ndFYLRUVgYcPmADIo/wCZ7sNHwzn0W20u2eJN9I0KKaafstaiZRvqrtqKxW1kbeKQuL5Gxjzc7DWhRTqO00lkustDRXqivUUf/vdG14jJ8QOIc8eYyPIrE5JrqWarHU+z16N1xfdB3VtxsdY6FxI72F2TDUN/de3x+PUeBCuJttuLbNytPi40be4qYiI6yjc7LoHkfm088HxHLqCqOrsNqdeTbe6xpLpxu9hlIp66MdHwOPM/Fp94fD1XLyMKtbXs6Ycrh6fokHf/AGai04X6s07TCO2SP/XaSMe7SvJ5SNHhGTyI/ZJ8jyg5f0HqaakutBLTVEcdVR1URY9h5tljcOfyIKo3uHo+bQmsLjYZC50cD+Onkd/mQu5sd8ccj6grHi5nS417RryMXF8l6OcRF9KammrKmKmponTTzPbHFG0c3vccAD4khVkxZbso2eSm01e7u9pDayrZBGT4iJpyfq/HyUVdoK5tue6954HcTaQQ0nzZGOL/AFEq0GmbVRbXbd09LUyNENnonT1Ung94BfIfm4kD5Kkl2uc96ulZc6o5nrJ31En8z3Fx/uo8HzyVZVm+OOYPKiIrCUIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiALvdmNxX7eaujmqJHfoiu4aeuZ4Nbn3ZQPNhOfgXBcEi8qVS0z2acvaL76q03b9aabrbJX4fS1sXCJG8+A9WSNPmDgj/1VFr7ZazTl5rbPcGcFXRTOglHhkHqPQjBHoQrZdnfVb9Tbc09PUSGSqtEhoXknJLAA6Mn8Jx+FRP2p7FHb9aW+7xMx+kqL7XA+9JE7hz8eEt+ih8ZuLeNledKoVo7fsqWFtJpO6XtzPta+s7hjiP8ALib/APs930XMdq7URqL3ZtOxv9ykgdWTNB/bkPC3Pwa0/wBSmza3TjtKbfWK0zN7ueOmEk4PhJIS92fgXY+SqDuZqUav15eryx3FBNUuZAf+kz3Gfk3PzXuH55nf6GX4YlJzKItrpPT0+rNTWyxU5LZK+oZDxj9hpPvO+TQT8lc3pbZGlvokbZLZN2vHi+XwSQ2CF5ayNpLX1rx1aD4MHQuHMnkPEizF1uVh280tLWTsgt1pt0fuxQMDQPAMY0dXE8gPElbK2WyjsttpbbQQtgo6SJsMMbejWNGB/wD3mqxdpnXcl61QzS1JKfYbRgzhp5SVLhzz/I0hvxLl8zdZ8mn6L9LDG/s4vcnda+7kXBzquV1La2OzT26N32bB4F/77/Mn5YC4tdNYdstZaotrrnZ9O11ZRgEiZrQ1smOvBxEcf4crnJ4JaaaSCeJ8U0bix8cjS1zHDqCDzB9F9GeK+M/RFXJ90fhERaMlxOz3qs6n24o4ZpC+rtLzQSknJLWjMZP4CB+FcX2rNK99QWjVMEfvU7zQ1Lh+47Loyfg4OH4guV7Lupxa9aVdimfiG70+YwTy76LLh8y0vHyCsZrjS8Ws9JXSwSkA1kBZG8/sSjmx3ycAvm3/ABZt/RfP8mLRQ1Tf2ZtvDd72/WFfF+p2xxjow4cpKnHN3wYD/U4eShyns9dUXmOzCEsr5KkUndOHNspfwYPwcr2aZ09QaM03RWWkLY6W3whjpDy4iOb5D6k8Tj8VR5WXjOl9nDx8fKtv6Im7UGtha9O0ulKWTFTdD31SAebadh5A/wAzwPk0qsC6PcTVsuuNZXO+Pce6nlLKdp/Ygb7sY+gz8SVzi64cfCEjnlvnWwiIupzCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiLa6Z0redYXWO12OhkrKl/MhvJsbf3nuPJrfUo3rthLfSNW1rnuaxjS5ziAGtGSSegA8Spx0P2YLjerUa/U1xms0szMwUkUQfKzyMuThv8AKOfmR0Uj7ZbH2TbaNl6vdRT1t4aMiqlwyCl/8Pixz/jPPyAW+vO9e31ic5lTqejlkb1ZSB1QR/QCPzUOTyKrrEV48CXeQ5nYjbjUm3Fw1JR3hsDqKoMDqaohkDmzubxgkN6t5EZBH1Xbav28s+trnYq+6iR/6GqHTsiGOCbIHuv/AIeJrTy64x4rd2a6wXy10tzpY6hkFXGJY21ERik4T0y08xnr8CFyO4+8GnduqaSOonbXXYt+yt0DwX58DIf8tvx5+QKm5Xd7Xsp1Mzp+jX79bgR6L0XPS084bdru11NTNB95jDykl9AAcD1cPJU6AAGByAW61fq6663vs96vM4kqJsNa1vJkLB92Ng8Gj8+ZPMrs9BbA6r1n3VXVxfoS1vwfaathEkjf4IuRPxOB8VfjmcMfJkV08tfFEZgEkAAkk4AHUnyCsd2ddpbnZ7g7V+oKN9G/uTHQU0wxJ74w6Vzerfd5AHnzJ8lJeh9oNJ6AjbPQUAqK5o9641mHy/hP3WD+UD4lbG9blaN09kXPU9qgeOsYqBI/+lmSp8vku1xhHbHgUPlbOlBwQfJQvprs3W+O+VF91jchfamaofUGmjYY4HOc4uy/J4n9fu8h8V9r32odF2/ibbKa6XaQdCyIQRn8Tzn/AEqP712q9TVZc2z2a125h6PmLqh4+vC38ljHizL+nrZvJkxP32WfjijhjZFGxkcbGhrGNADWtHQADkB6KMt3NkLfuL/3pb5YrdfmNwZ3N+zqgOjZQOeR4PGT4EEdIDm7QO5M0nH/ANou6/hipYWt+nCt9Ye1DrO3Oa2601svEXjxRdxJ/Uzl9Wrc+Nlh8pfZl58dLTRHWrdEag0PcBQ363S0kj8mOT70UwHix45O/uPEBaQNJa5wBLW/eOOTfifBWab2iNu9Y282zVthq4YJCC+KeBtVCHeYLfeB9cAru9I6x2yqLcy06cumnoaUjAohww5z5seAXH45XZ+Rcr5T2clhmn8aKaWe7VdiutHdaCTuqujmbPC/yc05HyPQ+hV5dD6yt2vNN0t8tzgGTDhmhzl1PKPvRu9QenmMHxUabhdmqzah7y56Ulis1W/LjTkE0kp9Mc4z8Mj0UP2a6a42B1P+t0EkEc+GzU0xzTVzB4teORI8HDmPEY5LGTjnXx9o1HLC/l6J01Fst7ZuxZtb2uWnihbVsqLlTyZBc9g5SMwOZdhuQcc+fmu51zBX1Oir9BbI3y10tvnjgYz7z3lhAA9TlabQm72ldfxMZQ1zaW4ke/b6twZMD/D4PHq36BdsRg4IwfIqS6pNKvoplS03P2VV0p2X9S3m2mrvFfT2Fzm5hppIjNL6cYBAZ8Mk+gUb6y0VetB3l9qvdKYpRl0UrecVQz99jvEfmOhAVy75uVpPTN3Fovd3ZbKpzBIz2qKRkcjT4tk4eE+R58j1X0u1p0pubY30NS6gvVC/3mvp5mvdE799jmklrvX65VE+Vae7XRwrx4a1L7KJopV3M2AvuijNcLQJbzZm5cZGN+3p2/8AUYOoH7zeXmAop6jI5hXRc2tySVLl6ZlERaMhERAEREAREQBERAEREAREQBYJA6kDPmVlWf7M+kbPXbf1tZcLbSVj7jWyQSd/E1+YmBrQzmOQyXHl5rnlyLHPJm8cc3orAuqsW52qdLWV1nsNfFa4HuL5ZaWnY2eZ3m6QguOOg6YC0l/o4bdfrnRUxLoKarmhjJ8Wtkc0fkAvAttKl2ZTafR7Lre7pfZTNdblW3CQ8+KqndJ/5iV99M3wabvVNdf0bQ3I0xL2U9Y0uhLscnFoIzg8wOmQtYi90taG3vZIupN/9f6kifA67MtsD+To7dH3JI8i/Jf+YUdve6RznucXPceJznHJcfMnxWEWZhT6R7VOvbJH0puRpXQcMc9m0S25XdrQTcbxUhxa7HPu42NwwZ9c+q9N57SO4N1LhT11Ha2O8KOmHF/U/iKi9Fl4ob21s9/JSWkza3jVmoNQuLrvfLlX58J6l7m/05x+S1IAb90AfAYWUXRJL0Yb2EREAREQBYIDhggEeqyiA2tl1ZqDTjw6z3u5UBHhBUOa3+nOPyXaw9oDV09C63X+Gz6koX8nwXKjaeL8TMc/XGVGqLLiX7RpXS9M9t4raOuuUlVb7ay1wPIc2ljmdK2I+PC53vYz0B6ea6zTG9uu9KsbDS3ySrpm9Kevb7QwDyBd7w+RW12l2RqtzaGruc10FsoIJe4Y9sXevlkABIAyAAARz9VyWvtFVu3+p6mw1s0VQ+JrZI54wQ2WNwy12DzB6gjwIWNxT4PvRrVyuZ22rN/Z9c6els+oNI2iocQTFUxTSMfBJjk9nXB9M4PQqLKWqqKGYT0k8tNMOkkLzG76jBXzRbmJlaRmrdPbO4s29u4VjDW0+p6yeNvRlYG1A/1gn81y+oL3LqK7T3OekoaSach0jKKHuoy7xdw5IBPU48Vr0RRKe0g6bWmwiItGQiIgCIiAIiIAiIgCIiAIiIArbdl6UP2zY3/l3OoB/wBB/wB1UlWy7L0Zbtk8/v3OoI+jB/spvL/tlHjf1kEQ7R651PfLn7Bp+rLG1k7XT1GIY8947OHPxn5ZX51HsnrzS1G+urrG6aljHFJLRytnEY83BvvAeuMKUN2e0Xc7XfqmxaR9mY2ieYZ6+aMSl8g5ObG08g0Hlk5yQcYHXY7L7+12q71FpvU7IPbajPslbAzuxI8DPdvaOQJAOCMZxghZ/JmU8tLR7wxt8d9lZOvRZUwdpHQFHpXUlJerXCyCjvAeZIWDDI524LuEeAcHB2PPKh/5E+g8VTFq5VI4XLl6Z9qKhqrlVxUdFTTVVTM7hjhhYXvefIAcypFoezpuNW0wnNopqXIyI6msjZJ9BnHzU27e6PseyWgZtR3tjW3I0wnr6jh4pGZxw08fzIbgfed15YxEl87Tmtq64ultQoLXRh32dP7O2Z3D4cb3dT8MBcPy3baxrpHb8cwvm+zgtV7f6o0S9ov9mqaON54WT8nwvPkHtJbn0zlc+rZbVbuW/dyjq9NajttIy4GEukp8cUFbF0cQ08w4ZGRk+YPlAe7+34261lNbacvfbqhgqaJzzl3dkkFhPiWuBGfEYPitY8rdcLWmZyY0lyl9HH0VFVXKrho6KmmqamdwZFDCwue9x8AB1K9l/wBM3rStY2ivlsqrdUuYJGx1DMFzT4jwI+C3G1mqItHa/s15qcezRTd3OcfdjkaWOcPgHZ+SnftUafFdo+2XuJgc+3Vfdve3/lSjH04mt+q9vK5tTrpnk41UOvtFXlgEEkAgkdRnotzo7T8mqtV2myRtcfbaqOJ/D1DM5efk0OPyVqd29rLPetvKiks1qpaWrtMJqKDuIg12GDLo8jmQ5oPXxweq9yZlFKX9iMTpNr6KfLbN0lf36ddqRtorDZmv7s1oZ9mDnHXrjPLPTPLK1Bd7pc3nyyPVW13Alg0N2exbXRMZJJbKe2sjI/zJAOI/Ee+74hMuRw0l9nmOOSbf0VLW5s+i9S6gt89xtFiuNfR07uCWanhL2tdjOOXMnHlnC0xVwOzdwu2otwYAHe1VQPh73en/ANEz5Hjnkj3FjV1pldLFsvr/AFFCZ6PTdVHD4PrC2nDvgHkE/RaHU+kr5o24i3X63TUNS5veMa8gtkbnHE1wJDhnyKmTXHacvtLqerpNNUtuFupJXQiWqiMr6ktOC77w4W5BwBzxzyoz3H3Nu25tdRVV0pqOlFFE6KKKmDuH3jlziXEnJwPhheY6yN7pdC1jS0n2dBsrrLXlhqK+g0jZTfqeQCeoo3tPDG4DAeHAjhJxjH7WOnJcRrDUN31TqSuut8yLhLJwyx8BYIuH3RGGnm0NxjB5+fNT52TOD9Aak90cftkOTjnjuzj/AHUO7yFp3U1TwNDR7e/kPPhbk/XKzFJ5aWjVJrGns41ei326su1ZHRW+knrKqU4ZDBGXvd8AOa+Ecb5ZGxxsL5HuDWtHVxJwB9VcHTmn9O7BbfTXSvY11YyJrq6paAZamZ3SFhPRvEcAdORJ8VvLl4Ja7bMY8fP/AEiBKPs8bj1kAm/QcNPkZDKisiY/6ZOPmuY1ToDVGintF/stVRMeeFkxAfE8+Qe0lufTOV3N37TOuq24me3vt9spQ7LKVtM2Xl5Oe7m4/DClzazdW3bw2yt07qK20rbgIS6emxmCsi6FzQeYIJGRnlkEHy5VkywuVJaOijHT4y+ypSLrt1dDf8PtaVlmjc+SjIbUUj383OhfnAPmQQWk+OM+K5FUzSpbRwaaemERF6eBERAEREAREQBERAEREAVtOy5Jx7aBo5cF0nH14D/uqlqzvZv1lpu0bfTUdwvNBQ1NLWzTzx1EzY3d27hIeAfvDAxyzzGFN5abjo7+M9X2VuvcckV6uMcpJkZVzNcT4kSOyt/tNE+bc7SzIzh36ShPyByfyBWk1DXxXXUF0uEAIiqqyadgIweF0jnD8iF9tI392ltU2m+MjMpoKqOcsHV7QfeHzGQu7Tc6OSeqJ97WkpFm01Fw8nVU78+WI2jH5qu1pnhpbrQ1FQMwxVMUkg/ha8E/kCrh6spdB7v6LjfU3ylZQNPtENayoZHJSPwR7wceRwSHNcP9iqdXKngpLhVU1NVMrYIpnxx1DGkNmYHEB4B6Ajn81P4tfDj9o7eQvly/ZbftG26rvW11XNbuKaOnqYa2UR8+KEE5d6gcQd8BlVAViNld+bbTWmn0trGoFOKdvc0tfKOKN8XQRy+WByDjyI5HGOfRXXs5aB1PVfpSz3OooKeU8bo7fNHLAf5M54R6A4HksY7/AA7izdx+X5SRL2cLPWXHdCirKdrxBboZZ6h46BrmFjWn+ZzunofJdN2squnk1Dp6kYQaiGjlkkx1DXyDhz/S5SLLqTbfYbT8lvt88U1UffNLBMJqqqkxgGRw5NHqcADoFV3WGq7hrbUdZfbmW+0VTuTGfdiYOTWN9AOX1PitY95Mn5NdIzeojh9mlwCMHoeRVv8AREse7WxrLbUyB9TNRPtszndWzxjDHH6Ru+aqCpV2C3Sp9BXue23iYx2a5lvHKeYpphybIf4SPdd5cj4Lp5EOp3PtGMFqa0/TOm7LmjZnahvF/rqYsfbWm3xBw+7UOP2g+LWjH4lKGhN16TWeudT6ejMbobe9poXAf48bMMlPr7/MejljcDdHS+hdL1lRbK62z3GsbI+kp6KRjjLM8f4ruDoMniLj1x4lVY281hNoTWFuv7GOnbTvLaiMHBlicMPHxwcj1AU6h5uVtf6OztYtSn/s7Sj2rdHv43SckDnW+KsNd05GjH2g+XRnxXX9rHUIc6w6ejf7w7yvmaPDPuM/+4pWduToFtoOr/0zazH3Hd98C32otzxdzwffzn9jz+qqFrzV9VrrVdff6ppj9pfiKInPcxN5MZ8h19SVvFyyWqpev/TOTjEtL7NArc9moP8A+FFP151tVw8/4h/uqjK0uwGudO2ravua26UdLPapaiSoimlax/CXF7XAE5dkHAx4jC35abjoz4zSvsq7OHCeUO+8HuB+OTlfhfuol7+eWbGO8e5+PLJJx+a/CpJyyXZLaf0NqZ3EcGqpxj/6buahzeD/ANqWqv8A5jJ/YLt+zduJatJXS5Wa9VMdHTXTu3w1MpxGyVmRwuP7IcDyJ5ZHqtv2jtNaKER1NbrvSsv1XMzvKSCdsoq24wZOEE8BAAy7ofipE+Od7Xspa5Ylr6IR0/VxUF/tdXOAYoKyCV+enC2RpP5BWn7TVprLttwaqi4pIqCtZVztbzzFhzeL4AuB+GSqkdeR5hWT2f37s81kp9NazqWUs9PGKeKtnHFDUxYwGyH9lwHLJ5OHkcrXkTW1c96PMNLTh/ZW1S12ZrLW1+5DLlA1wpbbSyuqJPD32ljGfEkk48mlSTdNg9r7zVG6UV8NvpZDxuho6+EwY/hLslo9AcBe+Hc/ajaWiisNlqPaGB+ZRbWe0Hi6F8kmQHO+BJ8gFm8/OXMJ7ZqMPGt0+iOu1ewjWdlfw4DrYRnzxM7/APKhJW13Vsmit0dDN1GNQUtOKCCSWkuDJBwjIyYnsPPmQBw8nA9PI1JHMAkYOOnkt+NW41+jnnWr3+zKIioOIREQBERAEREAREQBERAFggHqAcLKIAiIgMFrSclrSfPCyiIAsse6MEMc5gPUNOM/RYRAYAA6AD4LKIgCIiAwAB0AGfILKIgMYGc4GfPHNZREAWCASCQCR05dFlEAREQBYDWt+60D4DCyiAIiID892z9xn9IX6REBjA8h5rKIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiAIiIAiIgCIiA//9k=";
const HUELLA_B64 = "data:image/png;base64,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";


// ---------- Paleta Howria ----------
const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const CREAM_SOFT = "#EAE0C6";
const GOLD = "#C9A24B";
const INK = "#332E22";
const RUST = "#A85C3B";
const NAVY_LOGO = "#102A41"; // mismo color de fondo que el logo, usado en el encabezado de las boletas (canvas)

const CLIENTES_INICIAL = [
  { id: 1, nombre: "María José Reyes", perro: "Toby", telefono: "+56 9 1234 5678", valorPaseoRef: 8000, raza: "Golden Retriever", pesoKg: 28, fotoUrl: null, diasHabituales: [0,1,2,3,4], planHabitual: "LV", objetivos: "Bajar nivel de energía y mejorar caminata con correa.", paseadorNombre: "Pedro Vidal", tarifaPaseador: 5000, direccion: "Av. Providencia 1650, Providencia", lat: -33.4260, lng: -70.6100, tipoServicio: ["paseos"], estadoCliente: "activo", fechaInicio: "2026-03-01" },
  { id: 2, nombre: "Javier Ocares", perro: "Luna", telefono: "+56 9 8765 4321", valorPaseoRef: 9000, raza: "Staffordshire", pesoKg: 22, fotoUrl: null, diasHabituales: [0,2,4], planHabitual: "LMV", objetivos: "Socialización con otros perros durante el paseo.", paseadorNombre: "Pedro Vidal", tarifaPaseador: 5500, direccion: "Av. Apoquindo 4900, Las Condes", lat: -33.4085, lng: -70.5730, tipoServicio: ["paseos", "clases"], estadoCliente: "activo", fechaInicio: "2026-05-15" },
  { id: 3, nombre: "Daniela Aliaga", perro: "Rocco", telefono: "+56 9 2222 3333", valorPaseoRef: 8500, raza: "Mestizo", pesoKg: 15, fotoUrl: null, diasHabituales: [1,3], planHabitual: "MJ", objetivos: "Reducir ansiedad por separación.", paseadorNombre: "Ignacio Muñoz", tarifaPaseador: 5000, direccion: "Irarrázaval 3200, Ñuñoa", lat: -33.4560, lng: -70.5980, tipoServicio: ["paseos", "evaluacion"], estadoCliente: "activo", fechaInicio: "2026-06-10" },
];

const ESTADOS_CLIENTE = [
  { id: "activo", nombre: "Activo", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "pausado", nombre: "Pausado", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "baja", nombre: "Dado de baja", color: "#A85C3B", bg: "#F1DCD2" },
];

const TIPOS_SERVICIO = [
  { id: "paseos", nombre: "Paseos" },
  { id: "clases", nombre: "Clases de adiestramiento" },
  { id: "evaluacion", nombre: "Evaluación" },
];

const PASOS_CAPACITACION = [
  { id: "induccion", texto: "Inducción inicial y valores de Howria" },
  { id: "manejo_seguro", texto: "Manejo seguro de los perros" },
  { id: "uso_app", texto: "Uso de la app (marcar paseos, notas)" },
  { id: "emergencias", texto: "Protocolo ante emergencias" },
  { id: "paseo_supervisado", texto: "Paseo supervisado de prueba" },
];

const ESTADOS_PROSPECTO = [
  { id: "nuevo", nombre: "Nuevo contacto", color: "#8A7E5C", bg: "#EDE4CE" },
  { id: "conversando", nombre: "En conversación", color: "#1F5C8A", bg: "#D6E6F0" },
  { id: "propuesta", nombre: "Propuesta enviada", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "negociacion", nombre: "Negociación", color: "#8A4E1E", bg: "#F1DCC0" },
  { id: "ganado", nombre: "Ganado", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "perdido", nombre: "Perdido", color: "#A85C3B", bg: "#F1DCD2" },
];

const ORIGENES_PROSPECTO = ["Instagram", "Facebook", "WhatsApp", "Referido", "Página web", "Agenda pública", "Otro"];

const MESES = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const DIAS_SEMANA = ["L","M","X","J","V","S","D"]; // lun..dom
const DIAS_SEMANA_LARGO = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

const TODOS_LOS_TABS = [
  { id: "inicio", label: "Inicio", grupo: "" },
  { id: "mis-paseos", label: "Mis paseos", grupo: "Trabajo diario" },
  { id: "coordinacion", label: "Coordinación", grupo: "Trabajo diario" },
  { id: "mapa", label: "Mapa", grupo: "Trabajo diario" },
  { id: "agenda", label: "Agenda", grupo: "Trabajo diario" },
  { id: "mail", label: "Mail", grupo: "Trabajo diario" },
  { id: "clientes", label: "Clientes", grupo: "Clientes y boletas" },
  { id: "boletas", label: "Boletas", grupo: "Clientes y boletas" },
  { id: "boletas-adiestramiento", label: "Boletas Adiestramiento", grupo: "Clientes y boletas" },
  { id: "facturas", label: "Facturas", grupo: "Clientes y boletas" },
  { id: "finanzas", label: "Finanzas", grupo: "Clientes y boletas" },
  { id: "pagos", label: "Pago trabajadores", grupo: "Equipo" },
  { id: "equipo", label: "Equipo", grupo: "Equipo" },
  { id: "ingreso-personal", label: "Ingreso personal nuevo", grupo: "Equipo" },
  { id: "usuarios", label: "Usuarios", grupo: "Equipo" },
  { id: "seguimiento", label: "Seguimiento", grupo: "Prospección" },
];
const ORDEN_GRUPOS = ["Trabajo diario", "Clientes y boletas", "Equipo", "Prospección"];
const ROLES_APP = ["entrenador", "coordinador", "administrador"];

// Un ícono por pestaña, para el launcher tipo "app" de la pantalla de
// Inicio en mobile (ver Inicio() más abajo). "inicio" no necesita uno —
// ya estás ahí.
const ICONOS_TAB = {
  "mis-paseos": Footprints,
  coordinacion: MapPinned,
  mapa: Map,
  agenda: Calendar,
  mail: MailIcon,
  clientes: Dog,
  boletas: Receipt,
  "boletas-adiestramiento": GraduationCap,
  facturas: FileText,
  finanzas: TrendingUp,
  pagos: Banknote,
  equipo: Users,
  "ingreso-personal": UserPlus,
  usuarios: ShieldCheck,
  seguimiento: Target,
};

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

const EVENTOS_NOTIFICACION = [
  { id: "cita", label: "Nueva solicitud de cita" },
  { id: "correo", label: "Nuevo correo entrante" },
];

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
    setConfigState((prev) => ({ ...prev, [clave]: valor }));
    supabase.from("configuracion").upsert({ clave, valor }, { onConflict: "clave" });
  }

  return [config, actualizarConfig];
}

// Horario semanal por adiestrador (disponibilidad_adiestrador): una fila
// por (adiestrador, día de semana), con upsert porque esa pareja es única
// en la base — no hay lista libre que insertar/borrar como en las demás
// tablas sincronizadas con useSyncedTable.
function useDisponibilidad(sessionVersion) {
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let activo = true;
    setCargando(true);
    supabase.from("disponibilidad_adiestrador").select("*").then(({ data, error }) => {
      if (!activo) return;
      if (error) showToast(`No se pudo cargar la disponibilidad: ${error.message}`);
      else if (data) setFilas(data.map(dbToDisponibilidad));
      setCargando(false);
    });
    return () => { activo = false; };
  }, [sessionVersion]);

  async function actualizar(adiestrador, diaSemana, cambios) {
    const actual = filas.find((f) => f.adiestrador === adiestrador && f.diaSemana === diaSemana)
      || { adiestrador, diaSemana, horaInicio: "09:00", horaFin: "18:00", activo: false };
    const nueva = { ...actual, ...cambios };
    setFilas((prev) => {
      const idx = prev.findIndex((f) => f.adiestrador === adiestrador && f.diaSemana === diaSemana);
      return idx >= 0 ? prev.map((f, i) => (i === idx ? nueva : f)) : [...prev, nueva];
    });
    const { data, error } = await supabase.from("disponibilidad_adiestrador")
      .upsert(disponibilidadToDb(nueva), { onConflict: "adiestrador,dia_semana" })
      .select().single();
    if (error) {
      showToast(`No se pudo guardar el horario: ${error.message}`);
      return;
    }
    if (data) {
      const guardada = dbToDisponibilidad(data);
      setFilas((prev) => {
        const idx = prev.findIndex((f) => f.adiestrador === adiestrador && f.diaSemana === diaSemana);
        return idx >= 0 ? prev.map((f, i) => (i === idx ? guardada : f)) : [...prev, guardada];
      });
    }
  }

  return [filas, actualizar, cargando];
}

// Precio de evaluación/clase por adiestrador (tarifas_adiestrador): una
// fila por adiestrador, upsert igual que useDisponibilidad pero sin la
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

function dbToCorreo(row) {
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

  return [correos, setCorreos, cargando];
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

const PLANES = [
  { id: "LV", nombre: "Lunes a viernes", dias: [0,1,2,3,4] },
  { id: "LMV", nombre: "Lunes, miércoles y viernes", dias: [0,2,4] },
  { id: "MJ", nombre: "Martes y jueves", dias: [1,3] },
  { id: "TODOS", nombre: "Todos los días", dias: [0,1,2,3,4,5,6] },
  { id: "PERSONALIZADO", nombre: "Personalizado", dias: [] },
];

const ESTADOS_FACTURA = [
  { id: "no_enviada", nombre: "No enviada", color: "#8A7E5C", bg: "#EDE4CE" },
  { id: "pendiente_pago", nombre: "Pendiente de pago", color: "#8A6A1E", bg: "#F3E3B4" },
  { id: "pagada", nombre: "Pagada", color: "#2F6A46", bg: "#D8ECDE" },
  { id: "cancelada", nombre: "Cancelada", color: "#A85C3B", bg: "#F1DCD2" },
];

function fmtCLP(n) {
  return Number(n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

// ---------- Utilidades de mapa (OpenStreetMap, sin API key) ----------
const MAPA_ZOOM = 12;
const MAPA_TILES_ANCHO = 5;
const MAPA_TILES_ALTO = 4;
const SANTIAGO_CENTRO = { lat: -33.4489, lng: -70.6693 };

function lonATileX(lon, zoom) { return (lon + 180) / 360 * Math.pow(2, zoom); }
function latATileY(lat, zoom) {
  const rad = (lat * Math.PI) / 180;
  return (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, zoom);
}

function origenMapa() {
  const cx = lonATileX(SANTIAGO_CENTRO.lng, MAPA_ZOOM);
  const cy = latATileY(SANTIAGO_CENTRO.lat, MAPA_ZOOM);
  return { tileX: Math.floor(cx) - Math.floor(MAPA_TILES_ANCHO / 2), tileY: Math.floor(cy) - Math.floor(MAPA_TILES_ALTO / 2) };
}

// convierte lat/lng a posición en píxeles dentro del contenedor del mapa
function coordAPixel(lat, lng) {
  const origen = origenMapa();
  const x = (lonATileX(lng, MAPA_ZOOM) - origen.tileX) * 256;
  const y = (latATileY(lat, MAPA_ZOOM) - origen.tileY) * 256;
  return { x, y };
}

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

function LogoHowria({ height = 40 }) {
  return <img src={LOGO_B64} alt="Howria" style={{ height, display: "block" }} />;
}

function NotificacionesBell({ avisos }) {
  const [abierto, setAbierto] = useState(false);
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
        <div style={{ position: "absolute", right: 0, top: "110%", width: 280, background: "#FFFFFF", borderRadius: 8, boxShadow: "0 12px 30px rgba(0,0,0,0.25)", padding: 14, zIndex: 20 }}>
          <p style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase" }}>Avisos</p>
          {avisos.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "#9A9179" }}>No hay avisos pendientes.</p>
          ) : (
            avisos.map((a, i) => <p key={i} style={{ margin: "0 0 8px", fontSize: 13, color: "#332E22" }}>{a.icono} {a.texto}</p>)
          )}
        </div>
      )}
    </div>
  );
}

function BotonNotificacionesPush({ usuarioEmail }) {
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
      title={activo ? "Desactivar notificaciones push" : "Activar notificaciones push (citas nuevas, correos)"}
      style={{ background: "none", border: "none", cursor: cargando ? "default" : "pointer", padding: 6, display: "flex", alignItems: "center", color: activo ? "#D4A94A" : "#7C8AA0" }}
    >
      {activo ? <Bell size={19} /> : <BellOff size={19} />}
    </button>
  );
}

// ---------- Login ----------
function Login({ onLogin, usuarios }) {
  const [nombre, setNombre] = useState("");
  const [passwordEquipo, setPasswordEquipo] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [modo, setModo] = useState("equipo");
  const [emailCliente, setEmailCliente] = useState("");
  const [enviandoLink, setEnviandoLink] = useState(false);
  const [linkEnviado, setLinkEnviado] = useState(false);

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
    setEntrando(false);
    if (error || !data.session) {
      setErrorLogin("Nombre o contraseña incorrectos.");
      return;
    }
    const perfil = usuarios.find((u) => u.email === email);
    if (!perfil) {
      setErrorLogin("Tu cuenta no tiene un perfil asociado. Avisa al administrador.");
      await supabase.auth.signOut();
      return;
    }
    onLogin(perfil);
  }

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 380, padding: "0 24px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 36 }}>
          <LogoHowria height={110} />
        </div>
        <div style={{ background: CREAM, borderRadius: 10, padding: "36px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" }}>
          <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1.5px solid ${NAVY}`, marginBottom: 24 }}>
            <button onClick={() => setModo("equipo")} style={{ flex: 1, padding: "10px", border: "none", cursor: "pointer", background: modo === "equipo" ? NAVY : "#FFFFFF", color: modo === "equipo" ? CREAM : NAVY, fontWeight: 600, fontSize: 13 }}>Soy del equipo</button>
            <button onClick={() => setModo("cliente")} style={{ flex: 1, padding: "10px", border: "none", cursor: "pointer", background: modo === "cliente" ? NAVY : "#FFFFFF", color: modo === "cliente" ? CREAM : NAVY, fontWeight: 600, fontSize: 13 }}>Soy cliente</button>
          </div>

          {modo === "equipo" ? (
            <>
              <p style={{ margin: "0 0 24px", fontSize: 13, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>Portal administradores</p>
              <label style={label} htmlFor="login-nombre">Nombre</label>
              <input id="login-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Tu nombre"
                onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
                style={input} autoFocus />
              <label style={label} htmlFor="login-password">Contraseña</label>
              <input id="login-password" type="password" value={passwordEquipo} onChange={(e) => setPasswordEquipo(e.target.value)} placeholder="Tu contraseña"
                onKeyDown={(e) => e.key === "Enter" && intentarLogin()}
                style={{ ...input, marginBottom: errorLogin ? 8 : 24 }} />
              {errorLogin && <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "#A85C3B" }}>{errorLogin}</p>}
              <button onClick={intentarLogin} disabled={entrando} style={{ ...botonPrincipal, opacity: entrando ? 0.6 : 1 }}>
                {entrando ? "Entrando..." : "Entrar"}
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 20px", fontSize: 13, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 1.5, textAlign: "center" }}>Portal del cliente</p>
              {linkEnviado ? (
                <p style={{ margin: 0, fontSize: 13.5, color: "#2F6A46", background: "#D8ECDE", borderRadius: 8, padding: "12px 14px", lineHeight: 1.6 }}>
                  ✓ Te enviamos un link de acceso a <b>{emailCliente.trim()}</b>. Ábrelo desde tu correo para entrar — no hace falta contraseña.
                </p>
              ) : (
                <>
                  <label style={label} htmlFor="login-email-cliente">Tu correo</label>
                  <input id="login-email-cliente" type="email" value={emailCliente} onChange={(e) => setEmailCliente(e.target.value)} placeholder="tu@correo.com"
                    onKeyDown={(e) => e.key === "Enter" && enviarLinkCliente()} style={input} autoFocus />
                  <button onClick={enviarLinkCliente} disabled={!emailCliente.trim() || enviandoLink}
                    style={{ ...botonPrincipal, opacity: !emailCliente.trim() || enviandoLink ? 0.45 : 1 }}>
                    {enviandoLink ? "Enviando..." : "Enviarme el link de acceso"}
                  </button>
                  <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 10, marginBottom: 0 }}>Usa el correo que nos diste al registrarte como cliente.</p>
                </>
              )}
            </>
          )}
        </div>
        <p style={{ fontSize: 12, color: "#7E8FA0", marginTop: 18, textAlign: "center", lineHeight: 1.5 }}>
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
  const boletasOrdenadas = [...boletasCliente].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  const pendientes = boletasCliente.filter((b) => b.estado === "pendiente_pago" || b.estado === "no_enviada");
  const totalPendiente = pendientes.reduce((acc, b) => acc + b.total, 0);

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <div style={{ background: NAVY, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <LogoHowria height={40} />
        <button onClick={onSalir} style={{ background: "none", border: `1.5px solid ${CREAM}`, color: CREAM, borderRadius: 6, padding: "8px 14px", fontSize: 12.5, cursor: "pointer" }}>Cerrar sesión</button>
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

// ---------- Generador de boletas ----------
function Boletas({ clientes, boletasEmitidas, correlativo, setCorrelativo, onRegistrarBoleta, recargoPct, actualizarRecargoPct }) {
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

  function generar() {
    if (!cliente || dias.length === 0) return;
    const nueva = {
      numero: correlativo,
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
      total,
      fecha: hoy.toLocaleDateString("es-CL"),
      fechaISO: hoy.toISOString(),
      estado: "no_enviada",
    };
    setEmitida(nueva);
    setCorrelativo((n) => n + 1);
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
        <label style={label} htmlFor="boleta-numero">N° de boleta</label>
        <input id="boleta-numero" type="number" value={correlativo} onChange={(e) => setCorrelativo(Number(e.target.value) || 0)} style={{ ...input, maxWidth: 140 }} />

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

        <div style={{ marginTop: 8, padding: "16px 18px", background: CREAM_SOFT, borderRadius: 8 }}>
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

        <button onClick={generar} disabled={!cliente || dias.length === 0}
          style={{ ...botonPrincipal, marginTop: 20, opacity: !cliente || dias.length === 0 ? 0.45 : 1 }}>
          Generar boleta N°{String(correlativo).padStart(3, "0")}
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
const FORM_VACIO = { nombre: "", perro: "", telefono: "", email: "", valorPaseoRef: "", raza: "", pesoKg: "", fotoUrl: null, diasHabituales: [], horaHabitual: "", planHabitual: "LV", objetivos: "", paseadorNombre: "", tarifaPaseador: "", direccion: "", lat: null, lng: null, tipoServicio: ["paseos"], estadoCliente: "activo", fechaInicio: "" };

function FormularioCliente({ inicial, paseadores, onGuardar, onCancelar }) {
  const [form, setForm] = useState(inicial ?? FORM_VACIO);

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

  function subirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setForm((f) => ({ ...f, fotoUrl: reader.result }));
    reader.readAsDataURL(file);
  }

  function guardar() {
    if (!form.nombre || !form.perro) return;
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
          <input placeholder="Peso (kg)" type="number" value={form.pesoKg} onChange={(e) => setForm({ ...form, pesoKg: e.target.value })} style={{ ...input, marginBottom: 0 }} />
          <input placeholder="Valor paseo referencial" type="number" value={form.valorPaseoRef} onChange={(e) => setForm({ ...form, valorPaseoRef: e.target.value })} style={{ ...input, marginBottom: 0 }} />
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
        <input placeholder="Tarifa a pagar al paseador por paseo" type="number" value={form.tarifaPaseador} onChange={(e) => setForm({ ...form, tarifaPaseador: e.target.value })} style={{ ...input, marginBottom: 0 }} />
      </div>
      <p style={{ ...hint, marginTop: -10 }}>Esta tarifa es lo que se le paga al paseador por cada paseo de este cliente — puede ser distinta al valor cobrado al cliente. Para reasignar paseadores en bloque, usa la pestaña "Asignaciones".</p>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={guardar} style={{ ...botonPrincipal, marginTop: 0 }}>Guardar ficha</button>
        <button onClick={onCancelar} style={botonSecundario}>Cancelar</button>
      </div>
    </div>
  );
}

// ---------- Perfil de cliente ----------
function PerfilCliente({ cliente, boletasCliente, boletasAdiestramientoCliente, correosCliente = [], setBoletasEmitidas, setBoletasAdiestramiento, onVolver, onEditar, onEliminar, puedeEliminar }) {
  const plan = PLANES.find((p) => p.id === cliente.planHabitual);
  const historialVentas = [
    ...boletasCliente.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramientoCliente.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ].sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  const totalHistorico = historialVentas.reduce((acc, b) => acc + b.total, 0);
  const puedeAgendar = cliente.tipoServicio?.includes("clases") || cliente.tipoServicio?.includes("evaluacion");
  const [linkCopiado, setLinkCopiado] = useState(false);

  function copiarLinkAgenda() {
    const link = `${window.location.origin}/agendaadiestrador?c=${cliente._dbId}`;
    navigator.clipboard.writeText(link).then(() => {
      setLinkCopiado(true);
      setTimeout(() => setLinkCopiado(false), 2500);
    });
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
          <div style={{ display: "flex", gap: 8, flex: "none", flexWrap: "wrap", justifyContent: "flex-end" }}>
            {puedeAgendar && cliente._dbId && (
              <button onClick={copiarLinkAgenda} style={botonSecundario}>{linkCopiado ? "¡Copiado!" : "Copiar link de agenda"}</button>
            )}
            <button onClick={onEditar} style={botonSecundario}>Editar</button>
            {puedeEliminar && <BotonEliminar onConfirm={onEliminar} style={{ ...botonSecundario, borderColor: RUST, color: RUST }} />}
          </div>
        </div>

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

        {cliente.email && (
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 16, marginTop: 14 }}>
            <p style={{ ...label, marginBottom: 8 }}>Correo</p>
            <ListaCorreosCompacta correos={correosCliente} />
          </div>
        )}

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
          <p style={label}>Historial de ventas</p>
          {historialVentas.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Todavía no se le ha generado ninguna boleta.</p>
          ) : (
            <div>
              {historialVentas.map((b) => (
                <FilaBoletaVenta key={`${b._tipo}-${b.numero}`} boleta={b} tipo={b._tipo}
                  setBoletasEmitidas={setBoletasEmitidas} setBoletasAdiestramiento={setBoletasAdiestramiento} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------- Clientes (base de datos madre) ----------
function Clientes({ clientes, setClientes, boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, usuarios, puedeEliminar, cargandoClientes, correos = [], saltarClienteDbId, limpiarSaltoCliente }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [perfilId, setPerfilId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroPaseador, setFiltroPaseador] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [orden, setOrden] = useState("nombre-asc");

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
        setBoletasEmitidas={setBoletasEmitidas}
        setBoletasAdiestramiento={setBoletasAdiestramiento}
        onVolver={() => setPerfilId(null)}
        onEditar={() => { setEditandoId(clientePerfil.id); setPerfilId(null); setMostrarForm(true); }}
        onEliminar={() => { setClientes((prev) => prev.filter((x) => x.id !== clientePerfil.id)); setPerfilId(null); }}
        puedeEliminar={puedeEliminar}
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
          onGuardar={guardar}
          onCancelar={() => { setMostrarForm(false); setEditandoId(null); }}
        />
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18, marginBottom: 4 }}>
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
          <p style={{ ...hint, gridColumn: "1 / -1" }}>Cargando clientes…</p>
        ) : (
          <>
            {filtrados.map((c) => (
              <button key={c.id} onClick={() => setPerfilId(c.id)} style={{ textAlign: "left", background: "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, padding: 16, cursor: "pointer", font: "inherit" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
            ))}
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

// ---------- Finanzas ----------
function inicioSemana(fecha) {
  const f = new Date(fecha);
  const dow = (f.getDay() + 6) % 7; // 0 = lunes
  f.setDate(f.getDate() - dow);
  f.setHours(0, 0, 0, 0);
  return f;
}

function variacion(actual, anterior) {
  if (anterior === 0) return actual > 0 ? 100 : 0;
  return ((actual - anterior) / anterior) * 100;
}

function Finanzas({ boletasEmitidas, boletasAdiestramiento = [], clientes, pagosRegistrados = [] }) {
  const [periodo, setPeriodo] = useState("semana");
  const hoy = new Date();

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas,
    ...boletasAdiestramiento.map((b) => ({ ...b, cantidad: 0, descuento: (b.descuentoPackMonto || 0) })),
  ], [boletasEmitidas, boletasAdiestramiento]);

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

  const filtradas = useMemo(() => todasLasBoletas.filter((b) => new Date(b.fechaISO) >= actualDesde), [todasLasBoletas, actualDesde]);
  const anteriores = useMemo(() => todasLasBoletas.filter((b) => { const f = new Date(b.fechaISO); return f >= anteriorDesde && f < anteriorHasta; }), [todasLasBoletas, anteriorDesde, anteriorHasta]);

  const actual = calcularTotales(filtradas);
  const anterior = calcularTotales(anteriores);
  const costosPeriodo = useMemo(() =>
    pagosRegistrados
      .filter((p) => p.fechaPagoISO && new Date(p.fechaPagoISO) >= actualDesde)
      .reduce((acc, p) => acc + Number(p.monto || 0), 0),
    [pagosRegistrados, actualDesde]);
  const utilidad = actual.ingresos - costosPeriodo;
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
        total: todasLasBoletas.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === i && f.getFullYear() === hoy.getFullYear(); }).reduce((acc, b) => acc + b.total, 0),
      }));
    }
    const mapa = {};
    filtradas.forEach((b) => {
      const f = new Date(b.fechaISO);
      const clave = f.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
      mapa[clave] = (mapa[clave] || 0) + b.total;
    });
    return Object.entries(mapa).map(([etiqueta, total]) => ({ etiqueta, total }));
  }, [filtradas, periodo, todasLasBoletas]);

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
  const facturadoEsteMes = todasLasBoletas.filter((b) => { const f = new Date(b.fechaISO); return f.getMonth() === mesActualIdx && f.getFullYear() === anioActualN; }).reduce((acc, b) => acc + b.total, 0);
  const porcentajeFacturado = proyeccionMes ? Math.round((facturadoEsteMes / proyeccionMes) * 100) : 0;

  const etiquetaPeriodo = { semana: "esta semana", mes: "este mes", año: "este año" }[periodo];
  const etiquetaAnterior = { semana: "semana anterior", mes: "mes anterior", año: "año anterior" }[periodo];

  function imprimirInforme() {
    window.print();
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
          <h2 style={sectionTitle}>Finanzas de Howria</h2>
          <p style={hint}>Informes generados a partir de las boletas emitidas — se actualizan solos con cada boleta nueva.</p>
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

      <div className="howria-g4" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 14, marginBottom: 26 }}>
        <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase", letterSpacing: 0.5 }}>Ingresos {etiquetaPeriodo}</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, fontFamily: "Georgia, serif" }}>{fmtCLP(actual.ingresos)}</p>
          <p style={{ margin: "6px 0 0", fontSize: 11.5, color: varIngresos >= 0 ? "#9FD8A8" : "#E3A08C" }}>
            {varIngresos >= 0 ? "▲" : "▼"} {Math.abs(varIngresos).toFixed(0)}% vs {etiquetaAnterior}
          </p>
        </div>
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Pago a paseadores</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: RUST, fontFamily: "Georgia, serif" }}>{fmtCLP(costosPeriodo)}</p>
        </div>
        <div style={{ background: utilidad >= 0 ? "#E7F0EA" : "#F5E4E0", borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: utilidad >= 0 ? "#2E5C41" : "#9C4B34", textTransform: "uppercase", letterSpacing: 0.5 }}>Utilidad estimada</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: utilidad >= 0 ? "#2E5C41" : "#9C4B34", fontFamily: "Georgia, serif" }}>{fmtCLP(utilidad)}</p>
        </div>
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Boletas emitidas</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{actual.cantidad}</p>
        </div>
        <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18 }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5 }}>Ticket promedio</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(promedioBoleta)}</p>
        </div>
      </div>
      <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: -18, marginBottom: 26 }}>
        La utilidad considera solo pagos a paseadores ya registrados como pagados en esta app — no incluye otros gastos del negocio.
      </p>

      <div className="howria-card" style={{ background: CREAM_SOFT, borderRadius: 10, padding: 18, marginBottom: 26 }}>
        <p style={{ ...label, marginBottom: 8 }}>Proyección del mes en curso (si se factura todo el plan habitual de cada cliente activo)</p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(proyeccionMes)}</p>
          <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Ya facturado este mes: {fmtCLP(facturadoEsteMes)} ({porcentajeFacturado}%)</p>
        </div>
      </div>

      <p style={label}>Ingresos por tipo de servicio {etiquetaPeriodo} (un cliente puede contar en más de un tipo)</p>
      <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 26 }}>
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
                <div key={c.nombre} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 14 }}>
                  <span style={{ color: INK }}>{i === 0 && "🏅 "}{c.nombre}</span>
                  <b style={{ color: NAVY }}>{fmtCLP(c.total)}</b>
                </div>
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
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 14 }}>
                  <span style={{ color: INK }}>{c.nombre} · {c.perro}</span>
                  <span style={{ color: RUST, fontSize: 12.5 }}>Pendiente</span>
                </div>
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

// ---------- Boletas de adiestramiento ----------
function BoletasAdiestramiento({ clientes, correlativo, setCorrelativo, onRegistrarBoleta }) {
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

  function generar() {
    if (!cliente || !cliente.nombre) return;
    const hoy = new Date();
    const nueva = {
      numero: correlativo,
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
      total,
      mensajePersonalizado: mensajePersonalizado.trim() || null,
      estado: "no_enviada",
      fecha: hoy.toLocaleDateString("es-CL"),
      fechaISO: hoy.toISOString(),
    };
    setEmitida(nueva);
    setCorrelativo((n) => n + 1);
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

  return (
    <div className="howria-split" style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 28 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>1. Cliente</h2>
        <label style={label} htmlFor="badiestramiento-numero">N° de boleta</label>
        <input id="badiestramiento-numero" type="number" value={correlativo} onChange={(e) => setCorrelativo(Number(e.target.value) || 0)} style={{ ...input, maxWidth: 140 }} />

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

        <div style={{ marginTop: 20, padding: "16px 18px", background: CREAM_SOFT, borderRadius: 8 }}>
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

        <button onClick={generar} disabled={!cliente || !cliente.nombre}
          style={{ ...botonPrincipal, marginTop: 20, opacity: !cliente ? 0.45 : 1 }}>
          Generar boleta N°{String(correlativo).padStart(3, "0")}
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
              <button onClick={descargarPDF} style={{ ...botonSecundario, borderColor: NAVY, color: NAVY }}>Descargar PDF</button>
              <button onClick={enviarWhatsapp} style={{ ...botonSecundario, borderColor: "#2F6A46", color: "#2F6A46" }}>Enviar por WhatsApp</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Facturas ----------
const FORMAS_PAGO = ["Transferencia", "Efectivo", "Webpay/Tarjeta", "Otro"];

function Facturas({ boletasEmitidas, setBoletasEmitidas, boletasAdiestramiento, setBoletasAdiestramiento, clientes, cargandoBoletas }) {
  const [filtroEstado, setFiltroEstado] = useState("todas");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [pagoPendienteNumero, setPagoPendienteNumero] = useState(null);
  const [editandoBoleta, setEditandoBoleta] = useState(null);
  const [fechaPagoForm, setFechaPagoForm] = useState("");
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);

  const todasLasBoletas = useMemo(() => [
    ...boletasEmitidas.map((b) => ({ ...b, _tipo: "paseo" })),
    ...boletasAdiestramiento.map((b) => ({ ...b, _tipo: "adiestramiento" })),
  ], [boletasEmitidas, boletasAdiestramiento]);

  function setterDe(tipo) {
    return tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  }

  function cambiarEstado(boleta, estado) {
    if (estado === "pagada" && boleta._tipo === "paseo") {
      setPagoPendienteNumero(boleta.numero);
      setFechaPagoForm(new Date().toISOString().slice(0, 10));
      setFormaPagoForm(FORMAS_PAGO[0]);
      return;
    }
    editarBoleta(setterDe(boleta._tipo), boleta.numero, estado === "pagada" ? { estado } : { estado, fechaPago: undefined, formaPago: undefined });
  }

  function confirmarPago() {
    editarBoleta(setBoletasEmitidas, pagoPendienteNumero, { estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm });
    setPagoPendienteNumero(null);
  }

  const conteos = useMemo(() => {
    const c = { todas: todasLasBoletas.length };
    ESTADOS_FACTURA.forEach((e) => { c[e.id] = todasLasBoletas.filter((b) => b.estado === e.id).length; });
    return c;
  }, [todasLasBoletas]);

  const lista = useMemo(() => {
    return todasLasBoletas
      .filter((b) => filtroEstado === "todas" || b.estado === filtroEstado)
      .filter((b) => filtroCliente === "todos" || b.cliente === filtroCliente)
      .filter((b) => !desde || fechaKey(new Date(b.fechaISO)) >= desde)
      .filter((b) => !hasta || fechaKey(new Date(b.fechaISO)) <= hasta)
      .filter((b) => !busqueda.trim() || b.cliente.toLowerCase().includes(busqueda.trim().toLowerCase()) || (b.perro || "").toLowerCase().includes(busqueda.trim().toLowerCase()))
      .sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
  }, [todasLasBoletas, filtroEstado, filtroCliente, desde, hasta, busqueda]);

  const totalListado = lista.reduce((acc, b) => acc + b.total, 0);
  const nombresClientes = [...new Set(todasLasBoletas.map((b) => b.cliente))];

  return (
    <div className="howria-card" style={tarjeta}>
      <h2 style={sectionTitle}>Facturas</h2>
      <p style={hint}>Todas las boletas generadas por el sistema, con quién es cada una y en qué estado de pago se encuentra.</p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "16px 0" }}>
        <button onClick={() => setFiltroEstado("todas")}
          style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12.5, cursor: "pointer",
            border: filtroEstado === "todas" ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
            background: filtroEstado === "todas" ? NAVY : "#FFFFFF", color: filtroEstado === "todas" ? CREAM : INK,
            fontWeight: filtroEstado === "todas" ? 600 : 400 }}>
          Todas ({conteos.todas})
        </button>
        {ESTADOS_FACTURA.map((e) => (
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
        <input placeholder="Buscar por cliente o perro..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, marginBottom: 0 }} />
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

      {pagoPendienteNumero && (
        <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 600, color: "#2F6A46" }}>Confirmar pago de la boleta N°{String(pagoPendienteNumero).padStart(3, "0")}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <input type="date" value={fechaPagoForm} onChange={(e) => setFechaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 160 }} />
            <select value={formaPagoForm} onChange={(e) => setFormaPagoForm(e.target.value)} style={{ ...input, marginBottom: 0, width: 180 }}>
              {FORMAS_PAGO.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
            <button onClick={confirmarPago} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Confirmar</button>
            <button onClick={() => setPagoPendienteNumero(null)} style={botonSecundario}>Cancelar</button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
          <thead>
            <tr style={{ textAlign: "left", color: "#8A7E5C", fontSize: 11.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
              <th style={{ padding: "8px 10px" }}>N°</th>
              <th style={{ padding: "8px 10px" }}>Tipo</th>
              <th style={{ padding: "8px 10px" }}>Cliente</th>
              <th style={{ padding: "8px 10px" }}>Perro</th>
              <th style={{ padding: "8px 10px" }}>Período</th>
              <th style={{ padding: "8px 10px" }}>Emitida</th>
              <th style={{ padding: "8px 10px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "8px 10px" }}>Estado</th>
              <th style={{ padding: "8px 10px" }}>Pago</th>
              <th style={{ padding: "8px 10px" }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargandoBoletas ? (
              <tr><td colSpan={10} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>Cargando facturas…</td></tr>
            ) : (
              <>
                {lista.map((b) => {
                  const est = ESTADOS_FACTURA.find((e) => e.id === b.estado) || ESTADOS_FACTURA[0];
                  const claveFila = `${b._tipo}-${b.numero}`;
                  return (
                    <React.Fragment key={claveFila}>
                      <tr style={{ borderTop: "1px solid #EDE4CE" }}>
                        <td style={{ padding: "10px" }}>{String(b.numero).padStart(3, "0")}</td>
                        <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b._tipo === "paseo" ? "Paseo" : "Adiestramiento"}</td>
                        <td style={{ padding: "10px", color: NAVY, fontWeight: 600 }}>{b.cliente}</td>
                        <td style={{ padding: "10px" }}>{b.perro ? `🐾 ${b.perro}` : "—"}</td>
                        <td style={{ padding: "10px" }}>{b._tipo === "paseo" ? `${b.mes} ${b.anio}` : `Adiestramiento · ${b.modalidad}`}</td>
                        <td style={{ padding: "10px", color: "#8A7E5C" }}>{b.fecha}</td>
                        <td style={{ padding: "10px", textAlign: "right", fontWeight: 600 }}>{fmtCLP(b.total)}</td>
                        <td style={{ padding: "10px" }}>
                          <select value={b.estado} onChange={(e) => cambiarEstado(b, e.target.value)}
                            style={{ border: "none", borderRadius: 20, padding: "6px 10px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", background: est.bg, color: est.color }}>
                            {ESTADOS_FACTURA.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: "10px", fontSize: 12, color: "#8A7E5C" }}>{b.estado === "pagada" && b.formaPago ? `${b.formaPago} · ${b.fechaPago}` : "—"}</td>
                        <td style={{ padding: "10px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            {b.estado === "no_enviada" && (
                              <button onClick={() => aceptarBoleta(setterDe(b._tipo), b.numero)} style={{ border: "none", background: "none", color: "#2F6A46", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Aceptar</button>
                            )}
                            <button onClick={() => setEditandoBoleta(editandoBoleta === claveFila ? null : claveFila)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>Editar</button>
                            <BotonEliminar onConfirm={() => eliminarBoleta(setterDe(b._tipo), b.numero)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12 }} />
                          </div>
                        </td>
                      </tr>
                      {editandoBoleta === claveFila && (
                        <tr>
                          <td colSpan={10} style={{ padding: "0 10px 12px" }}>
                            <EditorBoletaBasico boleta={b} tipo={b._tipo}
                              onGuardar={(cambios) => { editarBoleta(setterDe(b._tipo), b.numero, cambios); setEditandoBoleta(null); }}
                              onCancelar={() => setEditandoBoleta(null)} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
                {lista.length === 0 && (
                  <tr><td colSpan={10} style={{ padding: "20px 10px", color: "#9A9179", textAlign: "center" }}>No hay facturas que coincidan.</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Panel admin (usuarios) ----------
function PanelAdmin({ usuarios, setUsuarios, clientes, setClientes, usuarioActual, permisosRoles, actualizarPermisoRol, notificacionesRoles, actualizarNotificacionRol, esAdmin, cargandoUsuarios, loginsPendientes, setLoginsPendientes }) {
  const [busqueda, setBusqueda] = useState("");
  const [editandoId, setEditandoId] = useState(null);
  const [nombreEditado, setNombreEditado] = useState("");
  const [borrarId, setBorrarId] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: "", rol: "coordinador" });
  const [creando, setCreando] = useState(false);
  const [credencialesNuevo, setCredencialesNuevo] = useState(null);
  const [capacitacionAbiertaId, setCapacitacionAbiertaId] = useState(null);

  const filtrados = usuarios.filter((u) => u.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  function clientesDe(nombre) {
    return clientes.filter((c) => c.paseadorNombre === nombre).length;
  }

  function actualizarRol(id, rol) {
    setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, rol } : u)));
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
    setUsuarios((prev) => [...prev, { id: Date.now(), nombre: l.nombre, rol: "coordinador", email: l.email }]);
    quitarLoginPendiente(l.id);
    showToast(`${l.nombre} fue restaurado — ajusta su rol en la lista de arriba si "coordinador" no es el que le corresponde.`);
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
    setUsuarios((prev) => [...prev, { id: Date.now(), nombre: nombreNuevo, rol: nuevo.rol, email }]);
    setCredencialesNuevo({ nombre: nombreNuevo, email, password });
    setNuevo({ nombre: "", rol: "coordinador" });
    setCreando(false);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Permisos por rol — qué pestañas ve cada uno</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 16 }}>
          Marca o desmarca las pestañas que puede ver cada rol. Los cambios se aplican al instante — la próxima vez que esa persona entre (o recargue la página) va a ver el menú actualizado.
        </p>
        {!permisosRoles ? (
          <p style={{ fontSize: 13, color: "#8A7E5C" }}>Cargando permisos...</p>
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
          <p style={{ fontSize: 13, color: "#8A7E5C" }}>Cargando notificaciones...</p>
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
          {cargandoUsuarios && <p style={{ color: "#8A7E5C", fontSize: 13.5 }}>Cargando usuarios…</p>}
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

                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12.5, color: "#6B6248" }}>{clientesDe(u.nombre)} cliente(s) asignado(s)</span>
                    <button onClick={() => setCapacitacionAbiertaId(capacitacionAbiertaId === u.id ? null : u.id)}
                      style={{ border: "1px solid #E4DBC3", background: "none", color: NAVY, borderRadius: 6, padding: "7px 10px", fontSize: 12, cursor: "pointer" }}>
                      Capacitación {(u.capacitacionCompletada || []).length}/{PASOS_CAPACITACION.length} {capacitacionAbiertaId === u.id ? "▴" : "▾"}
                    </button>
                    <select value={u.rol} onChange={(e) => actualizarRol(u.id, e.target.value)} style={{ ...input, marginBottom: 0, width: 170, padding: "8px 10px", fontSize: 13 }}>
                      <option value="entrenador">Entrenador</option>
                      <option value="coordinador">Coordinador</option>
                      <option value="administrador">Administrador general</option>
                    </select>
                    {borrarId === u.id ? (
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => confirmarBorrar(u)} style={{ border: "none", background: RUST, color: "#fff", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Confirmar</button>
                        <button onClick={() => setBorrarId(null)} style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "8px 12px", fontSize: 12, cursor: "pointer" }}>Cancelar</button>
                      </div>
                    ) : (
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

        <p style={{ fontSize: 12, color: "#8A7E5C", marginTop: 14, lineHeight: 1.5 }}>
          Nota: eliminar aquí quita el acceso de esta persona a la app, pero su cuenta de acceso sigue existiendo en Supabase → Authentication → Users — bórrala también ahí si quieres cerrarla por completo. Para restablecer una contraseña, hazlo desde esa misma pantalla de Supabase. Cambiar el nombre (✎) no cambia su correo de acceso, así que puede seguir entrando con la misma contraseña de siempre.
        </p>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Agregar usuario</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 14 }}>
          Para dar de alta un entrenador con clientes asignados, usa la pestaña "Ingreso personal nuevo". Este formulario es para agregar rápido a alguien sin asignarle clientes (ej. un coordinador o administrador).
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input placeholder="Nombre completo" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} style={{ ...input, flex: 1, minWidth: 200, marginBottom: 0 }} />
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })} style={{ ...input, marginBottom: 0, width: 190 }}>
            <option value="coordinador">Coordinador</option>
            <option value="entrenador">Entrenador</option>
            <option value="administrador">Administrador general</option>
          </select>
          <button onClick={agregar} disabled={!nuevo.nombre.trim() || creando} style={{ ...botonPrincipal, width: "auto", padding: "0 22px", opacity: !nuevo.nombre.trim() || creando ? 0.5 : 1 }}>
            {creando ? "Creando cuenta..." : "Agregar"}
          </button>
        </div>
        {credencialesNuevo && (
          <div style={{ marginTop: 14, padding: "14px 16px", background: "#D8ECDE", border: "1px solid #2F6A46", borderRadius: 8, fontSize: 13, color: "#2F6A46", lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ Cuenta creada para {credencialesNuevo.nombre} — pásale estos datos para que pueda entrar:</p>
            <p style={{ margin: 0 }}>Correo: <b>{credencialesNuevo.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{credencialesNuevo.password}</b></p>
            <button onClick={() => navigator.clipboard.writeText(`Correo: ${credencialesNuevo.email}\nContraseña: ${credencialesNuevo.password}`)}
              style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
          </div>
        )}
      </div>

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
    </div>
  );
}

// ---------- Pago a trabajadores ----------
function calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda = [], prospectos = [] }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dow = (hoy.getDay() + 6) % 7;
  const hoyStr0 = fechaKey(hoy);
  const avisos = [];

  const pendientes = boletasEmitidas.filter((b) => b.estado === "pendiente_pago" || b.estado === "no_enviada");
  const montoPendiente = pendientes.reduce((acc, b) => acc + b.total, 0);
  if (pendientes.length > 0) {
    avisos.push({ tipo: "factura", icono: "💰", texto: `${pendientes.length} boleta(s) por cobrar — ${fmtCLP(montoPendiente)}`, clave: `factura-${pendientes.length}-${montoPendiente}` });
  }

  const clientesHoy = clientes.filter((c) => c.diasHabituales?.includes(dow));
  const sinMarcar = clientesHoy.filter((c) => { const r = registroPaseos[`${c.id}_${fechaKey(hoy)}`]; return !r?.realizado && !r?.cancelado; });
  if (sinMarcar.length > 0) {
    avisos.push({ tipo: "paseo", icono: "🐾", texto: `${sinMarcar.length} paseo(s) de hoy sin marcar como realizado`, detalle: sinMarcar.map((c) => `${c.nombre} (${c.paseadorNombre || "sin paseador"})`).join(", "), clave: `paseo-${hoyStr0}-${sinMarcar.length}` });
  }

  const tareasHoy = tareasEquipo.filter((t) => fechaKey(new Date(t.fechaISO)) === fechaKey(hoy) && t.estado !== "hecho");
  if (tareasHoy.length > 0) {
    avisos.push({ tipo: "tarea", icono: "📋", texto: `${tareasHoy.length} tarea(s) del equipo pendiente(s) para hoy`, clave: `tarea-${hoyStr0}-${tareasHoy.length}` });
  }

  const sinPaseador = clientes.filter((c) => !c.paseadorNombre);
  if (sinPaseador.length > 0) {
    avisos.push({ tipo: "asignacion", icono: "⚠️", texto: `${sinPaseador.length} cliente(s) sin paseador asignado`, clave: `asignacion-${sinPaseador.length}` });
  }

  const necesitanEvaluacion = clientes.filter((c) => c.tipoServicio?.includes("evaluacion") && !citasAgenda.some((cita) => cita.clienteId === c.id && cita.estado === "agendada"));
  if (necesitanEvaluacion.length > 0) {
    avisos.push({ tipo: "evaluacion", icono: "📅", texto: `${necesitanEvaluacion.length} cliente(s) con evaluación pendiente de agendar`, clave: `evaluacion-${necesitanEvaluacion.length}` });
  }

  const hoyStr = fechaKey(hoy);
  const prospectosVencidos = prospectos.filter((p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido");
  if (prospectosVencidos.length > 0) {
    avisos.push({ tipo: "prospecto", icono: "📞", texto: `${prospectosVencidos.length} prospecto(s) con seguimiento pendiente`, clave: `prospecto-${hoyStr}-${prospectosVencidos.length}` });
  }

  return avisos;
}

function rangoPeriodo(periodo, hoy) {
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

function PagoTrabajadores({ boletasEmitidas, clientes, usuarios, registroPaseos, pagosRegistrados, setPagosRegistrados, cargandoPagos }) {
  const [periodo, setPeriodo] = useState("semana");
  const [ajustes, setAjustes] = useState({});
  const hoy = new Date();
  const { desde, hasta, etiqueta } = rangoPeriodo(periodo, hoy);
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();

  function claveAjuste(paseador) {
    return `${paseador}|${periodo}|${etiqueta}`;
  }

  function actualizarAjuste(paseador, valor) {
    setAjustes((prev) => ({ ...prev, [claveAjuste(paseador)]: Number(valor) || 0 }));
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
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <p style={{ ...hint, margin: 0 }}>💚 Asegurado (cliente ya pagó): <b style={{ color: "#2F6A46" }}>{fmtCLP(totalAsegurado)}</b></p>
        <p style={{ ...hint, margin: 0 }}>🕓 Proyectado (falta cobrar/confirmar): <b style={{ color: "#8A6A1E" }}>{fmtCLP(totalProyectado)}</b></p>
      </div>

      <div style={{ overflowX: "auto", marginBottom: 30 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
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
                        <span style={{ fontSize: 12, color: "#2F6A46", background: "#D8ECDE", padding: "6px 12px", borderRadius: 20, fontWeight: 600 }}>Pagado el {pagado.fechaPago}</span>
                      ) : (
                        <button onClick={() => marcarPagado(r)} disabled={r.monto === 0}
                          style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, opacity: r.monto === 0 ? 0.4 : 1 }}>
                          Marcar como pagado
                        </button>
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
        <p style={{ ...hint, marginTop: 8 }}>Cargando historial de pagos…</p>
      ) : historial.length === 0 ? (
        <p style={{ ...hint, marginTop: 8 }}>Todavía no se ha marcado ningún pago.</p>
      ) : (
        <div>
          {historial.map((p) => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
              <span style={{ color: INK }}>{p.paseador} · {p.periodo === "semana" ? "semana" : "mes"} {p.etiqueta} · pagado el {p.fechaPago}</span>
              <b style={{ color: NAVY }}>{fmtCLP(p.monto)}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Mis paseos (registro del paseador) ----------
function fechaKey(d) {
  return d.toISOString().slice(0, 10);
}

function MisPaseos({ clientes, registroPaseos, setRegistroPaseos, user, usuarios }) {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const [semanaOffset, setSemanaOffset] = useState(0);
  const [notaAbiertaId, setNotaAbiertaId] = useState(null);
  const [notaTexto, setNotaTexto] = useState("");

  const miUsuario = usuarios.find((u) => u.email === user.email) || user;
  const misClientes = clientes.filter((c) => c.paseadorNombre === user.nombre);

  const inicioSemanaVista = useMemo(() => {
    const base = inicioSemana(hoy);
    base.setDate(base.getDate() + semanaOffset * 7);
    return base;
  }, [semanaOffset]);

  const diasSemanaVista = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicioSemanaVista);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [inicioSemanaVista]);

  const resumenPorDiaSemana = diasSemanaVista.map((d, i) => {
    const clientesDia = misClientes.filter((c) => c.diasHabituales?.includes(i));
    const realizados = clientesDia.filter((c) => registroPaseos[`${c.id}_${fechaKey(d)}`]?.realizado).length;
    const cancelados = clientesDia.filter((c) => registroPaseos[`${c.id}_${fechaKey(d)}`]?.cancelado).length;
    return { fecha: d, total: clientesDia.length, realizados, cancelados };
  });
  const totalSemana = resumenPorDiaSemana.reduce((acc, d) => acc + d.total, 0);
  const realizadosSemana = resumenPorDiaSemana.reduce((acc, d) => acc + d.realizados, 0);
  const canceladosSemana = resumenPorDiaSemana.reduce((acc, d) => acc + d.cancelados, 0);
  const pendientesSemana = totalSemana - realizadosSemana - canceladosSemana;

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

  const [diaSeleccionado, setDiaSeleccionado] = useState(() => {
    const idxHoy = (hoy.getDay() + 6) % 7;
    return idxHoy;
  });
  const diaActivo = diasSemanaVista[diaSeleccionado];
  const dow = diaSeleccionado;
  const clientesDelDia = misClientes.filter((c) => c.diasHabituales?.includes(dow));

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

  if (misClientes.length === 0) {
    return (
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Mis paseos</h2>
        <p style={{ ...hint, marginTop: 8 }}>Todavía no tienes clientes asignados como paseador. Pídele al administrador que te asigne clientes en la pestaña "Clientes".</p>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Mis paseos</h2>
            <p style={hint}>
              {misClientes.length} cliente(s) asignado(s) · Capacitación {(miUsuario.capacitacionCompletada || []).length}/{PASOS_CAPACITACION.length}
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setSemanaOffset((s) => s - 1)} style={botonSecundario}>← Semana anterior</button>
            <button onClick={() => setSemanaOffset(0)} disabled={semanaOffset === 0} style={{ ...botonSecundario, opacity: semanaOffset === 0 ? 0.5 : 1 }}>Esta semana</button>
            <button onClick={() => setSemanaOffset((s) => Math.min(s + 1, 0))} disabled={semanaOffset >= 0} style={{ ...botonSecundario, opacity: semanaOffset >= 0 ? 0.5 : 1 }}>Semana siguiente →</button>
          </div>
        </div>

        <p style={{ ...label, marginTop: 18 }}>Mi semana</p>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
          <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 14 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#9BAAB8" }}>Programados</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700 }}>{totalSemana}</p>
          </div>
          <div style={{ background: "#E7F0EA", borderRadius: 10, padding: 14 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#2E5C41" }}>Realizados</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: "#2E5C41" }}>{realizadosSemana}</p>
          </div>
          <div style={{ background: CREAM_SOFT, borderRadius: 10, padding: 14 }}>
            <p style={{ margin: "0 0 4px", fontSize: 11.5, color: "#8A7E5C" }}>Pendientes</p>
            <p style={{ margin: 0, fontSize: 21, fontWeight: 700, color: RUST }}>{pendientesSemana}{canceladosSemana > 0 ? ` (${canceladosSemana} cancelado(s))` : ""}</p>
          </div>
        </div>
        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 20 }}>
          {resumenPorDiaSemana.map((d, i) => {
            const esHoyCol = fechaKey(d.fecha) === fechaKey(hoy);
            return (
              <div key={i} style={{ textAlign: "center", padding: "8px 4px", borderRadius: 8, background: esHoyCol ? NAVY : CREAM_SOFT }}>
                <p style={{ margin: 0, fontSize: 10.5, color: esHoyCol ? "#9BAAB8" : "#8A7E5C" }}>{DIAS_SEMANA[i]} {d.fecha.getDate()}</p>
                <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: esHoyCol ? CREAM : NAVY }}>{d.realizados}/{d.total}</p>
              </div>
            );
          })}
        </div>

        <p style={label}>Detalle del día</p>
        <div style={{ display: "flex", gap: 6, marginTop: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {diasSemanaVista.map((d, i) => {
            const esHoy = fechaKey(d) === fechaKey(hoy);
            const esFuturo = d > hoy;
            return (
              <button key={i} onClick={() => setDiaSeleccionado(i)} disabled={esFuturo}
                style={{
                  padding: "10px 6px", minWidth: 66, borderRadius: 8, cursor: esFuturo ? "default" : "pointer", textAlign: "center",
                  border: diaSeleccionado === i ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                  background: diaSeleccionado === i ? NAVY : "#FFFFFF",
                  color: diaSeleccionado === i ? CREAM : (esFuturo ? "#C9C3A8" : INK),
                  opacity: esFuturo ? 0.6 : 1,
                }}>
                <div style={{ fontSize: 11, textTransform: "uppercase" }}>{DIAS_SEMANA[i]}</div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{d.getDate()}</div>
                {esHoy && <div style={{ fontSize: 9, color: diaSeleccionado === i ? GOLD : "#C9A24B", marginTop: 2 }}>HOY</div>}
              </button>
            );
          })}
        </div>

        <p style={label}>Clientes programados este día</p>
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
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
        <h2 style={sectionTitle}>Mis clientes y horarios ({misClientes.length})</h2>
        <p style={hint}>Tu horario completo, para tenerlo siempre a mano.</p>
        <div style={{ overflowX: "auto", marginTop: 12 }}>
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
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Mi capacitación</h2>
        <p style={hint}>La marca tu coordinador o administrador a medida que la vas completando.</p>
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
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Resumen del mes — {MESES[mesActual]} {anioActual}</h2>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, margin: "16px 0 22px" }}>
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
        <p style={hint}>Los días marcados "cliente canceló" no cuentan en tu meta ni en tu pago.</p>

        <p style={label}>Detalle por cliente</p>
        <div>
          {resumenMensual.map((r) => (
            <div key={r.cliente.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
              <span style={{ color: INK }}>{r.cliente.nombre} · {r.cliente.perro}</span>
              <span style={{ color: "#8A7E5C" }}>{r.realizados} / {r.programados} paseos</span>
              <b style={{ color: NAVY }}>{fmtCLP(r.monto)}</b>
            </div>
          ))}
        </div>
      </div>
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

function Coordinacion({ clientes, setClientes, usuarios, registroPaseos, setRegistroPaseos, setTab, setMapaPaseadorSel }) {
  const [paseadorSel, setPaseadorSel] = useState(usuarios[0]?.nombre || "");
  const [busqueda, setBusqueda] = useState("");
  const [diaOffset, setDiaOffset] = useState(0);
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dowHoy = (hoy.getDay() + 6) % 7;
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

  // carga semanal comparada entre paseadores
  const cargaPorPaseador = usuarios.map((u) => {
    const total = clientes.filter((c) => c.paseadorNombre === u.nombre).reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
    return { nombre: u.nombre, total };
  }).sort((a, b) => b.total - a.total);
  const maxCarga = Math.max(1, ...cargaPorPaseador.map((p) => p.total));

  const sinPaseador = clientes.filter((c) => !c.paseadorNombre);

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
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Calendario del día</h2>
            <p style={hint}>Quién pasea a quién, a qué hora, y si ya se hizo — ordenado por paseador.</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setDiaOffset((d) => d - 1)} style={botonSecundario}>← Día anterior</button>
            <button onClick={() => setDiaOffset(0)} disabled={diaOffset === 0} style={{ ...botonSecundario, opacity: diaOffset === 0 ? 0.5 : 1 }}>Hoy</button>
            <button onClick={() => setDiaOffset((d) => d + 1)} style={botonSecundario}>Día siguiente →</button>
          </div>
        </div>
        <p style={{ ...hint, marginTop: 10 }}>
          <b style={{ color: NAVY }}>{DIAS_LARGOS[dowVista]} {diaVista.toLocaleDateString("es-CL", { day: "numeric", month: "long" })}</b>
        </p>

        {calendarioPorPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 12 }}>No hay paseos programados este día.</p>
        ) : (
          <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
            {calendarioPorPaseador.map(({ paseador, items }) => {
              const hechos = items.filter((i) => i.estado === "realizado").length;
              return (
                <div key={paseador} style={{ border: "1px solid #E4DBC3", borderRadius: 10, padding: 14, background: "#FFFFFF" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                    <span style={{ fontWeight: 700, color: NAVY, fontSize: 14.5 }}>{paseador} <span style={{ fontWeight: 400, color: "#8A7E5C", fontSize: 12.5 }}>· {hechos}/{items.length} hecho(s)</span></span>
                    {paseador !== "Sin asignar" && (
                      <button onClick={() => irAMapa(paseador)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Ver ruta en el mapa →</button>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {items.map(({ cliente: c, estado, nota, atrasado }) => {
                      const colorEstado = estado === "realizado" ? "#2F6A46" : estado === "cancelado" ? RUST : atrasado ? RUST : "#8A6A1E";
                      const bgEstado = estado === "realizado" ? "#D8ECDE" : estado === "cancelado" ? "#F1DCD2" : atrasado ? "#F1DCD2" : "#F3E3B4";
                      const textoEstado = estado === "realizado" ? "Realizado" : estado === "cancelado" ? "Cancelado" : atrasado ? "⚠️ Atrasado" : "Pendiente";
                      return (
                        <div key={c.id} style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 10, padding: "8px 10px", background: atrasado ? "#FBEEEA" : CREAM_SOFT, borderRadius: 8 }}>
                          <span style={{ fontSize: 12.5, color: NAVY, fontWeight: 600, width: 52, flexShrink: 0 }}>{c.horaHabitual || "—"}</span>
                          <span style={{ fontSize: 13, color: INK, flex: "1 1 160px" }}>{c.nombre} · 🐾 {c.perro}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: bgEstado, color: colorEstado, flexShrink: 0 }}>{textoEstado}</span>
                          <select defaultValue="" onChange={(e) => { if (e.target.value) asignarPaseadorRapido(c.id, e.target.value); e.target.value = ""; }} style={{ fontSize: 11.5, padding: "4px 6px", borderRadius: 6, border: "1px solid #E4DBC3", flexShrink: 0 }}>
                            <option value="">Reasignar...</option>
                            {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                          </select>
                          <button onClick={() => toggleRealizadoDia(c.id, diaVista)} disabled={diaVista > hoy}
                            style={{ border: "none", background: "none", color: estado === "realizado" ? "#8A7E5C" : "#2F6A46", cursor: diaVista > hoy ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                            {estado === "realizado" ? "Desmarcar" : "Marcar realizado"}
                          </button>
                          <button onClick={() => toggleCanceladoDia(c.id, diaVista)}
                            style={{ border: "none", background: "none", color: estado === "cancelado" ? "#8A7E5C" : RUST, cursor: "pointer", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
                            {estado === "cancelado" ? "Desmarcar" : "Cancelar"}
                          </button>
                          <input defaultValue={nota} placeholder="nota..." onBlur={(e) => guardarNotaDia(c.id, diaVista, e.target.value)}
                            style={{ fontSize: 11.5, padding: "4px 6px", border: "1px solid #E4DBC3", borderRadius: 6, flex: "1 1 120px", minWidth: 90 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Control diario y semanal</h2>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 18 }}>
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
        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Paseos programados por día, esta semana</p>
        <div className="howria-week" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 22 }}>
          {resumenSemana.map((d, i) => (
            <div key={i} style={{ textAlign: "center", padding: "10px 4px", borderRadius: 8, background: i === dowHoy ? NAVY : CREAM_SOFT }}>
              <p style={{ margin: 0, fontSize: 11, color: i === dowHoy ? "#9BAAB8" : "#8A7E5C" }}>{d.dia.slice(0, 3)}</p>
              <p style={{ margin: "4px 0 0", fontSize: 16, fontWeight: 700, color: i === dowHoy ? CREAM : NAVY }}>{d.total}</p>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 12, color: "#8A7E5C", margin: "0 0 8px" }}>Carga semanal por paseador (total de paseos/semana)</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {cargaPorPaseador.map((p) => (
            <div key={p.nombre} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12.5, color: INK, width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.nombre}</span>
              <div style={{ flex: 1, background: CREAM_SOFT, borderRadius: 6, height: 16, overflow: "hidden" }}>
                <div style={{ width: `${(p.total / maxCarga) * 100}%`, height: "100%", background: p.total > UMBRAL_SOBRECARGA * 5 ? RUST : NAVY, borderRadius: 6 }} />
              </div>
              <span style={{ fontSize: 12, color: "#8A7E5C", width: 30, textAlign: "right", flexShrink: 0 }}>{p.total}</span>
            </div>
          ))}
        </div>
      </div>

      {sinPaseador.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#FBEFE3", border: "1px solid #E8CBA0" }}>
          <h2 style={{ ...sectionTitle, color: "#8A5A22" }}>⚠️ Clientes sin paseador ({sinPaseador.length})</h2>
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

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Horario semanal por paseador</h2>
        <p style={{ fontSize: 13, color: "#6B6248", marginTop: -8, marginBottom: 14 }}>
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
              <div key={dow} style={{ border: sobrecargado ? `1.5px solid ${RUST}` : "1px solid #E4DBC3", borderRadius: 8, padding: 10, background: dow === dowHoy ? "#FBF6E9" : "#fff" }}>
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
                        <button onClick={() => toggleDiaCliente(c.id, dow)} title="Quitar de este día" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 13, flexShrink: 0, marginLeft: 4 }}>×</button>
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
      </div>

      <div>
        <h2 style={{ ...sectionTitle, marginBottom: 16 }}>Reasignar cliente a otro paseador</h2>
        <Asignaciones clientes={clientes} setClientes={setClientes} usuarios={usuarios} />
      </div>
    </div>
  );
}

function Asignaciones({ clientes, setClientes, usuarios }) {
  const paseadoresDisponibles = usuarios;

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

  const sinAsignar = clientes.filter((c) => !c.paseadorNombre).length;

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
                    <select value={c.paseadorNombre || ""} onChange={(e) => asignarPaseador(c.id, e.target.value)}
                      style={{ ...input, marginBottom: 0, padding: "8px 10px", fontSize: 13 }}>
                      <option value="">Sin asignar</option>
                      {paseadoresDisponibles.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
                    </select>
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
function MapaRutas({ clientes, setClientes, usuarios, paseadorId: paseadorIdProp, setPaseadorId }) {
  const paseadores = usuarios;
  const paseadorId = paseadorIdProp || paseadores[0]?.nombre || "";
  const [incluidos, setIncluidos] = useState({});
  const [velocidad, setVelocidad] = useState(20);
  const [duracionParada, setDuracionParada] = useState(25);
  const [ruta, setRuta] = useState(null);
  const [geocodificando, setGeocodificando] = useState(null);
  const [errorGeo, setErrorGeo] = useState("");

  const clientesDelPaseador = clientes.filter((c) => c.paseadorNombre === paseadorId);

  function toggleIncluido(id) {
    setIncluidos((prev) => ({ ...prev, [id]: !prev[id] }));
    setRuta(null);
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

  const origen = origenMapa();
  const anchoMapa = MAPA_TILES_ANCHO * 256, altoMapa = MAPA_TILES_ALTO * 256;
  const tiles = [];
  for (let i = 0; i < MAPA_TILES_ANCHO; i++) {
    for (let j = 0; j < MAPA_TILES_ALTO; j++) {
      tiles.push({ x: i * 256, y: j * 256, url: `https://tile.openstreetmap.org/${MAPA_ZOOM}/${origen.tileX + i}/${origen.tileY + j}.png` });
    }
  }

  const clientesConMapa = clientes.filter((c) => c.lat && c.lng);

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

        <p style={label}>Clientes de {paseadorId || "este paseador"}</p>
        {clientesDelPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Este paseador no tiene clientes asignados (ve a "Asignaciones").</p>
        ) : (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            {clientesDelPaseador.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: incluidos[c.id] ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", flex: 1 }}>
                  <input type="checkbox" checked={!!incluidos[c.id]} onChange={() => toggleIncluido(c.id)} />
                  <span style={{ fontSize: 13.5 }}><b style={{ color: NAVY }}>{c.nombre}</b> · 🐾 {c.perro} · {c.direccion || "sin dirección"}</span>
                </label>
                {c.lat && c.lng ? (
                  <span style={{ fontSize: 11.5, color: "#2F6A46", fontWeight: 600 }}>✓ ubicado</span>
                ) : (
                  <button onClick={() => ubicarCliente(c)} disabled={!c.direccion || geocodificando === c.id} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>
                    {geocodificando === c.id ? "Buscando..." : "Ubicar en el mapa"}
                  </button>
                )}
              </div>
            ))}
          </div>
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
        <div style={{ position: "relative", width: "100%", overflow: "auto", borderRadius: 8, border: "1px solid #E4DBC3", background: "#EDE4CE" }}>
          <div style={{ position: "relative", width: anchoMapa, height: altoMapa }}>
            {tiles.map((t, i) => (
              <img key={i} src={t.url} alt="" style={{ position: "absolute", left: t.x, top: t.y, width: 256, height: 256 }} />
            ))}
            {clientesConMapa.map((c) => {
              const p = coordAPixel(c.lat, c.lng);
              const enRuta = c.paseadorNombre === paseadorId && incluidos[c.id];
              return (
                <div key={c.id} title={`${c.nombre} · ${c.perro}`}
                  style={{
                    position: "absolute", left: p.x - 9, top: p.y - 9, width: 18, height: 18, borderRadius: "50%",
                    background: enRuta ? GOLD : NAVY, border: "2px solid #FFFFFF", boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
                  }} />
              );
            })}
          </div>
        </div>
        <p style={{ fontSize: 11, color: "#9A9179", marginTop: 8 }}>Mapa © colaboradores de OpenStreetMap. El punto dorado marca los clientes incluidos en la ruta calculada; el azul marino, los demás clientes ya ubicados.</p>
      </div>
    </div>
  );
}

// ---------- Ingreso de personal nuevo ----------
function IngresoPersonalNuevo({ clientes, setClientes, usuarios, setUsuarios }) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState("entrenador");
  const [fotoUrl, setFotoUrl] = useState(null);
  const [fechaInicio, setFechaInicio] = useState("");
  const [banco, setBanco] = useState("");
  const [tipoCuenta, setTipoCuenta] = useState("Cuenta corriente");
  const [numeroCuenta, setNumeroCuenta] = useState("");
  const [seleccionados, setSeleccionados] = useState([]);
  const [registrando, setRegistrando] = useState(false);
  const [credenciales, setCredenciales] = useState(null);

  const hoy = new Date();
  const mesActual = hoy.getMonth(), anioActual = hoy.getFullYear();

  function subirFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setFotoUrl(reader.result);
    reader.readAsDataURL(file);
  }

  function toggleCliente(id) {
    setSeleccionados((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const clientesElegidos = clientes.filter((c) => seleccionados.includes(c.id));

  const horarioPorDia = DIAS_SEMANA_LARGO.map((nombreDia, dow) => ({
    dia: nombreDia,
    clientes: clientesElegidos.filter((c) => c.diasHabituales?.includes(dow)),
  }));

  const paseosSemana = clientesElegidos.reduce((acc, c) => acc + (c.diasHabituales?.length || 0), 0);
  const gananciaSemanal = clientesElegidos.reduce((acc, c) => acc + (c.diasHabituales?.length || 0) * Number(c.tarifaPaseador || 0), 0);
  const gananciaMensual = clientesElegidos.reduce((acc, c) => {
    const paseosMes = diasSegunPlan(mesActual, anioActual, c.diasHabituales || []).length;
    return acc + paseosMes * Number(c.tarifaPaseador || 0);
  }, 0);

  async function registrar() {
    if (!nombre.trim() || (rol === "entrenador" && clientesElegidos.length === 0) || registrando) return;
    setRegistrando(true);
    const nombreNuevo = nombre.trim();
    const email = slugEmailUsuario(nombreNuevo);
    const { password, error } = await crearCuentaAcceso(email);
    if (error) {
      showToast(`No se pudo crear la cuenta de acceso: ${error.message}`);
      setRegistrando(false);
      return;
    }
    const nuevoUsuario = { id: Date.now(), nombre: nombreNuevo, rol, fotoUrl, fechaInicio, email, datosBancarios: { banco, tipoCuenta, numeroCuenta } };
    setUsuarios((prev) => [...prev, nuevoUsuario]);
    setClientes((prev) => prev.map((c) => (seleccionados.includes(c.id) ? { ...c, paseadorNombre: nuevoUsuario.nombre } : c)));
    const detalleClientes = clientesElegidos.length > 0 ? ` con ${clientesElegidos.length} cliente(s) asignado(s)` : "";
    setCredenciales({ nombre: nombreNuevo, email, password, detalleClientes });
    setNombre(""); setFotoUrl(null); setSeleccionados([]); setRol("entrenador"); setFechaInicio(""); setBanco(""); setNumeroCuenta("");
    setRegistrando(false);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Ingreso de personal nuevo</h2>
        <p style={hint}>Registra a un paseador o entrenador nuevo, asígnale clientes desde el inicio, y revisa su horario y ganancia estimada antes de confirmar.</p>

        {credenciales && (
          <div style={{ background: "#D8ECDE", border: "1px solid #2F6A46", color: "#2F6A46", borderRadius: 8, padding: "12px 16px", margin: "14px 0", fontSize: 13.5, lineHeight: 1.6 }}>
            <p style={{ margin: "0 0 8px", fontWeight: 600 }}>✓ {credenciales.nombre} quedó registrado{credenciales.detalleClientes} — pásale estos datos para que pueda entrar:</p>
            <p style={{ margin: 0 }}>Correo: <b>{credenciales.email}</b></p>
            <p style={{ margin: "4px 0 10px" }}>Contraseña: <b style={{ fontFamily: "monospace", fontSize: 14 }}>{credenciales.password}</b></p>
            <button onClick={() => navigator.clipboard.writeText(`Correo: ${credenciales.email}\nContraseña: ${credenciales.password}`)}
              style={{ ...botonSecundario, padding: "6px 14px", fontSize: 12 }}>Copiar datos</button>
          </div>
        )}

        <div className="howria-photo-row" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 20, marginTop: 16 }}>
          <div>
            <div style={{ width: 100, height: 100, borderRadius: "50%", background: fotoUrl ? `url(${fotoUrl}) center/cover` : "#E4DBC3", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#8A7E5C", textAlign: "center", overflow: "hidden" }}>
              {!fotoUrl && "Foto"}
            </div>
            <label style={{ ...botonSecundario, display: "inline-block", marginTop: 10, padding: "6px 10px", fontSize: 11, textAlign: "center", cursor: "pointer" }}>
              Subir foto
              <input type="file" accept="image/*" onChange={subirFoto} style={{ display: "none" }} />
            </label>
          </div>
          <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <input placeholder="Nombre del paseador" value={nombre} onChange={(e) => setNombre(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            <select value={rol} onChange={(e) => setRol(e.target.value)} style={{ ...input, marginBottom: 0 }}>
              <option value="entrenador">Paseador / Entrenador</option>
              <option value="coordinador">Coordinador</option>
              <option value="administrador">Administrador general</option>
            </select>
            <div>
              <label style={label} htmlFor="ingreso-fecha-inicio">Fecha de inicio de contrato</label>
              <input id="ingreso-fecha-inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            </div>
          </div>
        </div>

        <p style={{ ...label, marginTop: 22 }}>Acceso al sistema</p>
        <p style={{ fontSize: 13, color: "#6B6248", margin: "0 0 6px" }}>
          Correo de acceso (se genera solo): <b>{nombre.trim() ? slugEmailUsuario(nombre) : "—"}</b>
        </p>
        <p style={{ fontSize: 12.5, color: "#8A7E5C", margin: 0 }}>
          Al registrar, se crea sola la cuenta de acceso con ese correo — te va a mostrar una contraseña generada para que se la pases.
        </p>

        <p style={{ ...label, marginTop: 16 }}>Datos bancarios para el pago</p>
        <div className="howria-g3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 6 }}>
          <input placeholder="Banco" value={banco} onChange={(e) => setBanco(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <select value={tipoCuenta} onChange={(e) => setTipoCuenta(e.target.value)} style={{ ...input, marginBottom: 0 }}>
            <option>Cuenta corriente</option>
            <option>Cuenta vista</option>
            <option>Cuenta RUT</option>
          </select>
          <input placeholder="N° de cuenta" value={numeroCuenta} onChange={(e) => setNumeroCuenta(e.target.value)} style={{ ...input, marginBottom: 0 }} />
        </div>

        <p style={{ ...label, marginTop: 22 }}>Clientes a asignar</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10, marginBottom: 6 }}>
          {clientes.map((c) => (
            <label key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: seleccionados.includes(c.id) ? "#D8ECDE" : "#FFFFFF", border: "1px solid #E4DBC3", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
              <input type="checkbox" checked={seleccionados.includes(c.id)} onChange={() => toggleCliente(c.id)} />
              <span>{c.nombre} · 🐾 {c.perro} {c.paseadorNombre && <span style={{ color: "#8A7E5C", fontSize: 11.5 }}>(hoy: {c.paseadorNombre})</span>}</span>
            </label>
          ))}
        </div>
        <p style={hint}>Si un cliente ya tenía otro paseador asignado, al registrar quedará reasignado a este nuevo ingreso. Esto es solo para el ingreso inicial — para reasignar clientes más adelante, usa la pestaña "Asignaciones".</p>
      </div>

      {clientesElegidos.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Horario resultante</h2>
          <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
            {horarioPorDia.map((d) => (
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
              <p style={{ margin: 0, fontWeight: 700, color: NAVY, fontSize: 19 }}>{paseosSemana}</p>
            </div>
            <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia semanal estimada</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaSemanal)}</p>
            </div>
            <div style={{ background: NAVY, color: CREAM, borderRadius: 10, padding: 16 }}>
              <p style={{ margin: "0 0 6px", fontSize: 12, color: "#9BAAB8", textTransform: "uppercase" }}>Ganancia mensual estimada</p>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 19, fontFamily: "Georgia, serif" }}>{fmtCLP(gananciaMensual)}</p>
            </div>
          </div>
        </div>
      )}

      <button onClick={registrar} disabled={!nombre.trim() || (rol === "entrenador" && clientesElegidos.length === 0) || registrando}
        style={{ ...botonPrincipal, width: "auto", padding: "12px 28px", opacity: !nombre.trim() || clientesElegidos.length === 0 || registrando ? 0.45 : 1 }}>
        {registrando ? "Creando cuenta..." : "Registrar paseador y asignar clientes"}
      </button>
    </div>
  );
}

// ---------- Equipo (organización de trabajo interno) ----------
function EquipoTrabajo({ equipo, setEquipo, objetivos = [], setObjetivos, objetivosMensuales = [], setObjetivosMensuales, tareas = [], setTareas, cargando }) {
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
  const [nuevoMiembro, setNuevoMiembro] = useState("");

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

  function agregarMiembro() {
    if (!nuevoMiembro.trim() || equipo.some((p) => p.nombre === nuevoMiembro.trim())) return;
    setEquipo((prev) => [...prev, { id: Date.now(), nombre: nuevoMiembro.trim() }]);
    setNuevoMiembro("");
  }

  const progresoPorPersona = equipo.map((p) => {
    const suyas = tareasSemana.filter((t) => t.asignadoA === p.nombre);
    const hechas = suyas.filter((t) => t.estado === "hecho").length;
    return { persona: p.nombre, total: suyas.length, hechas };
  });
  const totalTareasSemana = tareasSemana.length;
  const totalHechasSemana = tareasSemana.filter((t) => t.estado === "hecho").length;
  const objetivosCumplidos = objetivosSemana.filter((o) => o.cumplido).length;

  if (cargando) {
    return <div className="howria-card" style={tarjeta}><p style={hint}>Cargando equipo…</p></div>;
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
          {equipo.map((persona) => (
            <span key={persona.id} style={{ padding: "6px 14px", borderRadius: 20, background: CREAM_SOFT, color: NAVY, fontSize: 13, fontWeight: 600 }}>{persona.nombre}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input placeholder="Agregar persona al equipo" value={nuevoMiembro} onChange={(e) => setNuevoMiembro(e.target.value)} style={{ ...input, marginBottom: 0, maxWidth: 260 }} />
          <button onClick={agregarMiembro} style={{ ...botonSecundario, padding: "8px 16px" }}>Agregar</button>
        </div>
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
                {equipo.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivo} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0 }}>Agregar</button>
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
                {equipo.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
              </select>
              <button onClick={agregarObjetivoMes} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0 }}>Agregar</button>
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
            {equipo.map((p) => <option key={p.id} value={p.nombre}>{p.nombre}</option>)}
          </select>
          <input placeholder="Enlace a documento (opcional)" value={enlaceTarea} onChange={(e) => setEnlaceTarea(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          <button onClick={agregarTarea} style={{ ...botonPrincipal, width: "auto", padding: "0 20px", marginTop: 0 }}>Agregar</button>
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
          <div key={p.persona} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
            <span style={{ color: INK }}>{p.persona}</span>
            <span style={{ color: "#8A7E5C" }}>{p.hechas} / {p.total} tareas</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Inicio (dashboard) ----------
function Inicio({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, objetivosSemanales, usuarios, citasAgenda, prospectos, setTab, user, tabs }) {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dow = (hoy.getDay() + 6) % 7;
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

  const pendientesCobro = boletasEmitidas.filter((b) => b.estado === "pendiente_pago" || b.estado === "no_enviada");
  const montoPendiente = pendientesCobro.reduce((acc, b) => acc + b.total, 0);

  const { desde, hasta } = rangoPeriodo("semana", hoy);
  const semanaKey = fechaKey(desde);
  const objetivosSemana = objetivosSemanales.filter((o) => o.semanaKey === semanaKey);
  const objetivosCumplidos = objetivosSemana.filter((o) => o.cumplido).length;

  const ingresosSemana = boletasEmitidas.filter((b) => { const f = new Date(b.fechaISO); return f >= desde && f < hasta; });
  const totalIngresosSemana = ingresosSemana.reduce((acc, b) => acc + b.total, 0);
  const dataGraficoSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(desde); d.setDate(d.getDate() + i);
    const total = boletasEmitidas.filter((b) => fechaKey(new Date(b.fechaISO)) === fechaKey(d)).reduce((acc, b) => acc + b.total, 0);
    return { etiqueta: DIAS_SEMANA[i], total };
  });

  const hoyStr = fechaKey(hoy);
  const prospectosVencidos = prospectos.filter((p) => p.proximoSeguimiento && p.proximoSeguimiento <= hoyStr && p.estado !== "ganado" && p.estado !== "perdido");
  const proximasCitas = citasAgenda.filter((c) => c.estado === "agendada" && new Date(c.fechaISO) >= hoy).sort((a, b) => new Date(a.fechaISO) - new Date(b.fechaISO)).slice(0, 4);

  const fechaLarga = hoy.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={{ ...tarjeta, background: NAVY, border: "none", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "rgba(201,150,47,0.12)" }} />
        <h2 style={{ ...sectionTitle, color: CREAM, fontSize: 22, position: "relative" }}>Hola, {user.nombre.split(" ")[0]} 🐾</h2>
        <p style={{ fontSize: 12.5, color: "#9BAAB8", margin: 0, textTransform: "capitalize", position: "relative" }}>{fechaLarga}</p>
      </div>

      {tabs && (
        <div className="howria-launcher-mobile" style={{ display: "none" }}>
          {ORDEN_GRUPOS.map((grupo) => {
            const tabsDelGrupo = tabs.filter((t) => t.grupo === grupo);
            if (tabsDelGrupo.length === 0) return null;
            return (
              <div key={grupo} className="howria-card" style={{ ...tarjeta, marginBottom: 14 }}>
                <p style={{ ...label, marginBottom: 12 }}>{grupo}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
                  {tabsDelGrupo.map((t) => {
                    const Icono = ICONOS_TAB[t.id] || Home;
                    return (
                      <button key={t.id} onClick={() => setTab(t.id)}
                        style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "8px 2px", border: "none", background: "none", cursor: "pointer", font: "inherit" }}>
                        <span style={{ width: 46, height: 46, borderRadius: 14, background: CREAM_SOFT, display: "flex", alignItems: "center", justifyContent: "center", color: NAVY, flex: "none" }}>
                          <Icono size={20} />
                        </span>
                        <span style={{ fontSize: 11, color: INK, textAlign: "center", lineHeight: 1.25 }}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

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

      <div className="howria-g4" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <button onClick={() => setTab("mis-paseos")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <p style={{ ...label, marginBottom: 8 }}>Paseos de hoy</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{realizadosHoy} / {clientesHoy.length}</p>
        </button>
        <button onClick={() => setTab("facturas")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <p style={{ ...label, marginBottom: 8 }}>Boletas por cobrar</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{fmtCLP(montoPendiente)}</p>
        </button>
        <button onClick={() => setTab("agenda")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <p style={{ ...label, marginBottom: 8 }}>Evaluaciones agendadas</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{citasAgenda.filter((c) => c.estado === "agendada").length}</p>
        </button>
        <button onClick={() => setTab("seguimiento")} className="howria-card" style={{ ...tarjeta, textAlign: "left", cursor: "pointer" }}>
          <p style={{ ...label, marginBottom: 8 }}>Prospectos por seguir</p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>{prospectosVencidos.length}</p>
        </button>
      </div>

      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={sectionTitle}>Ingresos de esta semana</h2>
          <b style={{ color: NAVY, fontSize: 16 }}>{fmtCLP(totalIngresosSemana)}</b>
        </div>
        <div style={{ width: "100%", height: 160, marginTop: 10 }}>
          <ResponsiveContainer>
            <BarChart data={dataGraficoSemana}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDE4CE" />
              <XAxis dataKey="etiqueta" tick={{ fontSize: 11, fill: "#8A7E5C" }} />
              <YAxis tick={{ fontSize: 11, fill: "#8A7E5C" }} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
              <Tooltip formatter={(v) => fmtCLP(v)} contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #EDE4CE" }} />
              <Bar dataKey="total" fill={NAVY} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Prospectos por seguir</h2>
          {prospectosVencidos.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>Ninguno vencido — al día.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {prospectosVencidos.map((p) => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13 }}>
                  <span>{p.nombre}</span>
                  <span style={{ color: RUST, fontSize: 12 }}>{p.origen}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Próximas citas de agenda</h2>
          {proximasCitas.length === 0 ? (
            <p style={{ ...hint, marginTop: 8 }}>No hay citas próximas.</p>
          ) : (
            <div style={{ marginTop: 8 }}>
              {proximasCitas.map((c) => (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13 }}>
                  <span>{c.clienteNombre} · {c.adiestrador}</span>
                  <span style={{ color: "#8A7E5C", fontSize: 12 }}>{new Date(c.fechaISO).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Clientes de hoy</h2>
        {clientesHoy.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>No hay paseos programados para hoy.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {clientesHoy.map((c) => {
              const hecho = !!registroPaseos[`${c.id}_${fechaKey(hoy)}`]?.realizado;
              return (
                <div key={c.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                  <span>{c.nombre} · 🐾 {c.perro} <span style={{ color: "#8A7E5C" }}>· {c.paseadorNombre || "sin paseador"}</span></span>
                  <span style={{ fontWeight: 600, color: hecho ? "#2F6A46" : "#B0A587" }}>{hecho ? "✓ Realizado" : "Pendiente"}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Agenda del adiestrador ----------
const TIPOS_CITA = [
  { id: "evaluacion", nombre: "Evaluación" },
  { id: "clase", nombre: "Clase" },
];

const NOMBRES_ESTADO_CITA = { pendiente: "Pendiente", agendada: "Agendada", rechazada: "Rechazada", cancelada: "Cancelada", realizada: "Realizada" };

function Agenda({ clientes, usuarios, citas, setCitas, cargando, disponibilidad, actualizarDisponibilidad, tarifas, actualizarTarifas, rolActual, nombreActual }) {
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
  const esEntrenador = rolActual === "entrenador";
  const [adiestradorHorario, setAdiestradorHorario] = useState(esEntrenador ? nombreActual : (adiestradores[0]?.nombre ?? ""));
  const [linkGenericoCopiado, setLinkGenericoCopiado] = useState(false);

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
    setCitas((prev) => [...prev, {
      id: Date.now(), clienteId: cliente.id, clienteNombre: cliente.nombre, perro: cliente.perro,
      tipo, adiestrador, fechaISO: new Date(fechaHora).toISOString(), estado: "agendada", notas: notasNuevas.trim(), origen: "staff",
    }]);
    setFechaHora(""); setNotasNuevas("");
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
    return <div className="howria-card" style={tarjeta}><p style={hint}>Cargando agenda…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={{ ...tarjeta, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ ...sectionTitle, marginBottom: 4 }}>Link público de agenda</h2>
          <p style={{ ...hint, margin: 0 }}>Compártelo donde quieras (Instagram, WhatsApp) — cualquier persona puede pedir hora y quedar como prospecto.</p>
        </div>
        <button onClick={copiarLinkGenerico} style={botonSecundario}>{linkGenericoCopiado ? "¡Copiado!" : "Copiar link genérico"}</button>
      </div>

      {pendientes.length > 0 && (
        <div className="howria-card" style={{ ...tarjeta, background: "#F3E3B4", border: "1px solid #E3D08C" }}>
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
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <button onClick={() => confirmar(c)} disabled={confirmandoId === c.id}
                    style={{ ...botonPrincipal, width: "auto", padding: "7px 16px", marginTop: 0, fontSize: 12.5, opacity: confirmandoId === c.id ? 0.6 : 1 }}>
                    {confirmandoId === c.id ? "Confirmando..." : "Confirmar"}
                  </button>
                  <button onClick={() => rechazar(c.id)} disabled={confirmandoId === c.id} style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }}>Rechazar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Agendar evaluación o clase</h2>
        <p style={hint}>Se guarda en el calendario del adiestrador elegido y queda con seguimiento hasta marcarla como realizada.</p>

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
      </div>

      <div className="howria-card" style={tarjeta}>
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
                  <button onClick={() => cancelar(c.id)} style={{ ...botonSecundario, padding: "7px 14px", fontSize: 12.5, borderColor: RUST, color: RUST }}>Cancelar cita</button>
                </div>
              )}
            </div>
          ))}
          {proximas.length === 0 && <p style={hint}>No hay citas agendadas.</p>}
        </div>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Historial y seguimiento</h2>
        {historial.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no hay citas realizadas o canceladas.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            {historial.map((c) => (
              <div key={c.id} style={{ padding: "10px 0", borderBottom: "1px solid #EDE4CE", fontSize: 13.5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <span><b style={{ color: NAVY }}>{c.clienteNombre}</b> · 🐾 {c.perro} · {TIPOS_CITA.find((t) => t.id === c.tipo)?.nombre} · {c.adiestrador}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: c.estado === "realizada" ? "#2F6A46" : RUST }}>{NOMBRES_ESTADO_CITA[c.estado] || c.estado}</span>
                </div>
                <p style={{ margin: "4px 0 0", color: "#8A7E5C", fontSize: 12.5 }}>{new Date(c.fechaISO).toLocaleDateString("es-CL")}</p>
                {c.notas && <p style={{ margin: "4px 0 0", color: "#5C5442" }}>{c.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card" style={tarjeta}>
          <h2 style={sectionTitle}>Horario semanal</h2>
          <p style={hint}>Define los días y horas en que este adiestrador queda disponible para que los tutores agenden evaluaciones y clases.</p>
          {!esEntrenador && (
            <select value={adiestradorHorario} onChange={(e) => setAdiestradorHorario(e.target.value)} style={{ ...input, marginTop: 12, width: 240 }}>
              {adiestradores.map((a) => <option key={a.id} value={a.nombre}>{a.nombre}</option>)}
            </select>
          )}
          {(() => {
            const objetivo = esEntrenador ? nombreActual : adiestradorHorario;
            return (
              <div style={{ marginTop: 14 }}>
                {DIAS_SEMANA_LARGO.map((nombreDia, dow) => {
                  const fila = disponibilidad.find((d) => d.adiestrador === objetivo && d.diaSemana === dow)
                    || { activo: false, horaInicio: "09:00", horaFin: "18:00" };
                  return (
                    <div key={dow} className="howria-horario-fila" style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: "1px solid #EDE4CE" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, width: 130, fontSize: 13.5, color: NAVY, cursor: "pointer" }}>
                        <input type="checkbox" checked={fila.activo} onChange={(e) => actualizarDisponibilidad(objetivo, dow, { activo: e.target.checked })} />
                        {nombreDia}
                      </label>
                      <input type="time" value={fila.horaInicio} disabled={!fila.activo}
                        onChange={(e) => actualizarDisponibilidad(objetivo, dow, { horaInicio: e.target.value })}
                        style={{ ...input, marginBottom: 0, width: 120, opacity: fila.activo ? 1 : 0.5 }} />
                      <span style={{ color: "#8A7E5C", fontSize: 13 }}>a</span>
                      <input type="time" value={fila.horaFin} disabled={!fila.activo}
                        onChange={(e) => actualizarDisponibilidad(objetivo, dow, { horaFin: e.target.value })}
                        style={{ ...input, marginBottom: 0, width: 120, opacity: fila.activo ? 1 : 0.5 }} />
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {(esEntrenador || adiestradores.length > 0) && (
        <div className="howria-card" style={tarjeta}>
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
    const contraparte = (c.direccion === "entrante" ? c.remitente : c.destinatario).toLowerCase();
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
function ListaCorreosCompacta({ correos }) {
  if (correos.length === 0) return <p style={{ ...hint, margin: 0 }}>Sin correos todavía.</p>;
  const ordenados = [...correos].sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  return (
    <div style={{ display: "grid", gap: 6 }}>
      {ordenados.map((c) => (
        <p key={c.id} style={{ margin: 0, fontSize: 12.5, color: "#8A7E5C" }}>
          <span style={{ fontWeight: 600, color: c.direccion === "entrante" ? "#2F6A46" : "#A85C3B" }}>
            {c.direccion === "entrante" ? "Recibido" : "Enviado"}
          </span>{" "}
          {c.asunto || "(sin asunto)"} · {fmtFechaCorreo(c.creadoEn)}
        </p>
      ))}
    </div>
  );
}

function Mail({ correos, setCorreos, cargando, clientes, prospectos, onVerCliente, onVerProspecto }) {
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
    return <div className="howria-card" style={tarjeta}><p style={hint}>Cargando correo…</p></div>;
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

// ---------- Seguimiento de prospectos (ventas) ----------
const PROSPECTO_VACIO = { nombre: "", telefono: "", perro: "", origen: "Instagram", tipoServicio: ["paseos"], estado: "nuevo", proximoSeguimiento: "", asignadoA: "", bitacora: [] };

function Prospectos({ prospectos, setProspectos, setClientes, usuarios, cargando, correos = [], enfoqueEmail, limpiarEnfoque }) {
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState(PROSPECTO_VACIO);
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [busqueda, setBusqueda] = useState("");
  const [notaNueva, setNotaNueva] = useState({});

  useEffect(() => {
    if (!enfoqueEmail) return;
    setBusqueda(enfoqueEmail);
    limpiarEnfoque();
  }, [enfoqueEmail]);

  function crearProspecto() {
    if (!form.nombre.trim()) return;
    setProspectos((prev) => [...prev, { ...form, id: Date.now(), nombre: form.nombre.trim() }]);
    setForm(PROSPECTO_VACIO);
    setMostrarForm(false);
  }

  function actualizarCampo(id, campo, valor) {
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)));
  }

  function agregarNota(id) {
    const texto = (notaNueva[id] || "").trim();
    if (!texto) return;
    setProspectos((prev) => prev.map((p) => (p.id === id ? { ...p, bitacora: [...p.bitacora, { fecha: new Date().toLocaleDateString("es-CL"), texto }] } : p)));
    setNotaNueva((prev) => ({ ...prev, [id]: "" }));
  }

  function eliminarProspecto(id) {
    setProspectos((prev) => prev.filter((p) => p.id !== id));
  }

  function convertirACliente(p) {
    setClientes((prev) => [...prev, {
      id: Date.now(), nombre: p.nombre, perro: p.perro || "Sin nombre", telefono: p.telefono, email: p.email || null,
      valorPaseoRef: 0, raza: "", pesoKg: 0, fotoUrl: null, diasHabituales: [], planHabitual: "LV",
      objetivos: "", paseadorNombre: "", tarifaPaseador: 0, direccion: "", lat: null, lng: null, tipoServicio: p.tipoServicio,
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
    return <div className="howria-card" style={tarjeta}><p style={hint}>Cargando prospectos…</p></div>;
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Seguimiento de prospectos</h2>
            <p style={hint}>Para no perder el hilo de una conversación de venta — cada contacto de campaña queda con su estado y notas.</p>
          </div>
          <button onClick={() => setMostrarForm((v) => !v)} style={{ ...botonSecundario, padding: "8px 16px", flex: "none" }}>
            {mostrarForm ? "Cancelar" : "+ Nuevo prospecto"}
          </button>
        </div>

        {mostrarForm && (
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
                {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
              </select>
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
            <button onClick={crearProspecto} style={{ ...botonPrincipal, width: "auto", padding: "10px 24px", marginTop: 0 }}>Guardar prospecto</button>
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
                    {usuarios.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 14, background: CREAM_SOFT, borderRadius: 8, padding: 12 }}>
                <p style={{ ...label, marginBottom: 8 }}>Bitácora — qué quedó pendiente</p>
                {p.bitacora.length === 0 ? (
                  <p style={{ ...hint, margin: "0 0 10px" }}>Sin notas todavía.</p>
                ) : (
                  p.bitacora.slice().reverse().map((n, i) => (
                    <p key={i} style={{ margin: "0 0 8px", fontSize: 13, color: INK }}><span style={{ color: "#8A7E5C" }}>{n.fecha}:</span> {n.texto}</p>
                  ))
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <input placeholder="Ej. quedó en confirmar el jueves..." value={notaNueva[p.id] || ""} onChange={(e) => setNotaNueva((prev) => ({ ...prev, [p.id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && agregarNota(p.id)} style={{ ...input, marginBottom: 0, flex: 1 }} />
                  <button onClick={() => agregarNota(p.id)} style={{ ...botonSecundario, padding: "8px 16px" }}>Agregar</button>
                </div>
              </div>

              {p._dbId && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ ...label, marginBottom: 6 }}>Correo</p>
                  <ListaCorreosCompacta correos={correos.filter((c) => c.prospectoId === p._dbId)} />
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                {p.estado === "ganado" && (
                  <button onClick={() => convertirACliente(p)} style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0 }}>Convertir a cliente</button>
                )}
                <BotonEliminar onConfirm={() => eliminarProspecto(p.id)} label="Eliminar prospecto" style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
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

// ---------- Estilos compartidos ----------
const sectionTitle = { fontSize: 18, color: NAVY, fontFamily: "'Fraunces', Georgia, serif", fontWeight: 600, letterSpacing: 0.1, marginBottom: 6, marginTop: 0 };
const hint = { fontSize: 12.5, color: "#9A9179", margin: "0 0 12px" };
const label = { display: "block", fontSize: 11.5, color: "#8A7E5C", marginBottom: 6, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" };
const input = { width: "100%", boxSizing: "border-box", padding: "10px 13px", marginBottom: 16, border: "1px solid #E1D7B8", borderRadius: 8, fontSize: 14, background: "#FFFFFF", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", color: INK, transition: "border-color .15s" };
const botonPrincipal = { width: "100%", padding: "12px", background: NAVY, color: CREAM, border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer", fontWeight: 600, letterSpacing: 0.3, fontFamily: "'Inter', sans-serif", boxShadow: "0 2px 8px rgba(20,33,61,0.18)", transition: "transform .12s, box-shadow .12s" };
const botonSecundario = { padding: "10px 18px", background: "transparent", color: NAVY, border: `1.5px solid ${NAVY}`, borderRadius: 8, fontSize: 13, cursor: "pointer", fontWeight: 600, flex: 1, fontFamily: "'Inter', sans-serif", transition: "background .12s" };
const tarjeta = { background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(20,33,61,0.05)" };

// ---------- Confirmación de borrado (dos pasos) ----------
function BotonEliminar({ onConfirm, label = "Eliminar", style }) {
  const [confirmando, setConfirmando] = useState(false);
  if (confirmando) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={() => { onConfirm(); setConfirmando(false); }}
          style={{ border: "none", background: RUST, color: "#fff", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          Confirmar
        </button>
        <button onClick={() => setConfirmando(false)}
          style={{ border: "1px solid #E4DBC3", background: "none", color: "#6B6248", borderRadius: 6, padding: "6px 10px", fontSize: 12, cursor: "pointer" }}>
          Cancelar
        </button>
      </div>
    );
  }
  return <button onClick={() => setConfirmando(true)} style={style}>{label}</button>;
}

// ---------- Acciones compartidas sobre boletas (paseo o adiestramiento) ----------
function aceptarBoleta(setBoletas, numero) {
  setBoletas((prev) => prev.map((b) => (b.numero === numero ? { ...b, estado: "pendiente_pago" } : b)));
}

function eliminarBoleta(setBoletas, numero) {
  setBoletas((prev) => prev.filter((b) => b.numero !== numero));
}

function editarBoleta(setBoletas, numero, cambios) {
  setBoletas((prev) => prev.map((b) => (b.numero === numero ? { ...b, ...cambios } : b)));
}

function EditorBoletaBasico({ boleta, tipo, onGuardar, onCancelar }) {
  const [total, setTotal] = useState(boleta.total);
  const [mensaje, setMensaje] = useState(boleta.mensajePersonalizado || "");
  const [mes, setMes] = useState(boleta.mes || MESES[0]);
  const [anio, setAnio] = useState(boleta.anio || new Date().getFullYear());

  function guardar() {
    const cambios = { total: Number(total) || 0, mensajePersonalizado: mensaje.trim() || null };
    if (tipo === "paseo") { cambios.mes = mes; cambios.anio = Number(anio) || boleta.anio; }
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
function FilaBoletaVenta({ boleta, tipo, setBoletasEmitidas, setBoletasAdiestramiento }) {
  const [editando, setEditando] = useState(false);
  const [pagoPendiente, setPagoPendiente] = useState(false);
  const [fechaPagoForm, setFechaPagoForm] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPagoForm, setFormaPagoForm] = useState(FORMAS_PAGO[0]);
  const setBoletas = tipo === "paseo" ? setBoletasEmitidas : setBoletasAdiestramiento;
  const est = ESTADOS_FACTURA.find((e) => e.id === boleta.estado) || ESTADOS_FACTURA[0];

  function confirmarPago() {
    editarBoleta(setBoletas, boleta.numero, { estado: "pagada", fechaPago: fechaPagoForm, formaPago: formaPagoForm });
    setPagoPendiente(false);
  }

  return (
    <div style={{ padding: "10px 0", borderBottom: "1px solid #EDE4CE" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13.5 }}>
        <span style={{ color: INK }}>
          N°{String(boleta.numero).padStart(3, "0")} · {tipo === "paseo" ? `${boleta.mes} ${boleta.anio} · ${boleta.cantidad} paseos` : `Adiestramiento · ${boleta.modalidad}`}
          <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: est.bg, color: est.color }}>{est.nombre}</span>
          {tipo === "paseo" && boleta.estado === "pagada" && boleta.formaPago && (
            <span style={{ marginLeft: 8, fontSize: 12, color: "#8A7E5C" }}>{boleta.formaPago} · {boleta.fechaPago}</span>
          )}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <b style={{ color: NAVY }}>{fmtCLP(boleta.total)}</b>
          {boleta.estado === "no_enviada" && (
            <button onClick={() => aceptarBoleta(setBoletas, boleta.numero)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Aceptar</button>
          )}
          {tipo === "paseo" && boleta.estado !== "pagada" && boleta.estado !== "cancelada" && (
            <button onClick={() => setPagoPendiente(true)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Marcar pagada</button>
          )}
          <button onClick={() => setEditando((v) => !v)} style={{ border: "none", background: "none", color: NAVY, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>Editar</button>
          <BotonEliminar onConfirm={() => eliminarBoleta(setBoletas, boleta.numero)} style={{ border: "none", background: "none", color: RUST, cursor: "pointer", fontSize: 12.5 }} />
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
          onGuardar={(cambios) => { editarBoleta(setBoletas, boleta.numero, cambios); setEditando(false); }}
          onCancelar={() => setEditando(false)} />
      )}
    </div>
  );
}

// ---------- Notificaciones de error (toast) ----------
let toastListeners = [];
function showToast(mensaje, tipo = "error") {
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
    <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ background: t.tipo === "error" ? RUST : NAVY, color: "#fff", padding: "12px 18px", borderRadius: 8, fontSize: 13.5, boxShadow: "0 4px 14px rgba(0,0,0,0.25)", maxWidth: 320 }}>
          {t.mensaje}
        </div>
      ))}
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
  const [tab, setTab] = useState("inicio");
  const [mapaPaseadorSel, setMapaPaseadorSel] = useState("");
  const [grupoAbierto, setGrupoAbierto] = useState(null);
  const [clientes, setClientes, cargandoClientes] = useSyncedTable("clientes", clienteToDb, dbToCliente, "nombre", sessionVersion);
  const [correlativo, setCorrelativo] = useState(107);
  const [boletasEmitidas, setBoletasEmitidas, cargandoBoletas] = useSyncedTable("boletas", boletaToDb, dbToBoleta, "numero", sessionVersion);
  const [usuarios, setUsuarios, cargandoUsuarios] = useSyncedTable("usuarios", usuarioToDb, dbToUsuario, "nombre", sessionVersion, "usuarios_seguro");
  const [loginsPendientes, setLoginsPendientes] = useSyncedTable("logins_pendientes_borrar", loginPendienteToDb, dbToLoginPendiente, "eliminado_en", sessionVersion);
  const [pagosRegistrados, setPagosRegistrados, cargandoPagos] = useSyncedTable("pagos_trabajadores", pagoToDb, dbToPago, "fecha_pago", sessionVersion);
  const [boletasAdiestramiento, setBoletasAdiestramiento, cargandoBoletasAdiestramiento] = useSyncedTable("boletas_adiestramiento", boletaAdiestramientoToDb, dbToBoletaAdiestramiento, "numero", sessionVersion);
  const [correlativoAdiestramiento, setCorrelativoAdiestramiento] = useState(1);

  useEffect(() => {
    supabase
      .from("boletas_adiestramiento")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data[0]) setCorrelativoAdiestramiento(data[0].numero + 1);
      });
  }, []);
  const [registroPaseos, setRegistroPaseos] = useRegistroPaseosSincronizado(clientes);
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

  useEffect(() => {
    supabase
      .from("boletas")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data[0]) setCorrelativo(data[0].numero + 1);
      });
  }, []);
  const [equipoInterno, setEquipoInterno, cargandoEquipoInterno] = useSyncedTable("equipo_interno", equipoToDb, dbToEquipo, "nombre", sessionVersion);
  const [objetivosSemanales, setObjetivosSemanales, cargandoObjetivosSemanales] = useSyncedTable("objetivos_semanales", objetivoSemanalToDb, dbToObjetivoSemanal, "created_at", sessionVersion);
  const [objetivosMensuales, setObjetivosMensuales, cargandoObjetivosMensuales] = useSyncedTable("objetivos_mensuales", objetivoMensualToDb, dbToObjetivoMensual, "created_at", sessionVersion);
  const [tareasEquipo, setTareasEquipo, cargandoTareasEquipo] = useSyncedTable("tareas_equipo", tareaToDb, dbToTarea, "created_at", sessionVersion);
  const [citasAgenda, setCitasAgenda, cargandoCitasAgenda] = useSyncedTable("citas_agenda", citaToDb, dbToCita, "created_at", sessionVersion);
  const [disponibilidad, actualizarDisponibilidad] = useDisponibilidad(sessionVersion);
  const [tarifas, actualizarTarifas] = useTarifas(sessionVersion);
  const [prospectos, setProspectos, cargandoProspectos] = useSyncedTable("prospectos", prospectoToDb, dbToProspecto, "created_at", sessionVersion);
  const [correos, setCorreos, cargandoCorreos] = useCorreos(sessionVersion);
  const [saltarClienteDbId, setSaltarClienteDbId] = useState(null);
  const [enfoqueEmailProspecto, setEnfoqueEmailProspecto] = useState(null);
  const correosNoLeidos = correos.filter((c) => c.direccion === "entrante" && !c.leido).length;
  const cargandoEquipo = cargandoEquipoInterno || cargandoObjetivosSemanales || cargandoObjetivosMensuales || cargandoTareasEquipo;

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
    return <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", color: "#9BAAB8", fontFamily: "'Helvetica Neue', Arial, sans-serif", fontSize: 14 }}>Cargando...</div>;
  }
  if (!user) return <Login usuarios={usuarios} onLogin={(u) => { setUser(u); if (u.rol === "entrenador") setTab("mis-paseos"); }} />;

  const esAdmin = user.rol === "administrador";
  const esCoordinador = user.rol === "coordinador";
  const esPaseador = user.rol === "entrenador";
  const puedeVerFinanzas = esAdmin || esCoordinador;
  const tabsPermitidosRol = permisosRoles?.[user.rol] || [];
  const tabs = TODOS_LOS_TABS.filter((t) => tabsPermitidosRol.includes(t.id));

  return (
    <div style={{ minHeight: "100vh", background: CREAM, fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>
      <style>{`
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
        @media (max-width: 680px) {
          .howria-g2, .howria-g3, .howria-g4, .howria-split, .howria-photo-row {
            grid-template-columns: 1fr !important;
          }
          .howria-week {
            grid-template-columns: 1fr !important;
          }
          .howria-photo-row > div:first-child {
            display: flex !important; align-items: center; gap: 14px;
          }
          .howria-card { padding: 16px !important; }
          .howria-header { padding: 12px 16px !important; }
          .howria-header h1, .howria-header-logo { height: 30px !important; }
          .howria-main { padding: 16px !important; }
          table { font-size: 12.5px !important; }
          .howria-tabs-desktop { display: none !important; }
          .howria-tabs-mobile { display: block !important; }
          .howria-horario-fila { flex-wrap: wrap; row-gap: 8px; }
          .howria-horario-fila > label { width: 100% !important; }
          .howria-horario-fila input[type="time"] { width: 0 !important; flex: 1 1 90px; min-width: 90px; }
          .howria-launcher-mobile { display: block !important; }
        }
      `}</style>
      <div className="howria-header" style={{ background: NAVY, padding: "14px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.12)", position: "relative", zIndex: 30 }}>
        <LogoHowria height={44} />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {!esPaseador && <NotificacionesBell avisos={calcularAvisos({ clientes, boletasEmitidas, registroPaseos, tareasEquipo, citasAgenda, prospectos })} />}
          <BotonNotificacionesPush usuarioEmail={user.email} />
          <div style={{ fontSize: 13, textAlign: "right", color: CREAM }}>
            <div>{user.nombre}</div>
            <div style={{ fontSize: 11, color: "#9BAAB8", textTransform: "capitalize" }}>{user.rol}</div>
          </div>
          <button onClick={cerrarSesion} style={{ background: "none", border: "1px solid rgba(255,255,255,0.25)", color: "#C9CEDA", borderRadius: 6, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
            Cerrar sesión
          </button>
        </div>
      </div>

      {grupoAbierto && (
        <div onClick={() => setGrupoAbierto(null)} style={{ position: "fixed", inset: 0, zIndex: 15 }} />
      )}

      <div className="howria-tabs-desktop" style={{ position: "relative", display: "flex", gap: 4, padding: "0 32px", background: "#FFFFFF", borderBottom: "1px solid #EDE4CE", flexWrap: "wrap" }}>
        {tabs.some((t) => t.id === "inicio") && (
          <button onClick={() => { setTab("inicio"); setGrupoAbierto(null); }}
            style={{
              padding: "16px 20px", border: "none", background: "none", cursor: "pointer",
              fontSize: 14, color: tab === "inicio" ? NAVY : "#B0A587", flex: "none",
              borderBottom: tab === "inicio" ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
              fontWeight: tab === "inicio" ? 700 : 500
            }}>
            Inicio
          </button>
        )}
        {ORDEN_GRUPOS.map((grupo) => {
          const tabsDelGrupo = tabs.filter((t) => t.grupo === grupo);
          if (tabsDelGrupo.length === 0) return null;
          const grupoActivo = tabsDelGrupo.some((t) => t.id === tab);
          return (
            <div key={grupo} style={{ position: "relative" }}>
              <button onClick={() => setGrupoAbierto(grupoAbierto === grupo ? null : grupo)}
                style={{
                  padding: "16px 20px", border: "none", background: "none", cursor: "pointer",
                  fontSize: 14, color: grupoActivo || grupoAbierto === grupo ? NAVY : "#B0A587", flex: "none",
                  borderBottom: grupoActivo ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
                  fontWeight: grupoActivo ? 700 : 500, display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap"
                }}>
                {grupo}
                {tabsDelGrupo.some((t) => t.id === "mail") && correosNoLeidos > 0 && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: RUST, display: "inline-block" }} />
                )}
                <span style={{ fontSize: 10, transform: grupoAbierto === grupo ? "rotate(180deg)" : "none", display: "inline-block" }}>▾</span>
              </button>
              {grupoAbierto === grupo && (
                <div style={{ position: "absolute", top: "100%", left: 0, background: "#FFFFFF", border: "1px solid #EDE4CE", borderRadius: 8, boxShadow: "0 8px 20px rgba(20,33,61,0.12)", minWidth: 200, zIndex: 20, overflow: "hidden" }}>
                  {tabsDelGrupo.map((t) => (
                    <button key={t.id} onClick={() => { setTab(t.id); setGrupoAbierto(null); }}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", textAlign: "left", padding: "11px 16px", border: "none",
                        background: tab === t.id ? CREAM_SOFT : "none", cursor: "pointer",
                        fontSize: 13.5, color: tab === t.id ? NAVY : INK, fontWeight: tab === t.id ? 700 : 500
                      }}>
                      {t.label}
                      {t.id === "mail" && correosNoLeidos > 0 && (
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: RUST, color: "#FFFFFF" }}>{correosNoLeidos}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="howria-tabs-mobile" style={{ display: "none", padding: "12px 16px", background: "#FFFFFF", borderBottom: "1px solid #EDE4CE" }}>
        <label style={{ display: "block", fontSize: 11, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }} htmlFor="tab-movil">Sección</label>
        <select id="tab-movil" value={tab} onChange={(e) => setTab(e.target.value)}
          style={{ width: "100%", padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${NAVY}`, background: CREAM_SOFT, color: NAVY, fontSize: 15, fontWeight: 600 }}>
          {tabs.filter((t) => t.grupo === "").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          {ORDEN_GRUPOS.map((grupo) => {
            const tabsDelGrupo = tabs.filter((t) => t.grupo === grupo);
            if (tabsDelGrupo.length === 0) return null;
            return (
              <optgroup key={grupo} label={grupo}>
                {tabsDelGrupo.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </optgroup>
            );
          })}
        </select>
      </div>

      <div className="howria-main" style={{ padding: "28px 32px", maxWidth: 1040, margin: "0 auto" }}>
        {tab === "inicio" && tabsPermitidosRol.includes("inicio") && <Inicio clientes={clientes} boletasEmitidas={boletasEmitidas} registroPaseos={registroPaseos} tareasEquipo={tareasEquipo} objetivosSemanales={objetivosSemanales} usuarios={usuarios} citasAgenda={citasAgenda} prospectos={prospectos} setTab={setTab} user={user} tabs={tabs} />}
        {tab === "mis-paseos" && tabsPermitidosRol.includes("mis-paseos") && <MisPaseos clientes={clientes} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} user={user} usuarios={usuarios} />}
        {tab === "boletas" && tabsPermitidosRol.includes("boletas") && <Boletas clientes={clientes} boletasEmitidas={boletasEmitidas} correlativo={correlativo} setCorrelativo={setCorrelativo} onRegistrarBoleta={(b) => setBoletasEmitidas((prev) => [...prev, b])} recargoPct={configuracion?.recargo_fin_semana ?? RECARGO_FIN_SEMANA_FERIADO_DEFAULT} actualizarRecargoPct={(v) => actualizarConfiguracion("recargo_fin_semana", v)} />}
        {tab === "boletas-adiestramiento" && tabsPermitidosRol.includes("boletas-adiestramiento") && <BoletasAdiestramiento clientes={clientes} correlativo={correlativoAdiestramiento} setCorrelativo={setCorrelativoAdiestramiento} onRegistrarBoleta={(b) => setBoletasAdiestramiento((prev) => [...prev, b])} />}
        {tab === "facturas" && tabsPermitidosRol.includes("facturas") && <Facturas boletasEmitidas={boletasEmitidas} setBoletasEmitidas={setBoletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} setBoletasAdiestramiento={setBoletasAdiestramiento} clientes={clientes} cargandoBoletas={cargandoBoletas || cargandoBoletasAdiestramiento} />}
        {tab === "clientes" && tabsPermitidosRol.includes("clientes") && <Clientes clientes={clientes} setClientes={setClientes} boletasEmitidas={boletasEmitidas} setBoletasEmitidas={setBoletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} setBoletasAdiestramiento={setBoletasAdiestramiento} usuarios={usuarios} puedeEliminar={esAdmin} cargandoClientes={cargandoClientes} correos={correos} saltarClienteDbId={saltarClienteDbId} limpiarSaltoCliente={() => setSaltarClienteDbId(null)} />}
        {tab === "finanzas" && tabsPermitidosRol.includes("finanzas") && <Finanzas boletasEmitidas={boletasEmitidas} boletasAdiestramiento={boletasAdiestramiento} clientes={clientes} pagosRegistrados={pagosRegistrados} />}
        {tab === "pagos" && tabsPermitidosRol.includes("pagos") && <PagoTrabajadores boletasEmitidas={boletasEmitidas} clientes={clientes} usuarios={usuarios} registroPaseos={registroPaseos} pagosRegistrados={pagosRegistrados} setPagosRegistrados={setPagosRegistrados} cargandoPagos={cargandoPagos} />}
        {tab === "coordinacion" && tabsPermitidosRol.includes("coordinacion") && <Coordinacion clientes={clientes} setClientes={setClientes} usuarios={usuarios} registroPaseos={registroPaseos} setRegistroPaseos={setRegistroPaseos} setTab={setTab} setMapaPaseadorSel={setMapaPaseadorSel} />}
        {tab === "mapa" && tabsPermitidosRol.includes("mapa") && <MapaRutas clientes={clientes} setClientes={setClientes} usuarios={usuarios} paseadorId={mapaPaseadorSel} setPaseadorId={setMapaPaseadorSel} />}
        {tab === "ingreso-personal" && tabsPermitidosRol.includes("ingreso-personal") && <IngresoPersonalNuevo clientes={clientes} setClientes={setClientes} usuarios={usuarios} setUsuarios={setUsuarios} />}
        {tab === "equipo" && tabsPermitidosRol.includes("equipo") && <EquipoTrabajo equipo={equipoInterno} setEquipo={setEquipoInterno} objetivos={objetivosSemanales} setObjetivos={setObjetivosSemanales} objetivosMensuales={objetivosMensuales} setObjetivosMensuales={setObjetivosMensuales} tareas={tareasEquipo} setTareas={setTareasEquipo} cargando={cargandoEquipo} />}
        {tab === "agenda" && tabsPermitidosRol.includes("agenda") && <Agenda clientes={clientes} usuarios={usuarios} citas={citasAgenda} setCitas={setCitasAgenda} cargando={cargandoCitasAgenda} disponibilidad={disponibilidad} actualizarDisponibilidad={actualizarDisponibilidad} tarifas={tarifas} actualizarTarifas={actualizarTarifas} rolActual={user.rol} nombreActual={user.nombre} />}
        {tab === "seguimiento" && tabsPermitidosRol.includes("seguimiento") && <Prospectos prospectos={prospectos} setProspectos={setProspectos} setClientes={setClientes} usuarios={usuarios} cargando={cargandoProspectos} correos={correos} enfoqueEmail={enfoqueEmailProspecto} limpiarEnfoque={() => setEnfoqueEmailProspecto(null)} />}
        {tab === "mail" && tabsPermitidosRol.includes("mail") && <Mail correos={correos} setCorreos={setCorreos} cargando={cargandoCorreos} clientes={clientes} prospectos={prospectos} onVerCliente={(id) => { setSaltarClienteDbId(id); setTab("clientes"); }} onVerProspecto={(email) => { setEnfoqueEmailProspecto(email); setTab("seguimiento"); }} />}
        {tab === "usuarios" && tabsPermitidosRol.includes("usuarios") && <PanelAdmin usuarios={usuarios} setUsuarios={setUsuarios} clientes={clientes} setClientes={setClientes} usuarioActual={user} permisosRoles={permisosRoles} actualizarPermisoRol={actualizarPermisoRol} notificacionesRoles={notificacionesRoles} actualizarNotificacionRol={actualizarNotificacionRol} esAdmin={esAdmin} cargandoUsuarios={cargandoUsuarios} loginsPendientes={loginsPendientes} setLoginsPendientes={setLoginsPendientes} />}
      </div>
    </div>
  );
}
