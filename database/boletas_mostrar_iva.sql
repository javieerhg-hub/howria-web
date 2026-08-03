-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

alter table boletas add column if not exists mostrar_iva boolean not null default false;
