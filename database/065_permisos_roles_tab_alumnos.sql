-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Registra la pestaña nueva "Alumnos" (seguimiento de clases de
-- adiestramiento) en permisos_roles, para entrenador/coordinador/
-- administrador — no paseador. Mismo patrón que ya usó
-- 002_boletas_adiestramiento.sql al agregar su propia pestaña.

update permisos_roles set tabs = array_append(tabs, 'alumnos')
where rol in ('entrenador', 'coordinador', 'administrador')
  and not ('alumnos' = any(tabs));
