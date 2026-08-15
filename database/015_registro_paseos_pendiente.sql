-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Permite guardar una nota en un día sin necesidad de marcarlo
-- como realizado o cancelado todavía (usado por el coordinador).

alter table registro_paseos drop constraint if exists registro_paseos_estado_check;
alter table registro_paseos add constraint registro_paseos_estado_check check (estado in ('realizado', 'cancelado', 'pendiente'));
