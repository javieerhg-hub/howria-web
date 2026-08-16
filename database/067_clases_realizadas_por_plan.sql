-- Corre esto en el SQL Editor de Supabase (proyecto Howria), DESPUÉS de
-- 066_planes_clases.sql
--
-- clases_realizadas (062, corrida hoy mismo, todavía sin datos reales)
-- apuntaba a boleta_adiestramiento_id. Ahora que el pack pasa a ser
-- planes_clases (066), se recrea apuntando ahí — se dropea y crea de
-- nuevo, no se altera, porque está vacía y el cambio es de raíz (mismo
-- criterio ya usado en 059 cuando disponibilidad_fecha cambió de modelo).
--
-- numero_clase ahora puede ser 0: es la convención para "Evaluación" —
-- vive en la misma tabla que las clases (1..N) para poder reusar el
-- mismo checklist y la misma restricción unique sin una tabla aparte.

drop table if exists clases_realizadas cascade;

create table clases_realizadas (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references planes_clases(id) on delete cascade,
  numero_clase int not null check (numero_clase >= 0),
  fecha_realizada date not null,
  temas text[] not null default '{}',
  notas text,
  creado_por text,
  creado_en timestamptz not null default now(),
  unique (plan_id, numero_clase)
);
alter table clases_realizadas enable row level security;

create policy "clases_realizadas_select" on clases_realizadas for select using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_insert" on clases_realizadas for insert with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_update" on clases_realizadas for update using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_delete" on clases_realizadas for delete using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
