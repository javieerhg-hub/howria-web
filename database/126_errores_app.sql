-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Errores de la app, anotados solos. Hasta ahora, si a un paseador se le
-- rompía la pantalla a las 8 de la mañana en la calle, Javier se enteraba
-- solo si esa persona le escribía. No había ni monitoreo de errores ni
-- analítica: el sistema de detección de fallas era WhatsApp.
--
-- Se guardan en la propia base y no en un servicio externo a propósito:
-- no hay cuenta nueva que crear, ni costo, ni un dato del negocio saliendo
-- a un tercero. Alcanza de sobra para el tamaño de Howria.

create table if not exists errores_app (
  id uuid primary key default gen_random_uuid(),
  creado_en timestamptz not null default now(),
  -- El mensaje del error, ya recortado por el cliente.
  mensaje text not null,
  -- El stack o el detalle de React, para poder ubicarlo en el código.
  detalle text,
  -- En qué pestaña o página pasó.
  donde text,
  -- Quién lo vio. Es lo que permite preguntarle qué estaba haciendo.
  usuario_email text,
  rol text,
  -- Navegador y versión desplegada: sin esto, un error que solo pasa en el
  -- Safari de un iPhone viejo es imposible de reproducir.
  navegador text,
  version_app text
);

-- Se consulta siempre por "los últimos", nunca por otra cosa.
create index if not exists errores_app_recientes_idx on errores_app (creado_en desc);

alter table errores_app enable row level security;

-- ESCRIBIR: cualquiera con sesión. Un paseador tiene que poder reportar su
-- propio error — es justo el caso que esto viene a resolver — y no puede
-- depender de tener permisos de administrador.
drop policy if exists "errores_insert" on errores_app;
create policy "errores_insert" on errores_app
  for insert to authenticated with check (true);

-- LEER Y BORRAR: solo administrador. Un stack trace puede llevar adentro
-- datos de la pantalla en que se rompió, así que no lo ve el equipo.
drop policy if exists "errores_select_admin" on errores_app;
create policy "errores_select_admin" on errores_app
  for select using (mi_rol() = 'administrador');

drop policy if exists "errores_delete_admin" on errores_app;
create policy "errores_delete_admin" on errores_app
  for delete using (mi_rol() = 'administrador');

-- OJO, dos cosas que quedan fuera a propósito:
--
-- 1. Las páginas públicas (/agendar, /cachorros) NO reportan: ahí no hay
--    sesión, y abrir el insert a "anon" sería un formulario de spam
--    abierto a internet. Un error en el link público de agendar es
--    justamente el que cuesta un cliente, así que vale la pena resolverlo
--    después — pero con algo que no deje la puerta abierta.
--
-- 2. Nada limpia esta tabla sola (la app no tiene ningún trabajo
--    programado, ver vercel.json). Se borra a mano desde Usuarios. Con el
--    tope por sesión que pone el cliente, no debería crecer sola.
