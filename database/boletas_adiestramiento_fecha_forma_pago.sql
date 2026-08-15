-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: las boletas de paseo (tabla "boletas") ya tenían fecha_pago
-- y forma_pago, y al marcarlas "pagada" pasan por una pantalla que pide
-- esos dos datos. Las boletas de adiestramiento nunca tuvieron esas
-- columnas, así que marcar una como "pagada" en Facturas no dejaba
-- registro de cómo ni cuándo se pagó — ver auditoría de agosto 2026.

alter table boletas_adiestramiento add column if not exists fecha_pago date;
alter table boletas_adiestramiento add column if not exists forma_pago text;
