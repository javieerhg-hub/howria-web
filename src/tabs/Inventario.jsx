// Pestaña Inventario — entregas de equipo (correas, poleras, etc.) por
// paseador. Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas y
// src/tabs/_compartido.jsx para lo compartido.
import { useState, useMemo } from "react";
import {
  NAVY, CREAM_SOFT, GOLD, INK, RUST, tarjeta, sectionTitle, hint, label, input,
  botonPrincipal, botonSecundario, Spinner, BotonEliminar,
} from "../HowriaAdmin.jsx";
import { SeccionPlegable } from "./_compartido.jsx";

// Catálogo fijo de artículos del inventario — correas usan tallas de
// correa, poleras/polerones usan tallas de ropa, collar/accesorio no
// llevan talla. "Accesorio" es el cajón de sastre (bozal, linterna,
// bolsas, etc.) — por eso siempre pide una descripción corta de qué es.

const ITEMS_INVENTARIO = [
  { id: "collar", label: "Collar", tallas: null },
  { id: "correa", label: "Correa", tallas: ["Chica", "Mediana", "Larga"] },
  { id: "polera", label: "Polera", tallas: ["S", "M", "L", "XL"] },
  { id: "poleron", label: "Polerón", tallas: ["S", "M", "L", "XL"] },
  { id: "accesorio", label: "Accesorio", tallas: null },
];

function etiquetaItemInventario(g) {
  const base = ITEMS_INVENTARIO.find((i) => i.id === g.articulo)?.label || g.articulo;
  const partes = [base];
  if (g.talla) partes.push(g.talla);
  if (g.descripcion) partes.push(`"${g.descripcion}"`);
  return partes.join(" ");
}

