-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Notificaciones" (mandar un aviso a mano a un
-- entrenador o paseador puntual) en permisos_roles, solo para coordinador y
-- administrador — no paseador ni entrenador, que son quienes reciben el
-- aviso, no quienes lo mandan. Mismo patrón que 065_permisos_roles_tab_alumnos.sql.

update permisos_roles set tabs = array_append(tabs, 'notificaciones')
where rol in ('coordinador', 'administrador')
  and not ('notificaciones' = any(tabs));
