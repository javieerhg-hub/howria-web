-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Seguimiento/Prospección es exclusivo de coordinador/
-- administrador desde el principio de esta sesión ("Agenda/Seguimiento
-- nunca estuvieron en las pestañas del rol entrenador", ver
-- 012_equipo_agenda_prospectos.sql). Javier pidió una excepción acotada:
-- el entrenador tiene que poder ver (y hacerles seguimiento) a los
-- prospectos que pidieron cita CON ÉL desde la agenda pública — no a
-- todos los prospectos del negocio, solo a los suyos.
--
-- Se agregan políticas NUEVAS, sin tocar ni reemplazar las de
-- coordinador/administrador (las políticas de Postgres se combinan con
-- OR: alcanza con que una lo permita). El vínculo prospecto → entrenador
-- no es directo (prospectos no tiene columna de adiestrador) — se resuelve
-- vía citas_agenda.prospecto_id + citas_agenda.adiestrador = mi_nombre().
--
-- Puede ver y editar (cambiar estado, agregar seguimiento) igual que
-- coordinador, pero NO crear prospectos nuevos a mano ni eliminarlos —
-- eso sigue siendo trabajo de coordinador/administrador; el entrenador
-- solo da seguimiento a lo que ya le llegó por una cita.

create policy "prospectos_select_entrenador_sus_citas" on prospectos for select using (
  mi_rol() = 'entrenador' and exists (
    select 1 from citas_agenda
    where citas_agenda.prospecto_id = prospectos.id
      and citas_agenda.adiestrador = mi_nombre()
  )
);

create policy "prospectos_update_entrenador_sus_citas" on prospectos for update using (
  mi_rol() = 'entrenador' and exists (
    select 1 from citas_agenda
    where citas_agenda.prospecto_id = prospectos.id
      and citas_agenda.adiestrador = mi_nombre()
  )
) with check (
  mi_rol() = 'entrenador' and exists (
    select 1 from citas_agenda
    where citas_agenda.prospecto_id = prospectos.id
      and citas_agenda.adiestrador = mi_nombre()
  )
);

-- Nota: para que el entrenador vea la pestaña "Seguimiento" en el panel,
-- además hay que habilitársela desde Usuarios → "Permisos por rol" — esto
-- solo abre el acceso a los datos, no cambia qué pestañas ve cada rol.
