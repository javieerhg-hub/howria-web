-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Prospectos ya tiene una "bitácora" (notas libres, ver
-- 012_equipo_agenda_prospectos.sql) para no perder el hilo de una
-- conversación de venta. Clientes no tenía nada parecido — se agrega el
-- mismo patrón, para poder dejar una nota libre en la ficha de un
-- cliente ya activo (una llamada, un acuerdo verbal, etc.), como parte
-- de un historial unificado por contacto.
--
-- Sin cambios de RLS — la política de update de clientes ya cubre
-- columnas nuevas.

alter table clientes add column if not exists bitacora jsonb not null default '[]';
