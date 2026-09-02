// Función serverless de Vercel: única puerta de entrada para todo lo que le
// pasa a una cita de adiestramiento. Antes esto eran cuatro archivos sueltos
// —cliente-agenda, confirmar-cita, cancelar-cita y mover-cita— y cada archivo
// de api/ cuenta como una función serverless. El plan Hobby permite máximo 12
// por deploy y ya íbamos en 11, así que juntarlos acá liberó 3 cupos.
//
// La lógica de cada operación NO cambió: los cuatro archivos se movieron tal
// cual a api/_lib/ (Vercel ignora como ruta todo lo que empiece con guion
// bajo, igual que _lib/enviarPush.js) y este archivo solo decide a cuál
// llamar. Si algo falla, el error está en el archivo de _lib/, no acá.
//
// El despachador va por ?op= en la query y NO por un campo del body, porque
// "accion" ya estaba ocupado adentro con dos significados distintos: cancelar
// espera accion: "cancelar" | "rechazar", y mover espera accion: "agendar".
// Meter un tercer sentido en la misma llave era pedir un bug. Yendo por la
// query, los bodies que manda el navegador quedan idénticos a como estaban.
//
// Ojo: los correos que ya salieron enlazan a la PÁGINA /confirmar-cita?t=TOKEN
// (que vercel.json reescribe a index.html), no a /api/confirmar-cita. Por eso
// renombrar las rutas de API no rompe ningún correo que esté en la bandeja de
// un cliente — la página es la que llama acá.
//
//   GET  /api/citas?op=agenda&clienteId=&adiestrador=&fecha=  -> datos para la agenda pública
//   POST /api/citas?op=agenda                                 -> reservar (cliente existente o nuevo)
//   GET  /api/citas?op=confirmar&t=TOKEN                      -> datos de la cita para /confirmar-cita
//   POST /api/citas?op=confirmar                              -> confirmar (equipo desde el panel, o cliente con token)
//   POST /api/citas?op=cancelar                               -> cancelar o rechazar
//   POST /api/citas?op=mover                                  -> mover de hora, o agendar una clase del plan
import agenda from "./_lib/citas-agenda.js";
import confirmar from "./_lib/citas-confirmar.js";
import cancelar from "./_lib/citas-cancelar.js";
import mover from "./_lib/citas-mover.js";

const OPERACIONES = { agenda, confirmar, cancelar, mover };

export default async function handler(req, res) {
  const op = req.query?.op;
  const manejar = OPERACIONES[op];
  if (!manejar) {
    res.status(400).json({
      error: `Operación de cita desconocida: "${op ?? ""}". Se espera ?op= agenda, confirmar, cancelar o mover.`,
    });
    return;
  }
  return manejar(req, res);
}
