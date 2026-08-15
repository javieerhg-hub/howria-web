-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

alter table boletas add column if not exists paseos_mes_anterior integer not null default 0;
