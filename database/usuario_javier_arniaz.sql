-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

-- 1) Corregir el nombre en los clientes ya asignados
update clientes set paseador_nombre = 'Javier Arniaz' where paseador_nombre = 'Javier Arunías';

-- 2) Crear su usuario con el nombre correcto
insert into usuarios (nombre, rol, password) values
('Javier Arniaz', 'entrenador', 'Javier2026');
