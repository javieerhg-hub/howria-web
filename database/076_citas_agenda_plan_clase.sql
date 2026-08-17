-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Javier pidió que, para un alumno de adiestramiento, se pueda
-- fijar la fecha/hora de cada clase del pack que compró (no todas caen
-- el mismo día de la semana como un paseo) y que eso se vea en el
-- Calendario, en la sección de clases. El mecanismo de agendar ya existe
-- (citas_agenda, tipo "clase", el mismo que usa el botón "+ Agregar al
-- calendario del adiestrador" de la ficha del cliente) — lo único que
-- faltaba era poder decir A CUÁL clase del plan corresponde una cita,
-- para poder agendarlas una por una desde el checklist de Alumnos.
--
-- Ambas columnas nullable: una cita de evaluación suelta o agendada a
-- mano desde la ficha del cliente (sin pasar por un plan) sigue
-- funcionando igual, sin plan_id ni numero_clase.

alter table citas_agenda add column if not exists plan_id uuid references planes_clases(id) on delete set null;
alter table citas_agenda add column if not exists numero_clase int;
