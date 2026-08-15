-- Corre esto en el SQL Editor de Supabase (proyecto Howria) — ya se corrió el
-- 2026-08-14, se deja acá como registro histórico.
--
-- Contexto: Coordinación/Agenda/Mail están pensadas para que varias personas
-- las usen el mismo día a la vez, pero nada se actualizaba solo — había que
-- recargar la página para ver un paseo que alguien más acaba de marcar, una
-- cita que se confirmó, o un correo nuevo (ver audit agosto 2026). Por
-- defecto, Supabase no manda cambios en tiempo real de ninguna tabla — hay
-- que agregarla a la publicación "supabase_realtime" a mano.
--
-- El código (HowriaAdmin.jsx: useSyncedTable con realtime=true para
-- citas_agenda, useRegistroPaseosSincronizado, useCorreos) se suscribe a
-- estos cambios respetando las políticas RLS que ya existían — un cliente
-- solo recibe eventos de filas que ya podía leer.

alter publication supabase_realtime add table citas_agenda, registro_paseos, correos;
