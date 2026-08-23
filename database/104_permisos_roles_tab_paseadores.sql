-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Paseadores" en permisos_roles, solo para
-- coordinador y administrador (decisión explícita de Javier: muestra
-- sueldos y metas de todo el equipo, así que se trata como Finanzas o
-- Pago trabajadores). Mismo patrón que
-- 091_permisos_roles_tab_inventario.sql / 087_permisos_roles_tab_notificaciones.sql.

update permisos_roles set tabs = array_append(tabs, 'paseadores')
where rol in ('coordinador', 'administrador')
  and not ('paseadores' = any(tabs));
