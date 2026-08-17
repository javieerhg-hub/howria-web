-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: en Pago trabajadores, "Marcar como pagado" no guardaba quién
-- lo confirmó (solo la fecha), y "Deshacer" borraba la fila entera del
-- historial sin dejar ningún rastro de que había pasado, ni quién ni
-- cuándo. Se agregan tres columnas: marcado_por (quién tildó el pago),
-- deshecho_por/deshecho_en (quién y cuándo lo revirtió). "Deshacer" pasa
-- de borrar la fila a marcarla como revertida — sigue apareciendo en el
-- historial, pero ya no cuenta como pago vigente.
--
-- Sin cambios de RLS — la política de insert/update de
-- pagos_trabajadores ya cubre columnas nuevas.

alter table pagos_trabajadores add column if not exists marcado_por text;
alter table pagos_trabajadores add column if not exists deshecho_por text;
alter table pagos_trabajadores add column if not exists deshecho_en timestamptz;
