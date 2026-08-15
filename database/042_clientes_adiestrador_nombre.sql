-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el paseador ya tiene su vista personal de Finanzas filtrada
-- por clientes.paseador_nombre. El entrenador no tenía un campo
-- equivalente para poder hacer lo mismo con sus clases de
-- adiestramiento — se decidió con el dueño del negocio agregar un
-- campo fijo en la ficha del cliente (mismo patrón que paseador_nombre),
-- en vez de aproximarlo con el historial de citas.adiestrador (menos
-- confiable) o agregarlo boleta por boleta (más trabajo manual).

alter table clientes add column if not exists adiestrador_nombre text;
