-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Recrea equipo_interno, objetivos_semanales, objetivos_mensuales,
-- tareas_equipo, citas_agenda y prospectos con la estructura que la app
-- realmente usa (confirmado: estas tablas no tenían datos guardados).

-- ============================================================
-- 0) Funciones helper (idénticas a rls_permisos_por_rol.sql — se vuelven
--    a definir aquí con "or replace" para que este script funcione solo,
--    sin importar si ya corriste ese otro script antes.)
-- ============================================================
create or replace function mi_rol()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select rol from usuarios where email = (auth.jwt() ->> 'email') limit 1;
$$;

create or replace function mi_nombre()
returns text
language sql
security definer
set search_path = public
stable
as $$
  select nombre from usuarios where email = (auth.jwt() ->> 'email') limit 1;
$$;

-- ============================================================
-- 1) equipo_interno
-- ============================================================
drop table if exists equipo_interno cascade;
create table equipo_interno (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  created_at timestamptz not null default now()
);
insert into equipo_interno (nombre) values ('Javier Arniaz'), ('Javier Herrera'), ('Oliska Mendoza')
  on conflict (nombre) do nothing;

-- ============================================================
-- 2) objetivos_semanales
-- ============================================================
drop table if exists objetivos_semanales cascade;
create table objetivos_semanales (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  asignado_a text,
  semana_key text not null,
  cumplido boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3) objetivos_mensuales
-- ============================================================
drop table if exists objetivos_mensuales cascade;
create table objetivos_mensuales (
  id uuid primary key default gen_random_uuid(),
  texto text not null,
  asignado_a text,
  mes_key text not null,
  cumplido boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 4) tareas_equipo
-- ============================================================
drop table if exists tareas_equipo cascade;
create table tareas_equipo (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  asignado_a text,
  enlace text,
  fecha_hora timestamptz not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'hecho')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 5) citas_agenda
-- ============================================================
drop table if exists citas_agenda cascade;
create table citas_agenda (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references clientes(id) on delete set null,
  cliente_nombre text not null,
  perro text,
  tipo text not null,
  adiestrador text,
  fecha_hora timestamptz not null,
  estado text not null default 'agendada' check (estado in ('agendada', 'realizada', 'cancelada')),
  notas text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 6) prospectos
-- ============================================================
drop table if exists prospectos cascade;
create table prospectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  telefono text,
  perro text,
  origen text,
  tipo_servicio text[] not null default '{}',
  estado text not null default 'nuevo',
  proximo_seguimiento date,
  asignado_a text,
  bitacora jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS: coordinador + administrador (Equipo/Agenda/Seguimiento nunca
-- estuvieron en las pestañas del rol entrenador).
-- ============================================================
alter table equipo_interno enable row level security;
alter table objetivos_semanales enable row level security;
alter table objetivos_mensuales enable row level security;
alter table tareas_equipo enable row level security;
alter table citas_agenda enable row level security;
alter table prospectos enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['equipo_interno', 'objetivos_semanales', 'objetivos_mensuales', 'tareas_equipo', 'citas_agenda', 'prospectos']
  loop
    execute format('create policy "%s_select_coord_admin" on %I for select using (mi_rol() in (''coordinador'', ''administrador''))', t, t);
    execute format('create policy "%s_insert_coord_admin" on %I for insert with check (mi_rol() in (''coordinador'', ''administrador''))', t, t);
    execute format('create policy "%s_update_coord_admin" on %I for update using (mi_rol() in (''coordinador'', ''administrador'')) with check (mi_rol() in (''coordinador'', ''administrador''))', t, t);
    execute format('create policy "%s_delete_coord_admin" on %I for delete using (mi_rol() in (''coordinador'', ''administrador''))', t, t);
  end loop;
end $$;
