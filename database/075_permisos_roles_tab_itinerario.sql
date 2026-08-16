-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Itinerario" (copia de "Calendario" — mismo
-- componente CalendarioAlumnos, mismo diseño y funcionamiento, pedida
-- aparte por Javier) en permisos_roles, para entrenador/coordinador/
-- administrador — no paseador. Mismo patrón que
-- 074_permisos_roles_tab_calendario.sql.

update permisos_roles set tabs = array_append(tabs, 'itinerario')
where rol in ('entrenador', 'coordinador', 'administrador')
  and not ('itinerario' = any(tabs));
