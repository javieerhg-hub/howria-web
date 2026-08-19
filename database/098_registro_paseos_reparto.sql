-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Pedido de Javier: cuando un paseo lo hicieron entre dos paseadores (ej.
-- uno empezó la ronda y otro la terminó), poder repartir el pago de ese
-- paseo puntual entre los dos, con un porcentaje ajustable (no siempre
-- 50/50) — sin tocar el paseador asignado del cliente para el resto del
-- mes, ni su horario habitual.
--
-- paseador_compartido: el segundo paseador (nombre). null = sin compartir.
-- porcentaje_compartido: el % del pago de ESE día que se lleva
-- paseador_compartido — el resto (100 - esto) se lo queda el paseador
-- principal del cliente. Ambas columnas van juntas: solo tienen valor
-- cuando el paseo está marcado "realizado" y se activó el reparto desde
-- Coordinación.
alter table registro_paseos add column if not exists paseador_compartido text;
alter table registro_paseos add column if not exists porcentaje_compartido integer;
