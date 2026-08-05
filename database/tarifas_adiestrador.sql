-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Precio de evaluación/clase que cada adiestrador define junto con su
-- horario semanal (pestaña Agenda) — se muestra en la página pública de
-- reserva (/agendaadiestrador) y queda guardado en cada cita al momento
-- de solicitarla, para no cambiar retroactivamente si el precio se edita
-- después.

create table if not exists tarifas_adiestrador (
  adiestrador text primary key,
  precio_evaluacion integer not null default 0,
  precio_clase integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table tarifas_adiestrador enable row level security;

drop policy if exists "tarifas_select" on tarifas_adiestrador;
drop policy if exists "tarifas_insert" on tarifas_adiestrador;
drop policy if exists "tarifas_update" on tarifas_adiestrador;
drop policy if exists "tarifas_delete" on tarifas_adiestrador;

create policy "tarifas_select" on tarifas_adiestrador for select using (auth.role() = 'authenticated');
create policy "tarifas_insert" on tarifas_adiestrador for insert with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "tarifas_update" on tarifas_adiestrador for update using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "tarifas_delete" on tarifas_adiestrador for delete using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);

-- Precio congelado al momento de la solicitud (null en citas viejas, que
-- se crearon antes de que existiera este campo).
alter table citas_agenda add column if not exists precio integer;
