# Howria Web

App de gestión para Howria (paseos y adiestramiento canino). Vite + React,
Supabase (Postgres + Auth) como backend, desplegado en Vercel con dominio
howria.cl (DNS en Cloudflare).

## Estructura

- `src/main.jsx` — enruta por `pathname`: `/admin` → panel interno
  (`HowriaAdmin.jsx`), `/agendar` → reserva pública (`AgendarPublico.jsx`),
  todo lo demás → página pública (`Home.jsx`). Cada ruta se carga con
  `React.lazy()` para no bajar el código de las otras dos.
- `src/Home.jsx` — landing pública (hero, servicios, nosotros, galería,
  contacto). Fotos en `public/images-home/` y `public/images/`.
- `src/HowriaAdmin.jsx` — panel completo (un solo archivo grande): login con
  Supabase Auth, Inicio, Mis paseos, Boletas (paseos y adiestramiento),
  Facturas, Clientes, Finanzas, Pago trabajadores, Coordinación, Mapa,
  Ingreso de personal, Equipo, Agenda, Seguimiento, Usuarios (con permisos
  por rol configurables).
- `src/lib/supabaseClient.js` — cliente de Supabase (usa
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`, variables de entorno en Vercel).
- `src/AgendarPublico.jsx` — página pública de reserva (`/agendar?c=<clienteId>`),
  sin login: el tutor elige adiestrador, día y hora; queda la cita como
  "pendiente" hasta que el adiestrador la confirma desde el panel. El
  equipo comparte este link a mano (botón "Copiar link de agenda" en la
  ficha del cliente, pestaña Clientes).
- `public/nosotros.html` — página estática independiente (no pasa por
  React). Ruta resuelta en `vercel.json` (junto con `/admin` y `/agendar`).
- `src/App.jsx` — portal viejo sin protección, **ya no se usa** (se puede
  borrar; `main.jsx` no lo importa).
- `api/confirmar-cita.js` — función serverless de Vercel: el adiestrador o
  staff la llama al confirmar una cita pendiente desde el panel; verifica
  permisos con la service role key y envía el correo de confirmación (vía
  Resend) con el diseño de marca Howria.
- `api/cliente-agenda.js` — función serverless que sirve `AgendarPublico.jsx`
  sin necesidad de sesión: devuelve los datos del cliente/adiestradores/
  horarios libres, y crea la cita "pendiente" cuando el tutor la solicita.
  Usa la service role key — el navegador del tutor nunca tiene acceso
  directo a Supabase.
- `database/*.sql` — todos los scripts SQL corridos hasta ahora en Supabase,
  en orden cronológico aproximado (nombres autoexplicativos), incluyendo
  `agenda_disponibilidad_citas_cliente.sql` (tabla de horarios semanales de
  los adiestradores y permisos para la reserva pública). El esquema
  base original (`schema_howria.sql`) no está aquí — ya se corrió al
  principio del proyecto; si hace falta reconstruir la base desde cero,
  avisar.

## Variables de entorno (Vercel)

Para el frontend (Vite, expuestas al navegador):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY` (publishable/anon key, no la secret key)
- `VITE_VAPID_PUBLIC_KEY` — llave pública VAPID para notificaciones push
  (ver sección "Notificaciones push" más abajo).

Para las funciones serverless en `api/` (solo server-side, nunca al navegador):
- `SUPABASE_URL` — misma URL del proyecto que `VITE_SUPABASE_URL`.
- `SUPABASE_SERVICE_ROLE_KEY` — la **secret key** de Supabase (Settings →
  API Keys → "Secret keys", hay que revelarla con el ícono de ojo). Ojo:
  no es la publishable/anon key — con esa las funciones no rompen pero
  quedan sujetas a RLS igual que un usuario anónimo, y todo falla en
  silencio con "no encontramos tu ficha de cliente" o similar.
- `RESEND_API_KEY` — API key de [Resend](https://resend.com), para el
  correo de confirmación de citas y (vía SMTP) los links mágicos de
  Supabase Auth.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` — mismo par de llaves VAPID,
  para firmar los envíos de push (ver abajo).

## Cómo correrlo local

```bash
npm install
cp .env.example .env   # completar con las credenciales reales de Supabase
npm run dev
```

## Notificaciones push

El panel (`/admin`) puede avisar al staff por notificación push del
navegador (aunque el panel esté cerrado) cuando: llega una nueva solicitud
de cita desde `/agendar` o `/agendaadiestrador`, o llega un correo nuevo a
`contacto@howria.cl`. Es opt-in por persona/navegador: cada usuario la
activa con el ícono de campana en el header del panel (`BotonNotificacionesPush`
en `HowriaAdmin.jsx`).

Piezas:
- `public/sw.js` — service worker que recibe el push y muestra la
  notificación.
- `src/lib/pushNotificaciones.js` — pide permiso, suscribe el navegador y
  guarda la suscripción en la tabla `push_subscriptions` (Supabase).
- `api/_lib/enviarPush.js` — helper server-side (usa `web-push`) que le
  manda el push a todas las suscripciones guardadas; se llama desde
  `api/cliente-agenda.js` (POST) y `api/correo-entrante.js`. Si una
  suscripción ya no existe (410/404), se borra sola.

Setup, además de las variables de entorno de arriba:
1. Correr `database/push_subscriptions.sql` en el SQL Editor de Supabase
   (crea la tabla y sus políticas RLS).
2. Generar el par de llaves VAPID una sola vez: `npx web-push generate-vapid-keys`.
   La pública va en `VITE_VAPID_PUBLIC_KEY` y `VAPID_PUBLIC_KEY` (mismo
   valor, dos variables porque una la lee el navegador y la otra el
   servidor), la privada solo en `VAPID_PRIVATE_KEY` — nunca en una
   variable `VITE_*` (quedaría expuesta al navegador).

## Notas importantes

- **RLS activado** en todas las tablas: solo usuarios autenticados
  (Supabase Auth) pueden leer/escribir. `database/rls_permisos_por_rol.sql`
  ya está corrido en el SQL Editor de Supabase — los permisos distinguen
  por rol a nivel de base de datos, no solo de interfaz: por ejemplo, solo
  `administrador` puede escribir en `usuarios` (antes cualquiera podía
  auto-ascenderse de rol), y `boletas`/`pagos_trabajadores` quedan
  restringidos a coordinador y administrador. Ver ese archivo para la
  matriz completa de qué rol puede hacer qué en cada tabla.
- El login usa Supabase Auth con correos sintéticos tipo
  `nombre.apellido@howria.local` (no reciben correos reales — las cuentas
  se crean/gestionan a mano en Supabase → Authentication → Users).
- Los permisos por pestaña y rol, y el % de recargo de fin de semana/
  feriado, se editan desde la propia app (pestaña "Usuarios" y "Boletas"
  respectivamente) y se guardan en las tablas `permisos_roles` y
  `configuracion`.
- `FERIADOS_CHILE` en `HowriaAdmin.jsx` tiene los feriados hasta fines de
  2027 cargados — hay que seguir agregando el año siguiente ahí cuando
  corresponda (Semana Santa y algunos "puente" son movibles, calcularlos
  a partir de la fecha de Pascua de ese año).
- Pendiente conocido: el dominio `howria.cl` todavía no está verificado en
  Resend — mientras no lo esté, el correo de confirmación de citas
  (`api/confirmar-cita.js`) no se puede enviar desde `citas@howria.cl` (la
  cita queda confirmada igual, solo falla el envío del correo). Hay que
  agregar los registros DNS que da Resend en Cloudflare.
