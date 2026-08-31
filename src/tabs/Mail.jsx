// Pestaña Mail — bandeja de contacto@howria.cl.
//
// Un correo por tarjeta, sin agrupar por persona. Antes se armaba un
// "hilo" por dirección de correo y al abrirlo se apilaban TODOS los
// mensajes de esa persona, cada uno con su iframe de 300px — en el
// celular eso era un scroll interminable, y archivar era del hilo
// completo, todo o nada. Ahora cada correo se abre, se clasifica y se
// archiva por separado, aunque sean cinco del mismo remitente.
//
// Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient.js";
import {
  NAVY, CREAM, CREAM_SOFT, RUST, tarjeta, sectionTitle, hint, input, botonPrincipal,
  botonSecundario, Skeleton, SkeletonLista, BotonConfirmable, showToast, dbToCorreo,
} from "../HowriaAdmin.jsx";

function fmtFechaCorreo(iso) {
  return new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// Etiquetas de tema. Los ids son los que acepta la restricción de la
// columna en la base — ver database/106_correos_categoria.sql; agregar
// una acá sin agregarla allá hace que guardar falle.
export const CATEGORIAS_CORREO = [
  { id: "consulta", nombre: "Consulta nueva", bg: "#F3E3B4", color: "#8A6A1E" },
  { id: "cliente", nombre: "Cliente", bg: "#D8ECDE", color: "#2F6A46" },
  { id: "agenda", nombre: "Agenda", bg: "#DCE7F1", color: "#2B5578" },
  { id: "pago", nombre: "Pago", bg: "#E5DEEF", color: "#5B4780" },
  { id: "proveedor", nombre: "Proveedor", bg: "#EDE4CE", color: "#6B6248" },
  { id: "spam", nombre: "Spam", bg: "#F1DCD2", color: "#A85C3B" },
];

function categoriaDe(id) {
  return CATEGORIAS_CORREO.find((c) => c.id === id) || null;
}

// La "contraparte" es la persona externa del intercambio: quien nos
// escribió si el correo es entrante, a quién le escribimos si es saliente.
function contraparteDe(m) {
  return (m.direccion === "entrante" ? m.remitente : m.destinatario)?.toLowerCase() || "desconocido";
}

// Texto plano para el adelanto de la tarjeta. Muchos correos vienen solo
// en HTML, así que se le sacan las etiquetas en vez de mostrar vacío.
function vistaPrevia(m) {
  const crudo = m.cuerpoTexto || (m.cuerpoHtml || "").replace(/<[^>]*>/g, " ");
  return crudo.replace(/\s+/g, " ").trim().slice(0, 140);
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

function Etiqueta({ bg, color, children, style }) {
  return (
    <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: bg, color, whiteSpace: "nowrap", ...style }}>
      {children}
    </span>
  );
}

