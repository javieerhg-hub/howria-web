-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: para poder avisar cuando la manada de un paseador se pasa de
-- lo que puede sostener con seguridad, hace falta saber cuál es su
-- límite. Queda nullable a propósito — "sin límite configurado" hasta
-- que un administrador le ponga un número desde Usuarios, en vez de
-- marcar a todo el mundo como sobrecargado de entrada.
--
-- La app lee usuarios desde la vista usuarios_seguro (ver
-- 027_usuarios_datos_bancarios_privados.sql), así que hay que agregar la
-- columna nueva ahí también — si no, nunca llegaría al frontend aunque
-- exista en la tabla. "create or replace view" solo permite agregar
-- columnas al final de la lista, no en el medio (Postgres lo trata como
-- un rename de la columna que quede corrida de lugar) — por eso
-- capacidad_maxima va después de numero_cuenta, no junto a las demás.

alter table usuarios add column if not exists capacidad_maxima integer;

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
  capacidad_maxima
from usuarios;

grant select on usuarios_seguro to authenticated;
