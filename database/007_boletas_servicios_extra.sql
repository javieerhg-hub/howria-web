-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

alter table boletas add column if not exists servicios_extra jsonb;
