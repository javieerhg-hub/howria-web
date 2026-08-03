-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Si es la primera vez que configuras boletas_adiestramiento, corre primero
-- el script "boletas_adiestramiento.sql" que te pasé antes, y este después.

alter table boletas_adiestramiento add column if not exists descuento_pack_monto numeric not null default 0;
