-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: clientes hoy solo permite insert/update a coordinador y
-- administrador (019) — el entrenador solo puede leer. Para la nueva
-- ficha de ingreso de adiestramiento (pestaña "Alumnos"), el entrenador
-- necesita poder crear un cliente nuevo y editar el suyo. Se amplía sin
-- acotar por fila (igual que ya está boletas_adiestramiento, 038) —
-- mismo nivel de confianza ya aceptado para ese caso, equipo chico.

drop policy if exists "clientes_insert_coord_admin" on clientes;
create policy "clientes_insert_coord_admin" on clientes for insert with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);

drop policy if exists "clientes_update_coord_admin" on clientes;
create policy "clientes_update_coord_admin" on clientes for update using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
