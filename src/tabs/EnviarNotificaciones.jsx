// Pestaña Notificaciones — mandar un push a mano a un entrenador/paseador.
// Ver src/HowriaAdmin.jsx (React.lazy) por la lista completa de pestañas.
import { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { tarjeta, sectionTitle, hint, label, input, botonPrincipal, showToast } from "../HowriaAdmin.jsx";

export function EnviarNotificaciones({ usuarios, user }) {
  const destinatarios = usuarios
    .filter((u) => u.rol === "entrenador" || u.rol === "paseador")
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const [destinatarioEmail, setDestinatarioEmail] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (!destinatarioEmail || !mensaje.trim()) {
      showToast("Elige a quién enviárselo y escribe el mensaje.");
      return;
    }
    setEnviando(true);
    try {
      const { data: { session } } = await supabase.auth.refreshSession();
      const res = await fetch("/api/enviar-notificacion-manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ destinatarioEmail, titulo: `Aviso de ${user.nombre}`, cuerpo: mensaje.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "No se pudo enviar el aviso.");
        return;
      }
      if (data.entregada) {
        showToast("Aviso enviado — le va a aparecer como notificación en su teléfono.", "exito");
      } else {
        showToast("El aviso se registró, pero esa persona todavía no tiene notificaciones activadas en su teléfono.", "info");
      }
      setMensaje("");
    } catch {
      showToast("No se pudo enviar el aviso. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  const puedeEnviar = destinatarioEmail && mensaje.trim() && !enviando;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="howria-card" style={{ ...tarjeta, maxWidth: 480 }}>
        <h2 style={sectionTitle}>Enviar notificación</h2>
        <p style={hint}>Escribe un aviso y elige a quién de tu equipo se lo mandas — le va a aparecer como notificación en su teléfono, si ya la activó.</p>

        <label style={label}>Para</label>
        <select value={destinatarioEmail} onChange={(e) => setDestinatarioEmail(e.target.value)} style={input}>
          <option value="">Selecciona a alguien del equipo…</option>
          {destinatarios.map((u) => (
            <option key={u.email} value={u.email}>{u.nombre} — {u.rol === "paseador" ? "Paseador" : "Entrenador"}</option>
          ))}
        </select>

        <label style={label}>Mensaje</label>
        <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)} rows={4}
          placeholder="Escribe el mensaje que quieres que le llegue…"
          style={{ ...input, resize: "vertical", fontFamily: "'Inter', sans-serif" }} />

        <button onClick={enviar} disabled={!puedeEnviar}
          style={{ ...botonPrincipal, opacity: puedeEnviar ? 1 : 0.55, cursor: puedeEnviar ? "pointer" : "default" }}>
          {enviando ? "Enviando…" : "Enviar notificación"}
        </button>
      </div>
    </div>
  );
}
