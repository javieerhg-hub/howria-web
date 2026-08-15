-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: la agenda pública (howria.cl/agendaadiestrador, sin login) no
-- pedía ninguna dirección — ni a quien todavía no es cliente (queda como
-- prospecto) ni confirmaba la que ya tenía guardada un cliente existente.
-- Sin eso, un prospecto que se convierte en cliente arranca sin dirección
-- para ubicar en el Mapa. `clientes.direccion` ya existía (parte del
-- esquema base, usada para geocodificar en Mapa); acá solo falta la misma
-- columna en `prospectos`.

alter table prospectos add column if not exists direccion text;
