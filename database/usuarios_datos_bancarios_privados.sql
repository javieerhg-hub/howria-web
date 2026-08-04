-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Hoy cualquier persona del equipo autenticada puede leer el banco/cuenta
-- de sus compañeros (RLS es por fila, no por columna). Esta vista oculta
-- esos 3 campos salvo para administrador/coordinador o para la propia
-- persona — la app ahora lee usuarios desde esta vista en vez de la
-- tabla directamente (los guardados/ediciones siguen yendo a la tabla
-- real, eso no cambia).

create or replace view usuarios_seguro
with (security_invoker = true)
as
select
  id,
  nombre,
  rol,
  foto_url,
  fecha_inicio,
  email,
  capacitacion_completada,
  case when mi_rol() in ('administrador', 'coordinador') or email = (auth.jwt() ->> 'email')
    then banco else null end as banco,
  case when mi_rol() in ('administrador', 'coordinador') or email = (auth.jwt() ->> 'email')
    then tipo_cuenta else null end as tipo_cuenta,
  case when mi_rol() in ('administrador', 'coordinador') or email = (auth.jwt() ->> 'email')
    then numero_cuenta else null end as numero_cuenta
from usuarios;

grant select on usuarios_seguro to authenticated;
