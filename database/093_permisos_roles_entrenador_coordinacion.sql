-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Le da acceso a la pestaña "Coordinación" al rol entrenador (pedido
-- explícito de Javier, para que pueda usar "Reprogramar paseos" ahí
-- adentro). Coordinación no tiene permisos separados por sección, así
-- que esto también le da acceso a "Hoy" (calendario de todos los
-- paseadores) y "Semana" (carga de todo el equipo) — mismo patrón que
-- 065_permisos_roles_tab_alumnos.sql / 091_permisos_roles_tab_inventario.sql.

update permisos_roles set tabs = array_append(tabs, 'coordinacion')
where rol = 'entrenador'
  and not ('coordinacion' = any(tabs));
