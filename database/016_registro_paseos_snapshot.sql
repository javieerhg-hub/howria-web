-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

alter table registro_paseos add column if not exists paseador_nombre text;
