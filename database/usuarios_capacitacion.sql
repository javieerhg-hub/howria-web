-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

alter table usuarios add column if not exists capacitacion_completada text[] not null default '{}';
