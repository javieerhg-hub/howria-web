-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- "Ingreso personal nuevo" se unificó dentro de "Agregar usuario" (pestaña
-- "Usuarios") — ver HowriaAdminResto.jsx (PanelAdmin). Este script es solo
-- limpieza de datos en permisos_roles.tabs para que quede coherente con el
-- nuevo TODOS_LOS_TABS (ya no existe 'ingreso-personal' como tab id), sin
-- tocar esquema ni RLS.

-- Cualquier rol con 'ingreso-personal' pero sin 'usuarios': pasa a tener 'usuarios'.
update permisos_roles
set tabs = array_append(array_remove(tabs, 'ingreso-personal'), 'usuarios')
where 'ingreso-personal' = any(tabs) and not ('usuarios' = any(tabs));

-- Roles que ya tenían 'usuarios': se limpia el string redundante 'ingreso-personal'.
update permisos_roles
set tabs = array_remove(tabs, 'ingreso-personal')
where 'ingreso-personal' = any(tabs) and 'usuarios' = any(tabs);
