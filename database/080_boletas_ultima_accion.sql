-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: en Facturas, solo "Editar" (una corrección) registraba quién
-- hizo algo sobre una boleta — aceptar, marcar pagada, cancelar, revertir
-- y reactivar no dejaban ningún rastro de quién ni cuándo. Se agrega un
-- sello genérico "última acción" que se actualiza en cada una de esas
-- acciones (no reemplaza editada_por/editada_en, que sigue siendo
-- específico de una corrección de datos).
--
-- Sin cambios de RLS — la política de update de boletas y
-- boletas_adiestramiento ya cubre columnas nuevas.

alter table boletas add column if not exists ultima_accion_por text;
alter table boletas add column if not exists ultima_accion_en timestamptz;
alter table boletas_adiestramiento add column if not exists ultima_accion_por text;
alter table boletas_adiestramiento add column if not exists ultima_accion_en timestamptz;
