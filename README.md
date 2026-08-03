# Howria Web

App de gestión para Howria (paseos y adiestramiento canino). Vite + React,
Supabase (Postgres + Auth) como backend, desplegado en Vercel con dominio
howria.cl (DNS en Cloudflare).

## Estructura

- `src/main.jsx` — enruta `/admin` → panel interno (`HowriaAdmin.jsx`), todo
  lo demás → página pública (`Home.jsx`).
- `src/Home.jsx` — landing pública (hero, servicios, nosotros, galería,
  contacto). Fotos en `public/images-home/` y `public/images/`.
- `src/HowriaAdmin.jsx` — panel completo (un solo archivo grande): login con
  Supabase Auth, Inicio, Mis paseos, Boletas (paseos y adiestramiento),
  Facturas, Clientes, Finanzas, Pago trabajadores, Coordinación, Mapa,
  Ingreso de personal, Equipo, Agenda, Seguimiento, Usuarios (con permisos
  por rol configurables).
- `src/lib/supabaseClient.js` — cliente de Supabase (usa
  `VITE_SUPABASE_URL` y `VITE_SUPABASE_KEY`, variables de entorno en Vercel).
- `public/boletas.html` y `public/nosotros.html` — páginas estáticas
  independientes (no pasan por React). Rutas resueltas en `vercel.json`
  (`/boletas`, `/nosotros`, `/admin`).
- `src/App.jsx` — portal viejo sin protección, **ya no se usa** (se puede
  borrar; `main.jsx` no lo importa).
- `database/*.sql` — todos los scripts SQL corridos hasta ahora en Supabase,
  en orden cronológico aproximado (nombres autoexplicativos). El esquema
  base original (`schema_howria.sql`) no está aquí — ya se corrió al
  principio del proyecto; si hace falta reconstruir la base desde cero,
  avisar.

## Variables de entorno (Vercel)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_KEY` (publishable/anon key, no la secret key)

## Cómo correrlo local

```bash
npm install
cp .env.example .env   # completar con las credenciales reales de Supabase
npm run dev
```

## Notas importantes

- **RLS activado** en todas las tablas: solo usuarios autenticados
  (Supabase Auth) pueden leer/escribir. Desde `database/rls_permisos_por_rol.sql`
  (**hay que correrlo a mano en el SQL Editor de Supabase — todavía no se ha
  ejecutado ahí**) los permisos ya distinguen por rol a nivel de base de
  datos, no solo de interfaz: por ejemplo, solo `administrador` puede
  escribir en `usuarios` (antes cualquiera podía auto-ascenderse de rol), y
  `boletas`/`pagos_trabajadores` quedan restringidos a coordinador y
  administrador. Ver ese archivo para la matriz completa de qué rol puede
  hacer qué en cada tabla.
- El login usa Supabase Auth con correos sintéticos tipo
  `nombre.apellido@howria.local` (no reciben correos reales — las cuentas
  se crean/gestionan a mano en Supabase → Authentication → Users).
- Los permisos por pestaña y rol, y el % de recargo de fin de semana/
  feriado, se editan desde la propia app (pestaña "Usuarios" y "Boletas"
  respectivamente) y se guardan en las tablas `permisos_roles` y
  `configuracion`.
- Pendiente conocido: feriados hardcodeados hasta fines de 2026
  (`FERIADOS_CHILE` en `HowriaAdmin.jsx`, hay que actualizarlos para 2027);
  varias secciones del panel (Equipo: objetivos/tareas, Agenda, Seguimiento
  de prospectos) guardan sus datos solo en memoria del navegador — no están
  conectadas a Supabase todavía, así que se pierden al recargar la página.