// Pestaña "Inventario" — el coordinador deja registro de qué equipo
// (collares, correas, poleras, polerones, accesorios) le entregó a cada
// paseador o entrenador. Cada entrega queda guardada con fecha (no se
// pisa un total): el resumen "qué tiene cada paseador" se arma sumando
// el historial completo, que también queda visible más abajo.
export function Inventario({ usuarios, entregas, registrarEntrega, eliminarEntrega, cargando, user }) {
  const equipoPaseo = usuarios.filter((u) => u.rol === "paseador" || u.rol === "entrenador").sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const [paseadorNombre, setPaseadorNombre] = useState(equipoPaseo[0]?.nombre || "");
  const [articulo, setArticulo] = useState("collar");
  const [talla, setTalla] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [guardando, setGuardando] = useState(false);

  const itemSel = ITEMS_INVENTARIO.find((i) => i.id === articulo);

  async function enviar() {
    if (!paseadorNombre || Number(cantidad) < 1 || guardando) return;
    setGuardando(true);
    await registrarEntrega({
      paseadorNombre, articulo, talla: itemSel?.tallas ? talla : "", descripcion: descripcion.trim(),
      cantidad: Number(cantidad), entregadoPor: user.nombre,
    });
    setDescripcion(""); setCantidad(1); setTalla("");
    setGuardando(false);
  }

  // Agrupa por paseador y, dentro de cada uno, por artículo+talla+
  // descripción — así dos entregas del mismo artículo se suman, pero
  // "Accesorio: bozal" y "Accesorio: linterna" quedan como líneas aparte.
  const resumenPorPaseador = useMemo(() => {
    const mapa = {};
    entregas.forEach((e) => { (mapa[e.paseadorNombre] ||= []).push(e); });
    return Object.entries(mapa).map(([paseador, items]) => {
      const grupos = {};
      items.forEach((e) => {
        const clave = `${e.articulo}|${e.talla || ""}|${e.descripcion || ""}`;
        if (!grupos[clave]) grupos[clave] = { articulo: e.articulo, talla: e.talla, descripcion: e.descripcion, cantidad: 0 };
        grupos[clave].cantidad += e.cantidad;
      });
      return { paseador, items: Object.values(grupos) };
    }).sort((a, b) => a.paseador.localeCompare(b.paseador, "es"));
  }, [entregas]);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Registrar entrega</h2>
        <p style={hint}>Deja registro de qué equipo le entregaste a cada paseador — collares, correas, poleras, polerones y accesorios.</p>

        <label style={label}>Paseador o entrenador</label>
        <select value={paseadorNombre} onChange={(e) => setPaseadorNombre(e.target.value)} style={input}>
          {equipoPaseo.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
        </select>

        <div className="howria-g2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={label}>Artículo</label>
            <select value={articulo} onChange={(e) => { setArticulo(e.target.value); setTalla(""); }} style={{ ...input, marginBottom: 0 }}>
              {ITEMS_INVENTARIO.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Cantidad</label>
            <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} style={{ ...input, marginBottom: 0 }} />
          </div>
        </div>

        {itemSel?.tallas && (
          <>
            <label style={{ ...label, marginTop: 16 }}>Talla</label>
            <select value={talla} onChange={(e) => setTalla(e.target.value)} style={input}>
              <option value="">Sin talla especificada</option>
              {itemSel.tallas.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </>
        )}

        <label style={{ ...label, marginTop: itemSel?.tallas ? 0 : 16 }}>
          {articulo === "accesorio" ? "¿Qué accesorio es? (ej. bozal, linterna)" : "Nota (opcional)"}
        </label>
        <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
          placeholder={articulo === "accesorio" ? "Escribe qué es..." : "Nota opcional..."} style={input} />

        <button onClick={enviar} disabled={guardando || !paseadorNombre}
          style={{ ...botonPrincipal, opacity: guardando || !paseadorNombre ? 0.6 : 1, cursor: guardando || !paseadorNombre ? "default" : "pointer" }}>
          {guardando ? "Guardando…" : "Registrar entrega"}
        </button>
      </div>

      <div className="howria-card" style={tarjeta}>
        <h2 style={sectionTitle}>Qué tiene cada paseador</h2>
        <p style={hint}>Sumado de todas las entregas registradas.</p>
        {cargando ? (
          <p style={{ ...hint, marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}><Spinner size={13} color={GOLD} pista="#E4DBC3" /> Cargando…</p>
        ) : resumenPorPaseador.length === 0 ? (
          <p style={{ ...hint, marginTop: 8 }}>Todavía no hay entregas registradas.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12, marginTop: 12 }}>
            {resumenPorPaseador.map(({ paseador, items }) => (
              <div key={paseador} style={{ background: CREAM_SOFT, borderRadius: 10, padding: 14 }}>
                <p style={{ margin: "0 0 8px", fontWeight: 700, color: NAVY, fontSize: 13.5 }}>{paseador}</p>
                <div style={{ display: "grid", gap: 4 }}>
                  {items.map((g, i) => (
                    <p key={i} style={{ margin: 0, fontSize: 12.5, color: INK }}>{g.cantidad}× {etiquetaItemInventario(g)}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <SeccionPlegable titulo="Historial completo" subtitulo="Todas las entregas registradas, más recientes primero.">
        {entregas.length === 0 ? (
          <p style={hint}>Todavía no hay entregas registradas.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {entregas.map((e) => (
              <div key={e.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "10px 12px", background: CREAM_SOFT, borderRadius: 8, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 13, color: INK }}>
                    <b style={{ color: NAVY }}>{e.paseadorNombre}</b> — {e.cantidad}× {etiquetaItemInventario(e)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: "#8A7E5C" }}>
                    {new Date(e.entregadoEn).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })} · entregado por {e.entregadoPor}
                  </p>
                </div>
                <BotonEliminar onConfirm={() => eliminarEntrega(e.id)} label="Quitar" title="Eliminar este registro"
                  style={{ ...botonSecundario, padding: "6px 12px", fontSize: 11.5, borderColor: RUST, color: RUST, flex: "none" }} />
              </div>
            ))}
          </div>
        )}
      </SeccionPlegable>
    </div>
  );
}
