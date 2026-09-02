-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- REEMPLAZA a la 121: hace lo mismo y ademas agrega la columna nueva. Da
-- igual si ya corriste la 121 — esta se puede correr encima sin problema.
--
-- Contexto: en "Finanzas personales", de los clientes que pasea otra
-- persona, la diferencia entre lo que paga el tutor y lo que se le paga a
-- ella NO siempre es de Howria. Constanza si trabaja asi. Javier Arniaz y
-- Andreina van aparte: su margen no es de Howria.
--
-- Eso no se puede deducir de los datos ni escribir en el codigo (seria
-- clavar nombres de personas), asi que se marca por persona.
--
-- Nace en false para todos: mejor una seccion en $0 que un titular
-- inflado con plata que no es tuya. La linea de abajo deja marcada a
-- Constanza, que es el unico caso hoy — si te equivocaste de persona,
-- borra esa linea y marcala desde la pestana.
--
-- La vista se rehace con las DOS columnas al final del select, en ese
-- orden: cambiar el orden de las que ya estaban da ERROR 42P16
-- (ver 048_usuarios_capacidad_maxima.sql).

alter table usuarios add column if not exists margen_va_a_howria boolean not null default false;

update usuarios set margen_va_a_howria = true
where nombre = 'Constanza Clara Luz Saldias Correa';

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
  paseador_vinculado,
  margen_va_a_howria
from usuarios;

grant select on usuarios_seguro to authenticated;
