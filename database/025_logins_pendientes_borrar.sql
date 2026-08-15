-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Lista chica de recordatorio: cuando se elimina a alguien desde
-- Usuarios, su login de Supabase Auth NO se borra (eso requiere ir a
-- Authentication → Users a mano). Esta tabla guarda esos nombres/correos
-- para que el administrador no se le olvide limpiarlos ahí después.

create table if not exists logins_pendientes_borrar (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  eliminado_en timestamptz not null default now()
);

alter table logins_pendientes_borrar enable row level security;

drop policy if exists "logins_pendientes_borrar_select_admin" on logins_pendientes_borrar;
create policy "logins_pendientes_borrar_select_admin" on logins_pendientes_borrar for select using (mi_rol() = 'administrador');
drop policy if exists "logins_pendientes_borrar_insert_admin" on logins_pendientes_borrar;
create policy "logins_pendientes_borrar_insert_admin" on logins_pendientes_borrar for insert with check (mi_rol() = 'administrador');
drop policy if exists "logins_pendientes_borrar_delete_admin" on logins_pendientes_borrar;
create policy "logins_pendientes_borrar_delete_admin" on logins_pendientes_borrar for delete using (mi_rol() = 'administrador');
