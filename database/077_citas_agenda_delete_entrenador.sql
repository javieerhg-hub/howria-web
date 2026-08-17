-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: el agendamiento de clases por plan (076) hace que, al marcar
-- una clase como hecha o al usar "quitar" en el checklist de Alumnos, la
-- app intente borrar la cita agendada correspondiente (citas_agenda) para
-- que no quede un pendiente fantasma en el Calendario. La política de
-- borrado ("citas_agenda_delete_coord_admin") nunca se actualizó cuando
-- 028_agenda_disponibilidad_citas_cliente.sql amplió insert/update a
-- "adiestrador = mi_nombre()" — seguía solo coordinador/administrador.
-- Un entrenador podía crear y editar sus propias citas, pero no borrarlas:
-- el intento fallaba en silencio contra RLS, así que la cita reaparecía
-- al recargar aunque la UI la hubiera dado por borrada localmente.
--
-- Mismo criterio ya usado en insert/update de esta misma tabla: un
-- entrenador puede borrar únicamente sus propias citas (adiestrador =
-- mi_nombre()), nunca las de otro adiestrador.

drop policy if exists "citas_agenda_delete_coord_admin" on citas_agenda;
create policy "citas_agenda_delete" on citas_agenda for delete using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
