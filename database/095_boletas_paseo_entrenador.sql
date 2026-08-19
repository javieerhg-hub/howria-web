-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- La pestaña "Boletas" (src/tabs/Boletas.jsx) ya deja al entrenador
-- cambiarse a la vista "Paseos" con este comentario textual en el código:
-- "ahora puede pasar a boletas de paseo igual que coordinador/
-- administrador" — pero las políticas RLS de la tabla `boletas` nunca se
-- ampliaron para el rol entrenador (se quedaron en coordinador/
-- administrador desde 019_rls_permisos_por_rol.sql, y el select desde
-- 037_boletas_select_paseador.sql solo sumó al paseador, no al
-- entrenador). Sin este script, un entrenador que entra a "Paseos" ve la
-- lista vacía (RLS le filtra todo en silencio) y si intenta registrar una
-- boleta nueva, el guardado falla también en silencio.
--
-- Mismo criterio ya aplicado a boletas_adiestramiento en
-- 038_boletas_adiestramiento_insert_update_staff.sql: se amplía
-- select/insert/update a entrenador. Eliminar se deja como está
-- (coordinador/administrador únicamente) porque el entrenador no tiene
-- acceso a la pestaña "Facturas" (donde vive el botón de eliminar boleta)
-- — no hay ningún camino en la UI para que lo necesite.

drop policy if exists "boletas_select_coord_admin" on boletas;
drop policy if exists "boletas_select" on boletas;
create policy "boletas_select" on boletas for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or cliente_id = mi_cliente_id()
  or cliente_id in (select id from clientes where paseador_nombre = mi_nombre())
);

drop policy if exists "boletas_insert_coord_admin" on boletas;
create policy "boletas_insert" on boletas for insert with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);

drop policy if exists "boletas_update_coord_admin" on boletas;
create policy "boletas_update" on boletas for update using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
) with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);
