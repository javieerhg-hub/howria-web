-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: botón "Agregar a mi calendario" en Mis Paseos. Los primeros 3
-- intentos (data: URI, blob: URL con y sin download) fallaron en pruebas
-- reales en iPhone porque ninguno le entrega a Safari algo que reconozca
-- como archivo de calendario. Lo que sí funciona es una SUSCRIPCIÓN
-- (webcal://) a una URL de servidor que la app Calendario vuelve a pedir
-- sola cada cierto tiempo — y esa URL necesita un secreto propio por
-- paseador para identificarlo sin sesión abierta (Calendario la pide en
-- segundo plano, no desde el navegador logueado).
--
-- gen_random_uuid() como default: Postgres calcula uno distinto por cada
-- fila existente al agregar la columna (no repite el mismo valor), así que
-- todo usuario ya tiene un token único apenas se corre esto.
--
-- Misma columna agregada también a usuarios_seguro (si no, nunca llega al
-- frontend aunque exista en la tabla) — al final del select, no en el
-- medio (ver 048_usuarios_capacidad_maxima.sql, ERROR 42P16 ya documentado
-- ahí). Mismo criterio de visibilidad que banco/tipo_cuenta/numero_cuenta:
-- solo administrador/coordinador o la propia persona — un token de
-- calendario ajeno deja ver la dirección y el horario de sus clientes.

alter table usuarios add column if not exists calendario_token uuid not null default gen_random_uuid();

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
    then calendario_token else null end as calendario_token
from usuarios;

grant select on usuarios_seguro to authenticated;
