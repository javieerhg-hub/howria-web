-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Reemplaza la regla "todo o nada" (solo_autenticados) por permisos reales
-- por rol, en las tablas que la app realmente usa hoy. Ver database/README
-- o el commit que agrega este archivo para el detalle de la matriz de acceso.

-- ============================================================
-- 0) Funciones helper: rol y nombre del usuario autenticado actual
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
-- 1) usuarios — cualquiera autenticado lee, solo administrador escribe.
--    (antes cualquiera podía cambiarse el rol a sí mismo)
-- ============================================================
drop policy if exists "solo_autenticados" on usuarios;
create policy "usuarios_select" on usuarios for select using (auth.role() = 'authenticated');
create policy "usuarios_insert_admin" on usuarios for insert with check (mi_rol() = 'administrador');
create policy "usuarios_update_admin" on usuarios for update using (mi_rol() = 'administrador') with check (mi_rol() = 'administrador');
create policy "usuarios_delete_admin" on usuarios for delete using (mi_rol() = 'administrador');

-- ============================================================
-- 2) permisos_roles — cualquiera autenticado lee (lo necesita para saber
--    qué pestañas ve), solo administrador lo edita.
-- ============================================================
drop policy if exists "solo_autenticados" on permisos_roles;
create policy "permisos_roles_select" on permisos_roles for select using (auth.role() = 'authenticated');
create policy "permisos_roles_insert_admin" on permisos_roles for insert with check (mi_rol() = 'administrador');
create policy "permisos_roles_update_admin" on permisos_roles for update using (mi_rol() = 'administrador') with check (mi_rol() = 'administrador');
create policy "permisos_roles_delete_admin" on permisos_roles for delete using (mi_rol() = 'administrador');

-- ============================================================
-- 3) clientes — cualquiera autenticado lee (el entrenador necesita ver
--    sus clientes asignados), solo coordinador/administrador escriben.
-- ============================================================
drop policy if exists "solo_autenticados" on clientes;
create policy "clientes_select" on clientes for select using (auth.role() = 'authenticated');
create policy "clientes_insert_coord_admin" on clientes for insert with check (mi_rol() in ('coordinador', 'administrador'));
create policy "clientes_update_coord_admin" on clientes for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
create policy "clientes_delete_coord_admin" on clientes for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- 4) boletas (paseos) — solo coordinador/administrador, tal como ya
--    limitan las pestañas "Boletas" y "Facturas" hoy.
-- ============================================================
drop policy if exists "solo_autenticados" on boletas;
create policy "boletas_select_coord_admin" on boletas for select using (mi_rol() in ('coordinador', 'administrador'));
create policy "boletas_insert_coord_admin" on boletas for insert with check (mi_rol() in ('coordinador', 'administrador'));
create policy "boletas_update_coord_admin" on boletas for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
create policy "boletas_delete_coord_admin" on boletas for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- 5) boletas_adiestramiento — el rol entrenador también tiene esta
--    pestaña (genera sus propias boletas de clase), así que puede leer/
--    crear/editar; eliminar queda solo para coordinador/administrador.
-- ============================================================
drop policy if exists "solo_autenticados" on boletas_adiestramiento;
create policy "boletas_adiestramiento_select" on boletas_adiestramiento for select using (auth.role() = 'authenticated');
create policy "boletas_adiestramiento_insert" on boletas_adiestramiento for insert with check (auth.role() = 'authenticated');
create policy "boletas_adiestramiento_update" on boletas_adiestramiento for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "boletas_adiestramiento_delete_coord_admin" on boletas_adiestramiento for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- 6) pagos_trabajadores — solo coordinador/administrador (pestaña
--    "Pago trabajadores" no está disponible para entrenador).
-- ============================================================
drop policy if exists "solo_autenticados" on pagos_trabajadores;
create policy "pagos_trabajadores_select_coord_admin" on pagos_trabajadores for select using (mi_rol() in ('coordinador', 'administrador'));
create policy "pagos_trabajadores_insert_coord_admin" on pagos_trabajadores for insert with check (mi_rol() in ('coordinador', 'administrador'));
create policy "pagos_trabajadores_update_coord_admin" on pagos_trabajadores for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
create policy "pagos_trabajadores_delete_coord_admin" on pagos_trabajadores for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- 7) registro_paseos — coordinador/administrador ven y editan todo;
--    entrenador solo sus propios paseos (por nombre de paseador).
-- ============================================================
drop policy if exists "solo_autenticados" on registro_paseos;
create policy "registro_paseos_select" on registro_paseos for select using (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
);
create policy "registro_paseos_insert" on registro_paseos for insert with check (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
);
create policy "registro_paseos_update" on registro_paseos for update using (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
);
create policy "registro_paseos_delete" on registro_paseos for delete using (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
);

-- ============================================================
-- 8) configuracion — cualquiera autenticado lee (recargo fin de semana,
--    etc.), solo coordinador/administrador lo edita.
-- ============================================================
drop policy if exists "solo_autenticados" on configuracion;
create policy "configuracion_select" on configuracion for select using (auth.role() = 'authenticated');
create policy "configuracion_insert_coord_admin" on configuracion for insert with check (mi_rol() in ('coordinador', 'administrador'));
create policy "configuracion_update_coord_admin" on configuracion for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
create policy "configuracion_delete_coord_admin" on configuracion for delete using (mi_rol() in ('coordinador', 'administrador'));
