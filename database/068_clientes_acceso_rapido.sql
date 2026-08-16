-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el entrenador pidió poder marcar un alumno como "acceso
-- directo" para que aparezca como atajo en su propia pantalla de
-- Inicio, sin tener que ir a buscarlo en la lista de Alumnos cada vez.
-- Sin cambios de RLS — el entrenador ya puede hacer update de clientes
-- desde la migración 064.

alter table clientes add column if not exists acceso_rapido boolean not null default false;
