// Función serverless de Vercel: recibe el .ics que el navegador ya generó
// (src/lib/ics.js, con datos que el paseador ya podía ver en su propia
// pantalla — acá no se expone nada nuevo) y lo reenvía con los headers
// correctos. Necesario porque un blob: URL no tiene nombre/extensión real,
// así que Safari en iPhone lo trata como una descarga anónima en vez de
// reconocerlo como un archivo de calendario — una URL de servidor real que
// termina en .ics, con Content-Type text/calendar, sí dispara el flujo
// nativo de "Agregar a Calendario".
export default function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Método no permitido" });
    return;
  }

  const { contenido } = req.body || {};
  if (!contenido || typeof contenido !== "string" || contenido.length > 200000) {
    res.status(400).json({ error: "Falta o es inválido el contenido del calendario" });
    return;
  }

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="mis-paseos.ics"');
  res.status(200).send(contenido);
}
