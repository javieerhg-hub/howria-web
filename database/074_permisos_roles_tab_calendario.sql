-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Calendario" (calendario del mes con las
-- citas del adiestrador — antes solo vivía como sub-vista dentro de
-- Alumnos) en permisos_roles, para entrenador/coordinador/administrador
-- — no paseador. Mismo patrón que 065_permisos_roles_tab_alumnos.sql.

update permisos_roles set tabs = array_append(tabs, 'calendario')
where rol in ('entrenador', 'coordinador', 'administrador')
  and not ('calendario' = any(tabs));