export function Mail({ correos, setCorreos, cargando, clientes, prospectos, onVerCliente, onVerProspecto }) {
  const [busqueda, setBusqueda] = useState("");
  const [correoAbierto, setCorreoAbierto] = useState(null); // id del correo desplegado
  const [respuesta, setRespuesta] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [filtroCategoria, setFiltroCategoria] = useState("todas"); // "todas" | "sin" | id
  // Redactar un correo nuevo (no atado a ninguno existente) — antes solo
  // se podía responder a alguien que hubiera escrito primero. El servidor
  // (api/responder-correo.js) ya soportaba esto de sobra, solo faltaba el
  // formulario acá.
  const [componiendo, setComponiendo] = useState(false);
  const [nuevoDestinatario, setNuevoDestinatario] = useState("");
  const [nuevoAsunto, setNuevoAsunto] = useState("");
  const [nuevoCuerpo, setNuevoCuerpo] = useState("");
  const [enviandoNuevo, setEnviandoNuevo] = useState(false);
  const [errorNuevo, setErrorNuevo] = useState("");

  // Un correo entrante de alguien desconocido no trae cliente_id ni
  // prospecto_id. Antes eso se resolvía mirando el resto del hilo; ahora
  // que cada correo va solo, se busca la ficha por la dirección.
  const fichaPorEmail = useMemo(() => {
    const mapa = new Map();
    for (const p of prospectos) if (p.email) mapa.set(p.email.toLowerCase(), { prospectoId: p._dbId, nombre: p.nombre });
    // Los clientes se cargan después a propósito: si una misma dirección
    // está como prospecto y como cliente, gana la ficha de cliente.
    for (const c of clientes) if (c.email) mapa.set(c.email.toLowerCase(), { clienteId: c._dbId, nombre: c.nombre });
    return mapa;
  }, [clientes, prospectos]);

  // Cada correo con su ficha resuelta y su nombre para mostrar, ordenados
  // del más nuevo al más viejo.
  const items = useMemo(() => {
    return correos
      .map((m) => {
        const contraparte = contraparteDe(m);
        const porEmail = fichaPorEmail.get(contraparte) || {};
        const clienteId = m.clienteId || porEmail.clienteId || null;
        const prospectoId = m.prospectoId || porEmail.prospectoId || null;
        let nombre = porEmail.nombre;
        if (!nombre && clienteId) nombre = clientes.find((c) => c._dbId === clienteId)?.nombre;
        if (!nombre && prospectoId) nombre = prospectos.find((p) => p._dbId === prospectoId)?.nombre;
        return { ...m, contraparte, clienteId, prospectoId, nombre: nombre || contraparte };
      })
      .sort((a, b) => new Date(b.creadoEn) - new Date(a.creadoEn));
  }, [correos, fichaPorEmail, clientes, prospectos]);

  const busquedaLimpia = busqueda.trim().toLowerCase();
  function coincide(m) {
    if (filtroCategoria === "sin" && m.categoria) return false;
    if (filtroCategoria !== "todas" && filtroCategoria !== "sin" && m.categoria !== filtroCategoria) return false;
    if (!busquedaLimpia) return true;
    return m.contraparte.includes(busquedaLimpia)
      || m.nombre.toLowerCase().includes(busquedaLimpia)
      || (m.asunto || "").toLowerCase().includes(busquedaLimpia)
      || vistaPrevia(m).toLowerCase().includes(busquedaLimpia);
  }
  const activos = items.filter((m) => !m.archivado && coincide(m));
  const archivados = items.filter((m) => m.archivado && coincide(m));

  // Cuántos sin clasificar hay en la bandeja activa — es el número que
  // dice cuánto trabajo de clasificación queda pendiente.
  const sinClasificar = items.filter((m) => !m.archivado && !m.categoria).length;

  function archivarCorreo(m, archivar) {
    supabase.from("correos").update({ archivado: archivar }).eq("id", m.id).then(({ error }) => {
      if (error) { showToast("No se pudo archivar el correo."); return; }
      setCorreos((prev) => prev.map((c) => (c.id === m.id ? { ...c, archivado: archivar } : c)));
      if (correoAbierto === m.id) setCorreoAbierto(null);
    });
  }

  function clasificar(m, categoria) {
    // Tocar la etiqueta que ya tiene la saca — así se puede corregir una
    // clasificación equivocada sin tener que elegir otra a la fuerza.
    const nueva = m.categoria === categoria ? null : categoria;
    supabase.from("correos").update({ categoria: nueva }).eq("id", m.id).then(({ error }) => {
      if (error) { showToast("No se pudo clasificar el correo."); return; }
      setCorreos((prev) => prev.map((c) => (c.id === m.id ? { ...c, categoria: nueva } : c)));
    });
  }

  function abrirCorreo(m) {
    const yaAbierto = correoAbierto === m.id;
    setCorreoAbierto(yaAbierto ? null : m.id);
    // El borrador es una sola variable compartida, no una por correo — sin
    // este reset, un texto escrito para alguien y nunca enviado podía
    // terminar mandado a otra persona al abrir su correo y tocar "Enviar".
    setRespuesta("");
    setErrorEnvio("");
    if (yaAbierto) return;
    if (m.direccion !== "entrante" || m.leido) return;
    supabase.from("correos").update({ leido: true }).eq("id", m.id).then(({ error }) => {
      if (error) { showToast("No se pudo marcar como leído."); return; }
      setCorreos((prev) => prev.map((c) => (c.id === m.id ? { ...c, leido: true } : c)));
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
          clienteId: clienteCoincide?._dbId || null,
          prospectoId: prospectoCoincide?._dbId || null,
        }),
      });
      const resultado = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        setErrorNuevo(resultado.error || "No se pudo enviar el correo.");
        return;
      }
      if (resultado.correo) setCorreos((prev) => [dbToCorreo(resultado.correo), ...prev]);
      setNuevoDestinatario("");
      setNuevoAsunto("");
      setNuevoCuerpo("");
      setComponiendo(false);
      showToast("Correo enviado.");
    } catch {
      setErrorNuevo("No se pudo conectar — revisa tu conexión.");
    } finally {
      setEnviandoNuevo(false);
    }
  }

  async function enviarRespuesta(m) {
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
          destinatario: m.contraparte,
          asunto: m.asunto ? `Re: ${m.asunto.replace(/^Re:\s*/i, "")}` : undefined,
          cuerpo: respuesta,
          clienteId: m.clienteId,
          prospectoId: m.prospectoId,
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
    return (
      <div className="howria-card" style={tarjeta}>
        <Skeleton ancho="32%" alto={20} />
        <Skeleton ancho="60%" alto={12} style={{ marginTop: 10 }} />
        <div style={{ marginTop: 22 }}><SkeletonLista filas={4} alto={40} /></div>
      </div>
    );
  }

  function TarjetaCorreo(m) {
    const abierto = correoAbierto === m.id;
    const cat = categoriaDe(m.categoria);
    const sinLeer = m.direccion === "entrante" && !m.leido;
    return (
      <div key={m.id} className="howria-card" style={{ ...tarjeta, cursor: "pointer", borderLeft: sinLeer ? `3px solid ${RUST}` : "3px solid transparent" }}
        onClick={() => abrirCorreo(m)}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 13.5, minWidth: 0, flex: "1 1 190px" }}>
            <b style={{ color: NAVY }}>{m.nombre}</b>
            {m.clienteId && <Etiqueta bg="#D8ECDE" color="#2F6A46" style={{ marginLeft: 6 }}>Cliente</Etiqueta>}
            {m.prospectoId && !m.clienteId && <Etiqueta bg="#F3E3B4" color="#8A6A1E" style={{ marginLeft: 6 }}>Prospecto</Etiqueta>}
            {cat && <Etiqueta bg={cat.bg} color={cat.color} style={{ marginLeft: 6 }}>{cat.nombre}</Etiqueta>}
          </div>
          <div style={{ fontSize: 12.5, color: "#8A7E5C", whiteSpace: "nowrap" }}>{fmtFechaCorreo(m.creadoEn)}</div>
        </div>
        <p style={{ margin: "6px 0 0", fontSize: 13.5, color: NAVY, fontWeight: sinLeer ? 700 : 500 }}>
          {m.asunto || "(sin asunto)"}
        </p>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#8A7E5C" }}>
          {m.direccion === "entrante" ? "Recibido" : "Enviado"} · {vistaPrevia(m) || "(sin contenido)"}
        </p>

        {abierto && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid #E4DBC3", display: "grid", gap: 14, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: "#8A7E5C", textTransform: "uppercase", letterSpacing: 0.4 }}>Clasificar</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {CATEGORIAS_CORREO.map((c) => {
                  const activa = m.categoria === c.id;
                  return (
                    <button key={c.id} type="button" onClick={() => clasificar(m, c.id)} aria-pressed={activa}
                      style={{
                        fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: "pointer", minHeight: 34,
                        border: activa ? `1.5px solid ${c.color}` : "1px solid #DCD2B4",
                        background: activa ? c.bg : "#FFFFFF",
                        color: activa ? c.color : "#6B6248", fontWeight: activa ? 700 : 400,
                      }}>
                      {c.nombre}
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(m.clienteId || m.prospectoId) && (
                <button onClick={() => (m.clienteId ? onVerCliente(m.clienteId) : onVerProspecto(m.contraparte))}
                  style={{ ...botonSecundario, width: "auto", padding: "6px 14px", fontSize: 12.5, flex: "none", minHeight: 40 }}>
                  Ver ficha de {m.clienteId ? "cliente" : "prospecto"}
                </button>
              )}
              <BotonConfirmable onConfirm={() => archivarCorreo(m, true)} label="Archivar" colorConfirmar={NAVY}
                style={{ border: "1px solid #DCD2B4", background: "none", color: "#6B6248", borderRadius: 8, padding: "6px 14px", fontSize: 12.5, cursor: "pointer", minHeight: 40 }} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                <Etiqueta bg={m.direccion === "entrante" ? "#D8ECDE" : "#F1DCD2"} color={m.direccion === "entrante" ? "#2F6A46" : "#A85C3B"} style={{ fontSize: 11, padding: "3px 10px" }}>
                  {m.direccion === "entrante" ? `De: ${m.remitente}` : `Para: ${m.destinatario}`}
                </Etiqueta>
              </div>
              <CuerpoCorreo mensaje={m} />
            </div>

            <div style={{ borderTop: "1px solid #E4DBC3", paddingTop: 14 }}>
              <textarea placeholder={`Responder a ${m.contraparte}…`} value={respuesta} onChange={(e) => setRespuesta(e.target.value)}
                rows={3} style={{ ...input, marginBottom: 8, resize: "vertical" }} />
              {errorEnvio && <p style={{ margin: "0 0 8px", fontSize: 12.5, color: RUST }}>{errorEnvio}</p>}
              <button onClick={() => enviarRespuesta(m)} disabled={!respuesta.trim() || enviando}
                style={{ ...botonPrincipal, width: "auto", padding: "8px 18px", marginTop: 0, opacity: !respuesta.trim() || enviando ? 0.5 : 1 }}>
                {enviando ? "Enviando..." : "Enviar respuesta"}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const filtros = [
    { id: "todas", nombre: "Todos" },
    ...(sinClasificar > 0 ? [{ id: "sin", nombre: `Sin clasificar (${sinClasificar})` }] : []),
    ...CATEGORIAS_CORREO,
  ];

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <h2 style={sectionTitle}>Mail — contacto@howria.cl</h2>
            <p style={hint}>Correos recibidos en contacto@howria.cl y confirmaciones enviadas a clientes. Cada correo va por separado: tócalo para leerlo, clasificarlo o archivarlo.</p>
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
        <input placeholder="Buscar por nombre, correo, asunto o texto…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={{ ...input, marginTop: 14, marginBottom: 0 }} />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
          {filtros.map((f) => {
            const activo = filtroCategoria === f.id;
            // Cada categoría se pinta con su propio color; "Todos" y "Sin
            // clasificar" no tienen uno y caen al azul de la marca.
            const fondoActivo = f.bg || NAVY;
            const textoActivo = f.color || CREAM;
            return (
              <button key={f.id} type="button" onClick={() => setFiltroCategoria(f.id)} aria-pressed={activo}
                style={{
                  fontSize: 12, padding: "6px 12px", borderRadius: 20, cursor: "pointer", minHeight: 34,
                  border: activo ? `1.5px solid ${f.color || NAVY}` : "1px solid #DCD2B4",
                  background: activo ? fondoActivo : "#FFFFFF",
                  color: activo ? textoActivo : "#6B6248",
                  fontWeight: activo ? 700 : 400,
                }}>
                {f.nombre}
              </button>
            );
          })}
        </div>
      </div>

      {activos.length === 0 ? (
        <div className="howria-card" style={tarjeta}>
          <p style={hint}>
            No hay correos {busquedaLimpia || filtroCategoria !== "todas" ? "que coincidan con el filtro" : "todavía"}.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>{activos.map(TarjetaCorreo)}</div>
      )}

      {archivados.length > 0 && (
        <div className="howria-card" style={tarjeta}>
          <button onClick={() => setVerArchivados((v) => !v)}
            style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", font: "inherit" }}>
            <h2 style={sectionTitle}>Archivados ({archivados.length})</h2>
            <span style={{ fontSize: 16, color: "#8A7E5C" }}>{verArchivados ? "▾" : "▸"}</span>
          </button>
          {verArchivados && (
            <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
              {archivados.map((m) => {
                const cat = categoriaDe(m.categoria);
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8, background: CREAM_SOFT, borderRadius: 8, padding: "10px 14px" }}>
                    <div style={{ fontSize: 13, minWidth: 0 }}>
                      <b style={{ color: NAVY }}>{m.nombre}</b>
                      {cat && <Etiqueta bg={cat.bg} color={cat.color} style={{ marginLeft: 6 }}>{cat.nombre}</Etiqueta>}
                      <span style={{ color: "#8A7E5C" }}> · {m.asunto || "(sin asunto)"} · {fmtFechaCorreo(m.creadoEn)}</span>
                    </div>
                    <button onClick={() => archivarCorreo(m, false)} style={{ ...botonSecundario, padding: "6px 12px", fontSize: 12, minHeight: 40 }}>Desarchivar</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
