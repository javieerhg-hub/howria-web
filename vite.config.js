import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Los tests corren en la hora de Chile, igual que la app.
//
// Toda la lógica de fechas de Howria trabaja en hora LOCAL a propósito (ver
// fechaKey en lib/programacion.js: usar UTC hacía que "el día" cambiara a
// las 8-9 de la noche). Eso significa que los tests que cubren el cambio de
// hora —y ya van cuatro bugs de eso en este proyecto— solo prueban algo si
// corren en una zona horaria que tenga cambio de hora en las mismas fechas.
//
// Sin esta línea, esos tests pasan en verde en cualquier máquina en UTC sin
// haber probado nada, que es peor que no tenerlos.
process.env.TZ = "America/Santiago";

export default defineConfig({
  plugins: [react()],
});
