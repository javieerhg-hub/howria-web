-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la auditoría de permisos: la pestaña Agenda (src/tabs/
-- Agenda.jsx) le muestra a CUALQUIER rol, sin distinción, un filtro
-- "Filtrar por entrenador" con todos los nombres y un selector "Entrenador"
-- al crear una cita nueva que también lista a cualquiera — pero la RLS de
-- citas_agenda (028/077) dejaba al entrenador ver/crear/editar/borrar
-- únicamente SUS PROPIAS citas (adiestrador = mi_nombre()). En la
-- práctica: elegir a un colega en el filtro mostraba una lista vacía
-- (RLS ya había filtrado esas filas antes de llegar a la pantalla), y
-- asignarle una cita nueva a un colega fallaba el guardado en silencio.
--
-- Javier confirmó que quiere que el entrenador tenga acá el mismo nivel
-- de control que un coordinador (ver/agendar/editar/borrar la cita de
-- CUALQUIER entrenador, no solo la propia) — mismo criterio ya aplicado
-- en Coordinación (094) y en clientes (064).

drop policy if exists "citas_agenda_select" on citas_agenda;
create policy "citas_agenda_select" on citas_agenda for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or cliente_id = mi_cliente_id()
);

drop policy if exists "citas_agenda_insert" on citas_agenda;
create policy "citas_agenda_insert" on citas_agenda for insert with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or (origen = 'cliente' and estado = 'pendiente' and cliente_id = mi_cliente_id())
);

drop policy if exists "citas_agenda_update" on citas_agenda;
create policy "citas_agenda_update" on citas_agenda for update using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
) with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);

drop policy if exists "citas_agenda_delete" on citas_agenda;
create policy "citas_agenda_delete" on citas_agenda for delete using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);
