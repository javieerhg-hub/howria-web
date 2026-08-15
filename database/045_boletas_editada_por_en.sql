-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto (audit agosto 2026): se podía editar el total de una boleta
-- ya emitida sin dejar rastro de quién ni cuándo la corrigió. Se agrega
-- editada_por/editada_en a boletas y boletas_adiestramiento; el código
-- (EditorBoletaBasico, vía Facturas y FilaBoletaVenta en HowriaAdmin.jsx)
-- ahora manda estos dos campos cada vez que se guarda una corrección.

alter table boletas add column if not exists editada_por text;
alter table boletas add column if not exists editada_en timestamptz;
alter table boletas_adiestramiento add column if not exists editada_por text;
alter table boletas_adiestramiento add column if not exists editada_en timestamptz;
