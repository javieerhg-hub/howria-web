-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registro de qué recordatorio automático ya salió hoy. Lo usa
-- api/recordatorios.js, que Vercel dispara con dos crons al día: uno a las
-- 8:30 ("sal a tu ruta") y otro a las 18:00 ("¿marcaste tus paseos?").
--
-- NO ES UN LOG BONITO: es lo que evita mandar el aviso dos veces.
--
-- Dos motivos, los dos reales:
--
--  1. La documentación de Vercel lo dice con todas sus letras: "cron
--     delivery can occasionally invoke the same scheduled run more than
--     once". O sea que la función TIENE que aguantar que la llamen dos
--     veces por el mismo horario.
--
--  2. Y en este caso además la vamos a llamar dos veces a propósito. Los
--     crons de Vercel corren siempre en UTC ("the timezone is always
--     UTC"), y Chile cambia la hora dos veces al año. Para que el aviso
--     caiga a las 8:30 de Chile en las dos temporadas hay DOS crons por
--     horario —uno pensado para el horario de verano y otro para el de
--     invierno— y solo el que cae en la ventana correcta manda. El otro
--     se topa con esta tabla y se va en silencio.
--
-- La clave es "<momento>-<fecha de Chile>", por ejemplo "manana-2026-09-07".
-- Al ser PRIMARY KEY, el segundo insert del día falla solo: no hace falta
-- ninguna comprobación previa, que es justo lo que se puede correr dos
-- veces a la vez y dar el mismo resultado equivocado.
create table if not exists recordatorios_enviados (
  clave text primary key,
  enviado_en timestamptz not null default now(),
  -- A cuántas suscripciones push se mandó. Sirve para darse cuenta de que
  -- el recordatorio "salió" pero no le llegó a nadie porque el equipo no
  -- tiene las notificaciones activadas en el teléfono.
  a_cuantos integer not null default 0,
  -- A quiénes, en texto. Para poder mirar después por qué a alguien no le
  -- llegó sin tener que reconstruirlo.
  detalle text
);

create index if not exists recordatorios_enviados_recientes_idx
  on recordatorios_enviados (enviado_en desc);

alter table recordatorios_enviados enable row level security;

-- Escribe SOLO la función serverless, que usa la service role key y se
-- salta la RLS. No hay policy de insert para nadie más a propósito: si
-- alguien pudiera escribir acá, podría "reservar" el recordatorio del día
-- y dejar al equipo sin aviso.
drop policy if exists "recordatorios_select_admin" on recordatorios_enviados;
create policy "recordatorios_select_admin" on recordatorios_enviados
  for select using (mi_rol() = 'administrador');

-- OJO: nada limpia esta tabla sola (la app no tiene ningún trabajo
-- programado más allá de estos crons). Son 2 filas por día, unas 730 al
-- año — no necesita limpieza en años.
