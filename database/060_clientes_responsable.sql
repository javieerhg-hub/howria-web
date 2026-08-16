-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el negocio tiene más de un administrador (ej. Javier Herrera,
-- Javier Arniaz), cada uno a cargo de su propia cartera de clientes.
-- Se necesita poder ver, en Finanzas, los números de cada uno por
-- separado a medida que se van aceptando facturas. Se decidió con el
-- dueño del negocio que el responsable se fija una vez por cliente (no
-- factura por factura) — mismo patrón ya usado para paseador_nombre y
-- adiestrador_nombre: una columna de texto en clientes, sin FK, que se
-- compara por nombre. Las boletas heredan el responsable de su cliente
-- (ver esBoletaDeCliente en HowriaAdmin.jsx) — no hace falta tocar
-- boletas ni boletas_adiestramiento.

alter table clientes add column if not exists responsable_nombre text;
