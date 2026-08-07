-- Corre esto en el SQL Editor de Supabase (proyecto Howria).
-- La pestaña "Finanzas" ahora también es visible para el rol paseador,
-- pero acotada solo a sus propios clientes (ver Finanzas() en
-- HowriaAdmin.jsx). Esa vista no sirve de nada si la base de datos le
-- niega la lectura de boletas — la política "boletas_select" (definida
-- en rls_login_clientes.sql) solo dejaba pasar a coordinador/administrador
-- o al cliente dueño de la boleta. Se agrega la tercera condición: un
-- paseador puede leer boletas de clientes que tiene asignados.
drop policy if exists "boletas_select" on boletas;
create policy "boletas_select" on boletas for select using (
  mi_rol() in ('coordinador', 'administrador')
  or cliente_id = mi_cliente_id()
  or cliente_id in (select id from clientes where paseador_nombre = mi_nombre())
);
