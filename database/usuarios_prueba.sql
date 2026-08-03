-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

-- 1) Agregar columna de contraseña a la tabla de usuarios (staff)
alter table usuarios add column if not exists password text;

-- 2) Crear 3 cuentas de prueba, una por rol
insert into usuarios (nombre, rol, password) values
  ('Camila Soto', 'coordinador', 'howria2026'),
  ('Pedro Vidal', 'entrenador', 'paseo2026'),
  ('Javier Herrera', 'administrador', 'admin2026');
