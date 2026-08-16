-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- `disponibilidad_fecha` (058) guardaba un solo rango hora_inicio/hora_fin
-- por (adiestrador, fecha) — todo el día abierto de corrido. Javier pidió
-- en cambio bloques horarios específicos que el adiestrador habilita uno
-- por uno dentro del día (ej. 9-10 y 15-16, pero no lo de en medio).
--
-- Se rehace la tabla: ahora una fila = un bloque de 1 hora habilitado
-- (adiestrador, fecha, hora_inicio) — sin columna "disponible" ni
-- "hora_fin": que la fila EXISTA ya significa que ese bloque está abierto.
-- Se dropea y crea de nuevo en vez de alterar porque el modelo cambia de
-- raíz (una fila por día -> una fila por bloque) y la tabla se creó hace
-- muy poco (058), sin datos reales cargados todavía.

drop table if exists disponibilidad_fecha cascade;

create table disponibilidad_fecha (
  id uuid primary key default gen_random_uuid(),
  adiestrador text not null,
  fecha date not null,
  hora_inicio time not null,
  created_at timestamptz not null default now(),
  unique (adiestrador, fecha, hora_inicio)
);
alter table disponibilidad_fecha enable row level security;

-- Las filas no tienen nada sensible (solo adiestrador/fecha/hora) — se
-- simplifica a que cualquier autenticado pueda leerlas todas (para
-- calcular horarios libres); solo el dueño o coordinador/administrador
-- pueden agregar/quitar bloques.
create policy "disponibilidad_fecha_select" on disponibilidad_fecha for select using (
  auth.role() = 'authenticated'
);
create policy "disponibilidad_fecha_insert" on disponibilidad_fecha for insert with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "disponibilidad_fecha_delete" on disponibilidad_fecha for delete using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
