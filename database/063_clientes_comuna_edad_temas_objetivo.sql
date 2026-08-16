-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: ficha de ingreso de adiestramiento pedida por Javier Arniaz
-- (comuna, edad del perro, y los temas/objetivos con los que ingresa el
-- caso). "edad" queda como texto (no número) porque un cachorro se
-- suele describir en meses ("3 meses"), no en años — mismo criterio que
-- ya usa "raza" (texto libre). "temas_objetivo" usa los mismos ids que
-- TEMARIO_ADIESTRAMIENTO (HowriaAdmin.jsx) — es un campo distinto de
-- clases_realizadas.temas (062): acá son los objetivos al ingresar, allá
-- es lo que realmente se trabajó clase a clase.

alter table clientes add column if not exists comuna text;
alter table clientes add column if not exists edad text;
alter table clientes add column if not exists temas_objetivo text[] not null default '{}';
