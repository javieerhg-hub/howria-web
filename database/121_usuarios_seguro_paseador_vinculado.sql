-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Arregla la 120: la columna paseador_vinculado se agrego a la tabla
-- usuarios, pero el frontend NO lee la tabla — lee la vista
-- usuarios_seguro. Resultado: el vinculo se guardaba y al recargar volvia
-- vacio, porque nunca llegaba de vuelta.
--
-- Es la misma trampa que ya documenta 086_usuarios_calendario_token.sql.
-- La columna nueva va AL FINAL del select, nunca en el medio: cambiar el
-- orden de un create or replace view da ERROR 42P16 (ver
-- 048_usuarios_capacidad_maxima.sql).
--
-- Sin case: no es dato sensible. Solo dice que dos cuentas son la misma
-- persona, y quien pueda ver la ficha ya ve el nombre.

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
    then numero_cuenta else null end as numero_cuenta,
  capacidad_maxima,
  meta_mensual,
  case when mi_rol() in ('administrador', 'coordinador') or email = (auth.jwt() ->> 'email')
    then calendario_token else null end as calendario_token,
  paseador_vinculado
from usuarios;

grant select on usuarios_seguro to authenticated;
