-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el adiestrador no tenía forma de ver qué datos dejó el
-- cliente al pedir la cita desde la agenda pública — ni el email/teléfono
-- de un prospecto nuevo (la tabla prospectos es de coordinador/admin
-- únicamente, "Agenda/Seguimiento nunca estuvieron en las pestañas del
-- rol entrenador", ver 012_equipo_agenda_prospectos.sql) ni, en la
-- práctica, un lugar cómodo para verlo sin ir a buscar la ficha del
-- cliente. Se guarda una copia de esos 3 datos directo en la fila de la
-- cita — mismo criterio que ya se usa con cliente_nombre/perro (también
-- van redundantes en citas_agenda para no depender de un join) — así el
-- adiestrador los ve en Agenda sin necesitar acceso a prospectos.
--
-- Sin cambio de RLS: la política citas_agenda_select ya deja ver sus
-- propias citas a "adiestrador = mi_nombre()" (ver
-- 028_agenda_disponibilidad_citas_cliente.sql), una columna más queda
-- cubierta sola.

alter table citas_agenda add column if not exists email text;
alter table citas_agenda add column if not exists telefono text;
alter table citas_agenda add column if not exists direccion text;
