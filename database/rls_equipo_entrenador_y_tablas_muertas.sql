-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto (audit agosto 2026): citas_agenda, equipo_interno,
-- objetivos_semanales, objetivos_mensuales, tareas_equipo y prospectos
-- ya habían sido acotadas por rol en una sesión anterior
-- (equipo_agenda_prospectos.sql) — el audit no lo vio porque solo leyó
-- los archivos .sql, no el estado real en Supabase. Al revisar en vivo
-- se encontraron dos cosas sueltas:
--
-- 1) El rol entrenador tiene hoy la pestaña "Equipo" habilitada en
--    Usuarios, pero equipo_interno/objetivos_semanales/
--    objetivos_mensuales/tareas_equipo solo dejaban pasar a
--    coordinador/administrador — la pestaña le quedaba vacía. Se agrega
--    entrenador a esas 4 tablas, mismo nivel de acceso que coordinador
--    (decisión confirmada con el dueño del negocio).
--
-- 2) pagos, servicios y trabajadores seguían con la política original
--    "cualquiera autenticado" sin acotar — son tablas que el código de
--    la app no usa (ningún .from() las referencia), así que se acotan
--    a solo administrador por higiene, sin impacto funcional.

do $$
declare
  t text;
begin
  foreach t in array array['equipo_interno', 'objetivos_semanales', 'objetivos_mensuales', 'tareas_equipo']
  loop
    execute format('drop policy if exists "%s_select_coord_admin" on %I', t, t);
    execute format('create policy "%s_select_coord_admin" on %I for select using (mi_rol() in (''coordinador'', ''administrador'', ''entrenador''))', t, t);
    execute format('drop policy if exists "%s_insert_coord_admin" on %I', t, t);
    execute format('create policy "%s_insert_coord_admin" on %I for insert with check (mi_rol() in (''coordinador'', ''administrador'', ''entrenador''))', t, t);
    execute format('drop policy if exists "%s_update_coord_admin" on %I', t, t);
    execute format('create policy "%s_update_coord_admin" on %I for update using (mi_rol() in (''coordinador'', ''administrador'', ''entrenador'')) with check (mi_rol() in (''coordinador'', ''administrador'', ''entrenador''))', t, t);
    execute format('drop policy if exists "%s_delete_coord_admin" on %I', t, t);
    execute format('create policy "%s_delete_coord_admin" on %I for delete using (mi_rol() in (''coordinador'', ''administrador'', ''entrenador''))', t, t);
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['pagos', 'servicios', 'trabajadores']
  loop
    execute format('drop policy if exists "solo_autenticados" on %I', t);
    execute format('create policy "%s_admin_only" on %I for all using (mi_rol() = ''administrador'') with check (mi_rol() = ''administrador'')', t, t);
  end loop;
end $$;
