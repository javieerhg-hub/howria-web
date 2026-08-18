// Pestaña Mail — bandeja de contacto@howria.cl (hilos, archivar, marcar
// leído). Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import {
  NAVY, CREAM_SOFT, GOLD, RUST, tarjeta, sectionTitle, hint, label, input, botonPrincipal,
  botonSecundario, Spinner, BotonConfirmable, showToast, dbToCorreo,
} from "../HowriaAdmin.jsx";

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
      // Un hilo cuenta como archivado si TODOS sus mensajes lo están —
      // así, si llega una respuesta nueva después de archivar, el hilo
      // reaparece solo en la bandeja activa (ese mensaje nuevo nace sin
      // archivar), sin que haga falta desarchivar a mano.
      archivado: mensajes.every((m) => m.archivado),
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

export function Mail({ correos, setCorreos, cargando, clientes, prospectos, onVerCliente, onVerProspecto }) {
  const [busqueda, setBusqueda] = useState("");
  const [hiloAbierto, setHiloAbierto] = useState(null);
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  // Redactar un correo nuevo (no atado a ningún hilo existente) — antes
  // solo se podía responder dentro de un hilo que ya existía porque
  // alguien había escrito primero. El servidor (api/responder-correo.js)
  // ya soportaba esto de sobra, no exigía un hilo previo — solo faltaba
  // el formulario acá.
  const [componiendo, setComponiendo] = useState(false);
  const [nuevoDestinatario, setNuevoDestinatario] = useState("");
  const [nuevoAsunto, setNuevoAsunto] = useState("");
  const [nuevoCuerpo, setNuevoCuerpo] = useState("");
  const [enviandoNuevo, setEnviandoNuevo] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState("");

  const hilos = useMemo(() => construirHilos(correos), [correos]);

  function archivarHilo(hilo, archivar) {
    const ids = hilo.mensajes.map((m) => m.id);
    supabase.from("correos").update({ archivado: archivar }).in("id", ids).then(({ error }) => {
      if (error) { showToast("No se pudo archivar el hilo."); return; }
      setCorreos((prev) => prev.map((c) => (ids.includes(c.id) ? { ...c, archivado: archivar } : c)));
      if (hiloAbierto === hilo.contraparte) setHiloAbierto(null);
    });
  }

  async function enviarNuevo() {
    if (!nuevoDestinatario.trim() || !nuevoCuerpo.trim() || enviandoNuevo) return;
    setEnviandoNuevo(true);
    setErrorNuevo("");
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const clienteCoincide = clientes.find((c) => c.email?.toLowerCase() === nuevoDestinatario.trim().toLowerCase());
      const prospectoCoincide = prospectos.find((p) => p.email?.toLowerCase() === nuevoDestinatario.trim().toLowerCase());
      const resp = await fetch("/api/responder-correo", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({
          destinatario: nuevoDestinatario.trim(),
          asunto: nuevoAsunto.trim() || undefined,
          cuerpo: nuevoCuerpo,
          clienteId: clienteCoincide?._dbId,
          prospectoId: prospectoCoincide?._dbId,
        }),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorNuevo(resultado.error || "No se pudo enviar el correo.");
        return;
      }
      if (resultado.correo) setCorreos((prev) => [dbToCorreo(resultado.correo), ...prev]);
      setNuevoDestinatario(""); setNuevoAsunto(""); setNuevoCuerpo("");
      setComponiendo(false);
      showToast("Correo enviado.");
    } catch {
      setErrorNuevo("No se pudo conectar — revisa tu conexión.");
    } finally {
      setEnviandoNuevo(false);
    }
  }

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
  function coincide(h) {
    if (!busquedaLimpia) return true;
    return h.contraparte.includes(busquedaLimpia)
      || nombreDe(h).toLowerCase().includes(busquedaLimpia)
      || (h.ultimo.asunto || "").toLowerCase().includes(busquedaLimpia);
  }
  const hilosFiltrados = hilos.filter((h) => !h.archivado && coincide(h));
  const hilosArchivados = hilos.filter((h) => h.archivado && coincide(h));

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
      if (error) { showToast("No se pudo marcar el hilo como leído."); return; }
      setCorreos((prev) => prev.map((c) => (idsNoLeidos.includes(c.id) ? { ...c, leido: true } : c)));
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Mail — contacto@howria.cl</h2>
            <p style={hint}>Correos recibidos en contacto@howria.cl y confirmaciones enviadas a clientes, agrupados por conversación.</p>
          </div>
          <button onClick={() => { setComponiendo((v) => !v); setErrorNuevo(""); }} style={{ ...botonSecundario, flex: "none" }}>
            {componiendo ? "Cancelar" : "+ Redactar nuevo"}
          </button>
        </div>
        {componiendo && (
          <div style={{ background: CREAM_SOFT, borderRadius: 8, padding: 14, marginTop: 14, display: "grid", gap: 10 }}>
            <input placeholder="Para (correo)" type="email" value={nuevoDestinatario} onChange={(e) => setNuevoDestinatario(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            <input placeholder="Asunto" value={nuevoAsunto} onChange={(e) => setNuevoAsunto(e.target.value)} style={{ ...input, marginBottom: 0 }} />
            <textarea placeholder="Mensaje..." value={nuevoCuerpo} onChange={(e) => setNuevoCuerpo(e.target.value)} rows={5} style={{ ...input, marginBottom: 0, resize: "vertical" }} />
            {errorNuevo && <p style={{ color: RUST, fontSize: 12.5, margin: 0 }}>{errorNuevo}</p>}
            <button onClick={enviarNuevo} disabled={!nuevoDestinatario.trim() || !nuevoCuerpo.trim() || enviandoNuevo}
              style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: !nuevoDestinatario.trim() || !nuevoCuerpo.trim() || enviandoNuevo ? 0.6 : 1 }}>
              {enviandoNuevo ? "Enviando..." : "Enviar"}
            </button>
          </div>
        )}
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
              <div key={hilo.contraparte} className="howria-card" style={{ ...tarjeta, cursor: "pointer" }} onClick={() => abrirHilo(hilo)}>
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ fontSize: 13.5 }}>
                    {hilo.noLeidos > 0 && (
                      <span style={{ marginRight: 8, fontSize: 11, fontWeight: 700, padding: "3px 9px", borderRadius: 20, background: RUST, color: "#FFFFFF" }}>{hilo.noLeidos}</span>
                    )}
                    <b style={{ color: NAVY }}>{nombre}</b>
                    {hilo.clienteId && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#D8ECDE", color: "#2F6A46" }}>Cliente</span>}
                    {hilo.prospectoId && <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#F3E3B4", color: "#8A6A1E" }}>Prospecto</span>}
                    {nombre !== hilo.contraparte && <span style={{ color: "#8A7E5C" }}> · {hilo.contraparte}</span>}
                  </div>
                  <div style={{ fontSize: 12.5, color: "#8A7E5C" }}>{fmtFechaCorreo(hilo.ultimo.creadoEn)}</div>
                </div>
                <p style={{ margin: "6px 0 0", fontSize: 13, color: "#8A7E5C" }}>
                  {hilo.ultimo.direccion === "entrante" ? "Recibido" : "Enviado"} · {hilo.ultimo.asunto || "(sin asunto)"}
                </p>

                {abierto && (
                  <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E4DBC3", display: "grid", gap: 14, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(hilo.clienteId || hilo.prospectoId) && (
                        <button onClick={() => (hilo.clienteId ? onVerCliente(hilo.clienteId) : onVerProspecto(hilo.contraparte))}
                          style={{ ...botonSecundario, width: "auto", padding: "6px 14px", fontSize: 12.5, flex: "none" }}>
                          Ver ficha de {hilo.clienteId ? "cliente" : "prospecto"}
                        </button>
                      )}
                      <BotonConfirmable onConfirm={() => archivarHilo(hilo, true)} label="Archivar hilo" colorConfirmar={NAVY}
                        style={{ border: "1px solid #DCD2B4", background: "none", color: "#6B6248", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer" }} />
                    </div>
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

                    <div style={{ borderTop: "1px solid #E4DBC3", paddingTop: 14 }}>
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

      {hilosArchivados.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <button onClick={() => setVerArchivados((v) => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}>
            <h2 style={sectionTitle}>Archivados ({hilosArchivados.length})</h2>
            <span style={{ fontSize: 16, color: "#8A7E5C" }}>{verArchivados ? "▾" : "▸"}</span>
          </button>
          {verArchivados && (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {hilosArchivados.map((hilo) => (
                <div key={hilo.contraparte} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: CREAM_SOFT, borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 13 }}>
                    <b style={{ color: NAVY }}>{nombreDe(hilo)}</b>
                    <span style={{ color: "#8A7E5C" }}> · {hilo.ultimo.asunto || "(sin asunto)"} · {fmtFechaCorreo(hilo.ultimo.creadoEn)}</span>
                  </div>
                  <button onClick={() => archivarHilo(hilo, false)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12 }}>Desarchivar</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
