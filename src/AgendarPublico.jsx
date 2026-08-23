import React, { useEffect, useMemo, useState } from "react";
import { CalendarioMes } from "./lib/CalendarioMes.jsx";

// Página pública sin login, con dos modos:
//  - howria.cl/agendaadiestrador?c=<clienteId> — el equipo la comparte
//    desde la ficha de un cliente que ya existe (nombre/perro precargados).
//  - howria.cl/agendaadiestrador (sin ?c=) — link genérico, para cualquier
//    persona que todavía no es cliente; pide sus datos de contacto y eso
//    crea un prospecto en vez de reservar a nombre de un cliente.
// No usa Supabase Auth — todo pasa por /api/cliente-agenda, que valida y
// guarda del lado del servidor.

const NAVY = "#122A40";
const CREAM = "#F3ECDC";
const RUST = "#A85C3B";
const INK = "#332E22";

const TIPOS_CITA = [
  { id: "evaluacion", nombre: "Evaluación" },
  { id: "clase", nombre: "Clase" },
];

const tarjeta = { background: CREAM, borderRadius: 10, padding: "36px 32px", boxShadow: "0 24px 60px rgba(0,0,0,0.35)" };
const label = { display: "block", fontSize: 12, fontWeight: 600, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 };
// fontSize 16 (no 14): bajo 16px, Safari en iPhone hace zoom automático
// al enfocar el campo — esta es la página pública de agenda, la
// primera impresión de un cliente nuevo, así que importa especialmente
// acá que no salte el zoom sin querer.
const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #DCD2B4", fontSize: 16, fontFamily: "inherit", background: "#FFFFFF", boxSizing: "border-box" };
const botonPrincipal = { width: "100%", padding: "12px", borderRadius: 8, border: "none", background: NAVY, color: CREAM, fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 6 };

