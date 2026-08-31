-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Índices. Solo los que hacen algo: se revisó consulta por consulta qué
-- filtra de verdad, y varias tablas ya estaban cubiertas por sus
-- restricciones "unique" (Postgres crea un índice para cada una).
--
-- NO se agregan, porque ya están cubiertos:
--   registro_paseos      unique (cliente_id, fecha)
--   usuarios             email unique
--   disponibilidad_fecha unique (adiestrador, fecha)
--   fase_dia_paseador    unique (paseador_nombre, fecha)
--   clases_realizadas    unique (plan_id, numero_clase)
--   avisos_descartados   unique (usuario_email, clave)
--   mensajes_equipo_lecturas  usuario_email es la clave primaria
--   paseos_reprogramados      ya tiene índice propio (database/092)
--
-- Y ojo con registro_paseos: la app la carga entera con select("*") sin
-- filtro, así que ningún índice ayuda a ESA consulta. Si algún día pesa,
-- lo que hay que cambiar es traer solo el rango de fechas que se mira,
-- no agregar índices.

-- 1. Llaves foráneas. Postgres NO las indexa solo. Sin esto, borrar un
--    cliente obliga a recorrer entera cada tabla hija para aplicar el
--    "on delete cascade / set null". Hoy no se nota; es seguro y barato
--    dejarlo listo.
create index if not exists boletas_adiestramiento_cliente_idx on boletas_adiestramiento (cliente_id);
create index if not exists citas_agenda_cliente_idx on citas_agenda (cliente_id);
create index if not exists citas_agenda_prospecto_idx on citas_agenda (prospecto_id);
create index if not exists citas_agenda_plan_idx on citas_agenda (plan_id);
create index if not exists correos_cliente_idx on correos (cliente_id);
create index if not exists correos_prospecto_idx on correos (prospecto_id);
create index if not exists mascotas_cliente_idx on mascotas (cliente_id);
create index if not exists planes_clases_cliente_idx on planes_clases (cliente_id);
create index if not exists planes_clases_boleta_idx on planes_clases (boleta_adiestramiento_id);
-- mascota_id_1 ya va primero en el unique, así que solo falta el segundo.
create index if not exists mascota_incompat_mascota2_idx on mascota_incompatibilidades (mascota_id_2);

-- 2. Consultas que sí filtran hoy, y corren sin sesión (link público y
--    correo entrante), donde no hay nada que las amortigüe.

-- api/cliente-agenda.js: por cada visitante que elige una fecha, busca
-- las citas de ese adiestrador desde esa fecha. Es la consulta más
-- caliente de la agenda pública.
create index if not exists citas_agenda_adiestrador_fecha_idx on citas_agenda (adiestrador, fecha_hora);

-- api/correo-entrante.js: por cada correo que llega a contacto@ busca a
-- quién pertenece, primero en clientes y después en prospectos.
create index if not exists clientes_email_idx on clientes (email);
create index if not exists prospectos_email_idx on prospectos (email);

-- Al desactivar las notificaciones push se borra la suscripción por su
-- endpoint, que es un texto largo y único por dispositivo.
create index if not exists push_subscriptions_endpoint_idx on push_subscriptions (endpoint);
