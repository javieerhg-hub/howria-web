-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Ahora los clientes también inician sesión de verdad (Supabase Auth, vía
-- link mágico al correo) — antes solo el equipo se autenticaba, así que
-- varias políticas decían "cualquier autenticado" asumiendo que era
-- siempre alguien del equipo. Este script separa "autenticado" de "es del
-- equipo" en las tablas donde eso importaba.

-- ============================================================
-- 0) Helper nuevo: id de cliente del usuario autenticado actual
--    (mismo patrón que mi_rol()/mi_nombre() de rls_permisos_por_rol.sql)
-- ============================================================
create or replace function mi_cliente_id()
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from clientes where email = (auth.jwt() ->> 'email') limit 1;
$$;

-- ============================================================
-- 1) usuarios — antes "cualquier autenticado" leía; ahora solo el equipo.
-- ============================================================
drop policy if exists "usuarios_select" on usuarios;
create policy "usuarios_select_equipo" on usuarios for select using (mi_rol() is not null);

-- ============================================================
-- 2) permisos_roles — mismo criterio.
-- ============================================================
drop policy if exists "permisos_roles_select" on permisos_roles;
create policy "permisos_roles_select_equipo" on permisos_roles for select using (mi_rol() is not null);

-- ============================================================
-- 3) clientes — el equipo sigue viendo todo; un cliente ve solo su
--    propia ficha (por si en el futuro necesita leer su propio perfil).
-- ============================================================
drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select using (
  mi_rol() is not null or id = mi_cliente_id()
);

-- ============================================================
-- 4) boletas (paseos) — el equipo (coordinador/administrador) sigue
--    viendo todo; se agrega que un cliente vea sus propias boletas.
-- ============================================================
drop policy if exists "boletas_select_coord_admin" on boletas;
create policy "boletas_select" on boletas for select using (
  mi_rol() in ('coordinador', 'administrador') or cliente_id = mi_cliente_id()
);

-- ============================================================
-- 5) boletas_adiestramiento — antes "cualquier autenticado" leía (para
--    que el rol entrenador también entrara); ahora se restringe a "es
--    del equipo" o "es su propia boleta".
-- ============================================================
drop policy if exists "boletas_adiestramiento_select" on boletas_adiestramiento;
create policy "boletas_adiestramiento_select" on boletas_adiestramiento for select using (
  mi_rol() is not null or cliente_id = mi_cliente_id()
);
