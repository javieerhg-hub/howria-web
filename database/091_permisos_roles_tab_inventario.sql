-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Inventario" en permisos_roles, solo para
-- coordinador y administrador — mismo patrón que
-- 065_permisos_roles_tab_alumnos.sql / 087_permisos_roles_tab_notificaciones.sql.

update permisos_roles set tabs = array_append(tabs, 'inventario')
where rol in ('coordinador', 'administrador')
  and not ('inventario' = any(tabs));
