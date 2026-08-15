-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: ruta guiada del paseador (Mis Paseos) — la pantalla final le
-- muestra cuánto lleva reunido este mes contra su meta. La fija el
-- coordinador/administrador por paseador, no el propio paseador — mismo
-- criterio que capacidad_maxima. Queda nullable a propósito: "sin meta
-- configurada" hasta que alguien le ponga un número desde Usuarios, en vez
-- de mostrarle un 0% a todo el mundo de entrada.
--
-- Misma columna agregada también a usuarios_seguro (si no, nunca llega al
-- frontend aunque exista en la tabla) — al final del select, no en el
-- medio: "create or replace view" trata insertar una columna en el medio
-- como un rename de la que queda corrida de lugar (ERROR 42P16), ya
-- documentado en 048_usuarios_capacidad_maxima.sql.

alter table usuarios add column if not exists meta_mensual integer;

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
  meta_mensual
from usuarios;

grant select on usuarios_seguro to authenticated;
