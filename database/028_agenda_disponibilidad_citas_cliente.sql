-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Habilita la reserva de citas de adiestramiento por parte del cliente
-- (tutor) y la confirmación/rechazo por parte del adiestrador:
--   1) el tutor ve horarios libres del adiestrador y crea una cita "pendiente"
--   2) el adiestrador la confirma (pasa a "agendada", como ya funcionaba el
--      agendamiento manual de staff) o la rechaza ("rechazada")
-- No borra ni recrea citas_agenda — la extiende con ALTER TABLE para no
-- perder las citas ya guardadas.

-- ============================================================
-- 0) citas_agenda — nuevas columnas para el flujo de reserva por cliente.
--    Va primero porque la función citas_ocupadas_dia() de más abajo
--    referencia duracion_min — tiene que existir antes de crearla.
-- ============================================================
alter table citas_agenda add column if not exists origen text not null default 'staff' check (origen in ('staff', 'cliente'));
alter table citas_agenda add column if not exists duracion_min integer not null default 60;
alter table citas_agenda add column if not exists confirmada_en timestamptz;
alter table citas_agenda add column if not exists email_enviado boolean not null default false;

alter table citas_agenda drop constraint if exists citas_agenda_estado_check;
alter table citas_agenda add constraint citas_agenda_estado_check
  check (estado in ('pendiente', 'agendada', 'realizada', 'cancelada', 'rechazada'));

-- ============================================================
-- 1) Funciones helper (mismo estilo que mi_rol()/mi_nombre() en
--    rls_permisos_por_rol.sql — "or replace" para que este script
--    funcione solo sin importar el orden en que corras los otros).
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

-- id del cliente (tutor) autenticado actual, buscado por su correo en la
-- tabla clientes (los clientes no están en "usuarios", por eso mi_rol()
-- no les sirve — este es su equivalente).
create or replace function mi_cliente_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from clientes where email = (auth.jwt() ->> 'email') limit 1;
$$;

-- Citas ya ocupadas de un adiestrador en un día (solo fecha_hora y
-- duración — nada de nombres/notas de otros clientes) para que un
-- cliente pueda calcular qué horarios están libres sin poder leer las
-- citas ajenas directamente de citas_agenda.
create or replace function citas_ocupadas_dia(p_adiestrador text, p_fecha date)
returns table (fecha_hora timestamptz, duracion_min integer)
language sql
security definer
set search_path = public
stable
as $$
  select fecha_hora, duracion_min
  from citas_agenda
  where adiestrador = p_adiestrador
    and estado in ('pendiente', 'agendada')
    and fecha_hora >= p_fecha::timestamptz
    and fecha_hora < (p_fecha + 1)::timestamptz;
$$;

-- ============================================================
-- 2) disponibilidad_adiestrador — horario semanal por adiestrador
--    (v1: un solo rango activo/inactivo por día de semana)
-- ============================================================
create table if not exists disponibilidad_adiestrador (
  id uuid primary key default gen_random_uuid(),
  adiestrador text not null,
  dia_semana int not null check (dia_semana between 0 and 6), -- 0=lunes .. 6=domingo
  hora_inicio time not null,
  hora_fin time not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (adiestrador, dia_semana)
);
alter table disponibilidad_adiestrador enable row level security;

-- ============================================================
-- 3) RLS citas_agenda — reemplaza las políticas coord/admin-only por
--    versiones que también dejan al adiestrador ver/actualizar sus
--    propias citas, y al cliente crear/ver las suyas.
-- ============================================================
drop policy if exists "citas_agenda_select_coord_admin" on citas_agenda;
drop policy if exists "citas_agenda_insert_coord_admin" on citas_agenda;
drop policy if exists "citas_agenda_update_coord_admin" on citas_agenda;
-- citas_agenda_delete_coord_admin queda igual (solo coordinador/administrador borran)

create policy "citas_agenda_select" on citas_agenda for select using (
  mi_rol() in ('coordinador', 'administrador')
  or adiestrador = mi_nombre()
  or cliente_id = mi_cliente_id()
);
create policy "citas_agenda_insert" on citas_agenda for insert with check (
  mi_rol() in ('coordinador', 'administrador')
  or adiestrador = mi_nombre()
  or (origen = 'cliente' and estado = 'pendiente' and cliente_id = mi_cliente_id())
);
create policy "citas_agenda_update" on citas_agenda for update using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);

-- ============================================================
-- 4) RLS disponibilidad_adiestrador — cualquier autenticado lee solo las
--    franjas activas (para calcular horarios libres); el adiestrador
--    dueño y staff leen/editan todo lo propio.
-- ============================================================
create policy "disponibilidad_select" on disponibilidad_adiestrador for select using (
  auth.role() = 'authenticated'
  and (activo = true or mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre())
);
create policy "disponibilidad_insert" on disponibilidad_adiestrador for insert with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "disponibilidad_update" on disponibilidad_adiestrador for update using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "disponibilidad_delete" on disponibilidad_adiestrador for delete using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);

-- ============================================================
-- 5) permisos_roles — da acceso a la pestaña "agenda" al rol entrenador
--    (aditivo: no toca los permisos que ya tenga).
-- ============================================================
update permisos_roles
  set tabs = array(select distinct unnest(tabs || array['agenda']))
  where rol = 'entrenador';

insert into permisos_roles (rol, tabs)
  select 'entrenador', array['agenda']
  where not exists (select 1 from permisos_roles where rol = 'entrenador');
