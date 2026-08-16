-- Corre esto en el SQL Editor de Supabase (proyecto Howria), DESPUÉS de
-- 060_clientes_responsable.sql
--
-- Contexto: los únicos dos responsables de cuenta son Javier Herrera y
-- Javier Arniaz. Javier le indicó a Claude que ya existe una señal para
-- saber a quién le toca cada cliente: el campo "Paseador asignado" —
-- para varios clientes, ese campo ya tiene puesto directamente el
-- nombre de Herrera o de Arniaz (no el de un paseador real), porque la
-- app siempre permitió elegir cualquier usuario ahí. Este script copia
-- ese valor a responsable_nombre para esos casos puntuales.
--
-- Antes de correr el update, revisá el preview de abajo: si algún
-- nombre no calza exactamente como "Javier Herrera" / "Javier Arniaz"
-- (mayúsculas, espacios, tilde, etc.), el update no lo va a tocar —
-- ajustá el texto del "in (...)" para que calce con lo que realmente
-- hay en tu base antes de correr el update.

-- 1) Preview — mirá qué clientes va a tocar el update antes de correrlo:
select nombre, perro, paseador_nombre
from clientes
where paseador_nombre in ('Javier Herrera', 'Javier Arniaz');

-- 2) El update en sí — solo toca las filas de arriba, nada más:
update clientes
set responsable_nombre = paseador_nombre
where paseador_nombre in ('Javier Herrera', 'Javier Arniaz');

-- Los clientes que no aparecieron en el preview (su "Paseador asignado"
-- es un paseador de verdad, no Herrera ni Arniaz) quedan sin responsable
-- — hay que asignarlos a mano en la ficha de cada uno.
