-- Corre esto en el SQL Editor de Supabase (proyecto Howria), DESPUÉS de
-- 070_usuario_howria.sql
--
-- Javier ya creó la cuenta nueva "Javier H" (rol paseador) desde
-- Usuarios → Agregar usuario. Este script hace dos cosas:
--
-- 1) Arregla el login de "Howria": el nombre en `usuarios` ya se
--    renombró en 070, pero el login se hace escribiendo el nombre, que
--    la app convierte a un email interno (slugEmailUsuario) para
--    autenticar contra Supabase Auth — javier.herrera@howria.local
--    quedó sin tocar en 070 a propósito, así que escribir "Howria" en
--    el login todavía no funcionaba. Mismo patrón ya usado en
--    017_reset_password_javier_herrera.sql (tocar auth.users directo).
--
-- 2) Transfiere los clientes que hoy dicen "Javier Herrera" (en
--    paseador/responsable/adiestrador) a "Javier H", la cuenta nueva —
--    ya que paseador_nombre/responsable_nombre/adiestrador_nombre son
--    texto libre sin relación (FK) con usuarios, hay que actualizarlos
--    a mano.

-- ============================================================
-- 1) Login de Howria: javier.herrera@howria.local -> howria@howria.local
-- ============================================================
update auth.users set email = 'howria@howria.local' where email = 'javier.herrera@howria.local';
update usuarios set email = 'howria@howria.local' where nombre = 'Howria';

-- ============================================================
-- 2) Transferir clientes de "Javier Herrera" a "Javier H"
-- ============================================================

-- Preview — mirá qué clientes va a tocar el update antes de correrlo:
select nombre, perro, paseador_nombre, responsable_nombre, adiestrador_nombre
from clientes
where paseador_nombre = 'Javier Herrera' or responsable_nombre = 'Javier Herrera' or adiestrador_nombre = 'Javier Herrera';

-- El update en sí — solo toca las filas de arriba, nada más:
update clientes set paseador_nombre = 'Javier H' where paseador_nombre = 'Javier Herrera';
update clientes set responsable_nombre = 'Javier H' where responsable_nombre = 'Javier Herrera';
update clientes set adiestrador_nombre = 'Javier H' where adiestrador_nombre = 'Javier Herrera';

-- Nota: los registros históricos de paseos ya realizados
-- (registro_paseos.paseador_nombre, usados para el pago de esos días)
-- no se tocan acá — quedan con "Javier Herrera" como estaban en su
-- momento, que es lo correcto para no reescribir el historial de pagos
-- ya hechos. Los paseos nuevos que se registren de acá en adelante van
-- a quedar bajo "Javier H".