// Hora LOCAL, no UTC — ver el comentario en la copia de HowriaAdmin.jsx,
// mismo bug (el "día" cambiaba a las 8-9pm hora de Chile en vez de a
// medianoche real).
function fechaKey(d) {
  const anio = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${anio}-${mes}-${dia}`;
}

function fmtCLP(n) {
  return Number(n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
}

export default function AgendarPublico() {
  const clienteId = useMemo(() => new URLSearchParams(window.location.search).get("c"), []);

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState(null);

  const [tipo, setTipo] = useState("evaluacion");
  const [adiestrador, setAdiestrador] = useState("");
  const [fecha, setFecha] = useState("");
  const [slots, setSlots] = useState([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [errorSlots, setErrorSlots] = useState(false);
  const [errorMapa, setErrorMapa] = useState(false);
  const [mesVisto, setMesVisto] = useState(() => { const h = new Date(); return { anio: h.getFullYear(), mesIdx: h.getMonth() }; });
  const [mapaDisponibilidad, setMapaDisponibilidad] = useState({});
  const [cargandoMapa, setCargandoMapa] = useState(false);
  const [horaSel, setHoraSel] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoPerro, setContactoPerro] = useState("");
  const [contactoDireccion, setContactoDireccion] = useState("");

  useEffect(() => {
    const url = clienteId ? `/api/cliente-agenda?clienteId=${encodeURIComponent(clienteId)}` : "/api/cliente-agenda";
    fetch(url)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setError(data.error || "No se pudo cargar la información.");
        } else if (!data.puedeAgendar) {
          setError("Tu ficha no tiene adiestramiento habilitado — contáctanos si crees que es un error.");
        } else {
          setInfo(data);
          setAdiestrador(data.adiestradores[0] || "");
          if (data.cliente) setContactoDireccion(data.cliente.direccion || "");
        }
        setCargando(false);
      })
      .catch(() => {
        setError("No se pudo conectar — revisa tu internet e intenta de nuevo.");
        setCargando(false);
      });
  }, [clienteId]);

  useEffect(() => {
    setHoraSel(null);
    setErrorSlots(false);
    if (!adiestrador || !fecha) { setSlots([]); return; }
    let activo = true;
    setCargandoSlots(true);
    const params = new URLSearchParams({ adiestrador, fecha });
    if (clienteId) params.set("clienteId", clienteId);
    fetch(`/api/cliente-agenda?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (activo) setSlots(data.slots || []); })
      .catch(() => { if (activo) { setSlots([]); setErrorSlots(true); } })
      .finally(() => { if (activo) setCargandoSlots(false); });
    return () => { activo = false; };
  }, [adiestrador, fecha, clienteId]);

  // Mapa de disponibilidad por fecha de este adiestrador (no por día
  // puntual) — es lo que colorea el calendario en verde/rojo antes de que
  // el tutor elija un día.
  useEffect(() => {
    setErrorMapa(false);
    if (!adiestrador) { setMapaDisponibilidad({}); return; }
    let activo = true;
    setCargandoMapa(true);
    const params = new URLSearchParams({ adiestrador });
    if (clienteId) params.set("clienteId", clienteId);
    fetch(`/api/cliente-agenda?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => { if (activo) setMapaDisponibilidad(data.disponibilidadFechas || {}); })
      .catch(() => { if (activo) { setMapaDisponibilidad({}); setErrorMapa(true); } })
      .finally(() => { if (activo) setCargandoMapa(false); });
    return () => { activo = false; };
  }, [adiestrador, clienteId]);

  const faltanDatosContacto = !clienteId
    ? (!contactoNombre.trim() || !contactoEmail.trim() || !contactoTelefono.trim() || !contactoPerro.trim() || !contactoDireccion.trim())
    : !contactoDireccion.trim();

  // Si no hay una tarifa cargada para este adiestrador+tipo, antes se
  // ocultaba el precio en silencio y se podía reservar igual (el servidor
  // guardaba la cita con precio $0). Ahora se avisa y se bloquea el envío
  // — el servidor también lo rechaza, esto es solo para no dejar que
  // alguien llegue hasta el final del formulario para recién enterarse.
  const tarifaSeleccionada = info ? (info.tarifas || []).find((t) => t.adiestrador === adiestrador) : null;
  const precioSeleccionado = tipo === "evaluacion" ? tarifaSeleccionada?.precioEvaluacion : tarifaSeleccionada?.precioClase;
  const sinTarifa = !!(info && adiestrador && precioSeleccionado == null);

  async function enviarSolicitud() {
    if (!horaSel || enviando || faltanDatosContacto || sinTarifa) return;
    setEnviando(true);
    setErrorEnvio("");
    try {
      const body = clienteId
        ? { clienteId, direccion: contactoDireccion.trim(), adiestrador, tipo, fechaISO: horaSel }
        : { nombre: contactoNombre.trim(), email: contactoEmail.trim(), telefono: contactoTelefono.trim(), perro: contactoPerro.trim(), direccion: contactoDireccion.trim(), adiestrador, tipo, fechaISO: horaSel };
      const resp = await fetch("/api/cliente-agenda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorEnvio(data.error || "No se pudo enviar la solicitud.");
        return;
      }
      setEnviado(true);
    } catch {
      setErrorEnvio("No se pudo conectar — revisa tu internet e intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const manana = new Date(); manana.setDate(manana.getDate() + 1);
  const limiteMax = new Date(); limiteMax.setDate(limiteMax.getDate() + (info?.diasAdelanteMax || 45));

  return (
    <div style={{ minHeight: "100vh", background: NAVY, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif", padding: "24px 0" }}>
      {/* En celular (de donde viene casi todo el tráfico de un link
          compartido) queda exactamente como antes: logo arriba, formulario
          abajo. Recién en pantalla ancha pasa a dos columnas — antes el
          formulario quedaba como una tira angosta perdida en un fondo azul
          enorme. La columna de la izquierda solo dice cosas que el propio
          flujo ya cumple (ver el mensaje de "¡Listo!" al enviar), no
          promesas nuevas. Va en un <style> porque este archivo es
          independiente del panel: no comparte el CSS global de
          HowriaAdmin.jsx a propósito, para no arrastrar ese bundle. */}
      <style>{`
        .howria-agendar-shell {
          width: 100%; max-width: 420px; padding: 0 24px; box-sizing: border-box;
          display: grid; grid-template-columns: 1fr;
        }
        .howria-agendar-intro { display: none; }
        .howria-agendar-logo-movil { display: flex; justify-content: center; margin-bottom: 28px; }
        @media (min-width: 900px) {
          .howria-agendar-shell {
            max-width: 920px; grid-template-columns: 1fr 1fr; gap: 56px; align-items: center;
          }
          .howria-agendar-intro { display: block; }
          .howria-agendar-logo-movil { display: none; }
          .howria-agendar-rotulo { display: none; }
        }
      `}</style>
      <div className="howria-agendar-shell">
        <div className="howria-agendar-intro">
          <img src="/logo-howria.png" alt="Howria" style={{ height: 96, marginBottom: 26 }} />
          {/* No repite el título de la tarjeta ("Agenda tu evaluación o
              clase", que además se personaliza a "Hola {nombre}…" cuando el
              link trae un cliente conocido) — con las dos columnas visibles
              quedaba escrito dos veces en la misma pantalla. */}
          <h2 style={{ margin: "0 0 14px", fontSize: 30, lineHeight: 1.25, color: CREAM, fontFamily: "Georgia, serif", fontWeight: 700 }}>
            Reserva tu hora con Howria
          </h2>
          <p style={{ margin: "0 0 22px", fontSize: 14.5, lineHeight: 1.65, color: "#9BAAB8" }}>
            Completa el formulario y elige el día y la hora que te acomoden.
          </p>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              "Solo puedes elegir horas que el adiestrador tenga libres.",
              "El adiestrador revisa y confirma tu solicitud.",
              "Te llega un correo con la fecha y hora confirmadas.",
            ].map((t) => (
              <li key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, color: "#C9CEDA", lineHeight: 1.5 }}>
                <span style={{ color: "#C9A24B", flex: "none", fontWeight: 700 }}>·</span>{t}
              </li>
            ))}
          </ul>
        </div>

        <div className="howria-agendar-logo-movil">
          <img src="/logo-howria.png" alt="Howria" style={{ height: 90 }} />
        </div>

        <div style={tarjeta}>
          {cargando ? (
            <p style={{ margin: 0, textAlign: "center", color: "#8A7E5C" }}>Cargando…</p>
          ) : error ? (
            <p style={{ margin: 0, color: RUST, fontSize: 14, lineHeight: 1.6, textAlign: "center" }}>{error}</p>
          ) : enviado ? (
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 700, color: NAVY, fontFamily: "Georgia, serif" }}>¡Listo! 🐾</p>
              <p style={{ margin: 0, fontSize: 14, color: "#5C5442", lineHeight: 1.6 }}>
                Tu solicitud quedó registrada. En cuanto el adiestrador la confirme, te llega un correo con la fecha y hora.
              </p>
            </div>
          ) : (
            <>
              {/* En escritorio el logo y "Reserva tu hora con Howria" ya están
                  en la columna de al lado — este rótulo solo hace falta en
                  celular, donde esa columna no se muestra. */}
              <p className="howria-agendar-rotulo" style={{ margin: "0 0 4px", fontSize: 13, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 1 }}>Agendar con Howria</p>
              <h1 style={{ margin: "0 0 20px", fontSize: 20, color: NAVY, fontFamily: "Georgia, serif" }}>
                {info.cliente ? `Hola ${info.cliente.nombre.split(" ")[0]}, elige día y hora` : "Agenda tu evaluación o clase"}
              </h1>

              {!info.cliente && (
                <div style={{ marginBottom: 4 }}>
                  <label style={label} htmlFor="pub-nombre">Tu nombre</label>
                  <input id="pub-nombre" value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} placeholder="Nombre y apellido"
                    style={{ ...input, marginBottom: 12 }} />

                  <label style={label} htmlFor="pub-correo">Tu correo</label>
                  <input id="pub-correo" type="email" value={contactoEmail} onChange={(e) => setContactoEmail(e.target.value)} placeholder="tu@correo.com"
                    style={{ ...input, marginBottom: 12 }} />

                  <label style={label} htmlFor="pub-telefono">Tu teléfono</label>
                  <input id="pub-telefono" value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} placeholder="+56 9 1234 5678"
                    style={{ ...input, marginBottom: 12 }} />

                  <label style={label} htmlFor="pub-perro">Nombre de tu perro</label>
                  <input id="pub-perro" value={contactoPerro} onChange={(e) => setContactoPerro(e.target.value)} placeholder="Ej. Toby"
                    style={{ ...input, marginBottom: 12 }} />

                  <label style={label} htmlFor="pub-direccion">Tu dirección</label>
                  <input id="pub-direccion" value={contactoDireccion} onChange={(e) => setContactoDireccion(e.target.value)} placeholder="Calle, número y comuna"
                    style={{ ...input, marginBottom: 18 }} />
                </div>
              )}

              {info.cliente && (
                <div style={{ marginBottom: 4 }}>
                  <label style={label} htmlFor="pub-direccion-cliente">Confirma tu dirección</label>
                  <input id="pub-direccion-cliente" value={contactoDireccion} onChange={(e) => setContactoDireccion(e.target.value)} placeholder="Calle, número y comuna"
                    style={{ ...input, marginBottom: 18 }} />
                </div>
              )}

              <label style={label} htmlFor="pub-tipo">Tipo</label>
              <select id="pub-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ ...input, marginBottom: 14 }}>
                {TIPOS_CITA.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
              </select>

              <label style={label} htmlFor="pub-adiestrador">Adiestrador</label>
              <select id="pub-adiestrador" value={adiestrador} onChange={(e) => setAdiestrador(e.target.value)} style={{ ...input, marginBottom: 8 }}>
                {info.adiestradores.length === 0 && <option value="">No hay adiestradores disponibles</option>}
                {info.adiestradores.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>

              {sinTarifa ? (
                <p style={{ margin: "0 0 14px", fontSize: 13, color: RUST, lineHeight: 1.5 }}>
                  Todavía no tenemos una tarifa cargada para {adiestrador} en este tipo de cita — escríbenos por
                  WhatsApp o Instagram para coordinar directamente.
                </p>
              ) : precioSeleccionado > 0 ? (
                <p style={{ margin: "0 0 14px", fontSize: 13.5, color: NAVY, fontWeight: 600 }}>
                  Precio: {fmtCLP(precioSeleccionado)}
                </p>
              ) : <div style={{ marginBottom: 14 }} />}

              <label style={label}>Día</label>
              <div style={{ marginBottom: 14 }}>
                <CalendarioMes anio={mesVisto.anio} mesIdx={mesVisto.mesIdx}
                  estadoDia={(key) => {
                    if (key < fechaKey(manana) || key > fechaKey(limiteMax)) return "pasado";
                    return mapaDisponibilidad[key] === true ? "disponible" : "bloqueado";
                  }}
                  onClickDia={(key) => setFecha(key)}
                  onCambiarMes={(delta) => setMesVisto((prev) => { const d = new Date(prev.anio, prev.mesIdx + delta, 1); return { anio: d.getFullYear(), mesIdx: d.getMonth() }; })}
                  minMes={{ anio: manana.getFullYear(), mesIdx: manana.getMonth() }}
                  maxMes={{ anio: limiteMax.getFullYear(), mesIdx: limiteMax.getMonth() }}
                  seleccionado={fecha}
                  soloDisponibleClickeable
                />
                {cargandoMapa ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>Cargando disponibilidad…</p>
                ) : errorMapa ? (
                  <p style={{ margin: "8px 0 0", fontSize: 12.5, color: RUST }}>No se pudo cargar la disponibilidad — revisa tu conexión e intenta de nuevo.</p>
                ) : (
                  // Sin esto, un tutor ve cuadraditos verdes y rojos sin saber
                  // qué significan — y los rojos además no responden al tocarlos
                  // (soloDisponibleClickeable), lo que se siente como que la
                  // página está fallando. Los colores están copiados de
                  // lib/CalendarioMes.jsx, que es compartido con el editor de
                  // disponibilidad del adiestrador y por eso no se toca ahí.
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, margin: "8px 0 0", fontSize: 12, color: "#8A7E5C" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: "#D8ECDE", border: "1.5px solid #2F6A46" }} /> Con horas libres
                    </span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <span style={{ width: 11, height: 11, borderRadius: 3, background: "#F1DCD2", border: `1px solid ${RUST}` }} /> Sin horas ese día
                    </span>
                  </div>
                )}
              </div>

              {fecha && (
                <div style={{ marginBottom: 8 }}>
                  <p style={label}>Horarios disponibles</p>
                  {cargandoSlots ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>Buscando horarios…</p>
                  ) : errorSlots ? (
                    <p style={{ margin: 0, fontSize: 13, color: RUST }}>No se pudo cargar los horarios — revisa tu conexión e intenta de nuevo.</p>
                  ) : slots.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: "#8A7E5C" }}>No quedan horarios libres ese día — prueba con otra fecha.</p>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {slots.map((s) => (
                        <button key={s} type="button" onClick={() => setHoraSel(s)}
                          style={{ padding: "8px 14px", borderRadius: 20, fontSize: 13, cursor: "pointer",
                            border: horaSel === s ? `1.5px solid ${NAVY}` : "1px solid #DCD2B4",
                            background: horaSel === s ? NAVY : "#FFFFFF",
                            color: horaSel === s ? CREAM : INK }}>
                          {new Date(s).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {errorEnvio && <p style={{ margin: "10px 0 0", fontSize: 12.5, color: RUST }}>{errorEnvio}</p>}

              <button onClick={enviarSolicitud} disabled={!horaSel || enviando || faltanDatosContacto || sinTarifa}
                style={{ ...botonPrincipal, opacity: !horaSel || enviando || faltanDatosContacto || sinTarifa ? 0.45 : 1 }}>
                {enviando ? "Enviando..." : "Solicitar cita"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
