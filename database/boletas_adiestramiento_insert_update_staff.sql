-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Las políticas de insert/update de boletas_adiestramiento quedaron desde
-- el principio como "auth.role() = 'authenticated'" (ver
-- rls_permisos_por_rol.sql) — eso no es "cualquiera del equipo", es
-- literalmente cualquiera con una sesión de Supabase válida, incluyendo
-- las cuentas de clientes que ahora también inician sesión de verdad
-- (rls_login_clientes.sql). En teoría, un cliente conectado a su propio
-- portal podría crear o modificar boletas de adiestramiento de cualquier
-- otro cliente llamando directo a la API de Supabase, sin pasar por la
-- app. Esto lo acota a solo el equipo (entrenador/coordinador/
-- administrador, los mismos roles que ya tienen la pestaña habilitada) —
-- eliminar sigue como estaba, ya restringido a coordinador/administrador.

drop policy if exists "boletas_adiestramiento_insert" on boletas_adiestramiento;
create policy "boletas_adiestramiento_insert" on boletas_adiestramiento for insert with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);

drop policy if exists "boletas_adiestramiento_update" on boletas_adiestramiento;
create policy "boletas_adiestramiento_update" on boletas_adiestramiento for update using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
