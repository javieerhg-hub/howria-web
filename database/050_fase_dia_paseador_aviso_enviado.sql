-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el aviso automático a tutores cuando el paseador entra a "En
-- Recolección" (ver database/049_fase_dia_paseador.sql y
-- api/avisar-inicio-ronda.js) se disparaba en CADA transición a esa fase,
-- sin memoria de si ya se había avisado hoy. Un paseador que corrige un
-- toque equivocado (Pendiente → En Recolección → Pendiente → En
-- Recolección) terminaba mandándoles a sus clientes el mismo push
-- duplicado. Esta columna guarda si ya se avisó por la ronda de hoy, para
-- que el frontend dispare el aviso una sola vez por paseador/día. No hace
-- falta resetearla a mano: cada día nuevo crea una fila nueva (la tabla es
-- única por paseador_nombre+fecha), así que arranca en false sola.

alter table fase_dia_paseador add column if not exists aviso_enviado boolean not null default false;
