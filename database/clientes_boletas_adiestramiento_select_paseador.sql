-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- La pestaña Finanzas es personal para el rol paseador desde hace unas
-- sesiones (ver Finanzas() en HowriaAdmin.jsx): un paseador solo debería
-- ver sus propios clientes e ingresos, sin cifras de toda la empresa.
-- Esa vista SOLO filtraba en la interfaz — clientes y boletas_adiestramiento
-- se leían enteras igual para cualquier rol autenticado (política
-- "mi_rol() is not null", que un paseador también cumple), así que los
-- datos de todos los clientes de la empresa igual llegaban al navegador
-- del paseador (visibles por ejemplo con las herramientas de desarrollador
-- del navegador), aunque la pantalla no los mostrara.
--
-- Esto acota la lectura de un paseador a sus propios clientes asignados,
-- con el mismo patrón ya usado para la tabla "boletas" en
-- boletas_select_paseador.sql. Coordinador/administrador/entrenador no
-- cambian — siguen viendo todo, igual que hoy.

drop policy if exists "clientes_select" on clientes;
create policy "clientes_select" on clientes for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or (mi_rol() = 'paseador' and paseador_nombre = mi_nombre())
  or id = mi_cliente_id()
);

drop policy if exists "boletas_adiestramiento_select" on boletas_adiestramiento;
create policy "boletas_adiestramiento_select" on boletas_adiestramiento for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or (mi_rol() = 'paseador' and cliente_id in (select id from clientes where paseador_nombre = mi_nombre()))
  or cliente_id = mi_cliente_id()
);
