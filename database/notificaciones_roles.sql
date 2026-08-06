-- Corre esto en el SQL Editor de Supabase (proyecto Howria).
-- Qué rol recibe qué notificación push (nueva solicitud de cita, nuevo
-- correo entrante) — igual que permisos_roles pero para avisos en vez de
-- pestañas. Por defecto los tres roles reciben ambos avisos (mismo
-- comportamiento que había antes de que existiera esta tabla); se ajusta
-- desde el panel, pestaña Usuarios.
create table if not exists notificaciones_roles (
  rol text primary key,
  eventos text[] not null default '{}'
);

insert into notificaciones_roles (rol, eventos) values
  ('entrenador', ARRAY['cita', 'correo']),
  ('coordinador', ARRAY['cita', 'correo']),
  ('administrador', ARRAY['cita', 'correo'])
on conflict (rol) do nothing;

alter table notificaciones_roles enable row level security;

-- Mismo esquema de permisos que permisos_roles: cualquiera autenticado lee
-- (hace falta saber a quién avisar), solo administrador lo edita.
drop policy if exists "notificaciones_roles_select" on notificaciones_roles;
create policy "notificaciones_roles_select" on notificaciones_roles for select using (auth.role() = 'authenticated');

drop policy if exists "notificaciones_roles_insert_admin" on notificaciones_roles;
create policy "notificaciones_roles_insert_admin" on notificaciones_roles for insert with check (mi_rol() = 'administrador');

drop policy if exists "notificaciones_roles_update_admin" on notificaciones_roles;
create policy "notificaciones_roles_update_admin" on notificaciones_roles for update using (mi_rol() = 'administrador') with check (mi_rol() = 'administrador');

drop policy if exists "notificaciones_roles_delete_admin" on notificaciones_roles;
create policy "notificaciones_roles_delete_admin" on notificaciones_roles for delete using (mi_rol() = 'administrador');
