-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- "Boletas" y "Boletas Adiestramiento" se unificaron en una sola pestaña
-- ("Boletas", con un selector de tipo Paseo/Adiestramiento arriba) — ver
-- HowriaAdmin.jsx (TODOS_LOS_TABS) y HowriaAdminResto.jsx (componente
-- Boletas). Este script es solo limpieza de datos en permisos_roles.tabs
-- para que quede coherente con el nuevo TODOS_LOS_TABS (una sola entrada
-- "boletas"), sin tocar esquema ni RLS.
--
-- El entrenador tenía 'boletas-adiestramiento' pero nunca 'boletas' — esa
-- asimetría (entrenador solo ve el tipo "adiestramiento" en el selector)
-- ahora vive como una regla fija en el código (mismo criterio que ya usa
-- Prospectos con rolActual), no como un permiso aparte configurable desde
-- Usuarios. Por eso acá simplemente se le da 'boletas' para que conserve
-- acceso a la pestaña unificada.

-- Entrenador (o cualquier rol con 'boletas-adiestramiento' pero sin 'boletas'):
-- pasa a tener 'boletas'.
update permisos_roles
set tabs = array_append(array_remove(tabs, 'boletas-adiestramiento'), 'boletas')
where 'boletas-adiestramiento' = any(tabs) and not ('boletas' = any(tabs));

-- Coordinador/administrador (ya tenían 'boletas'): se limpia el string
-- redundante 'boletas-adiestramiento'.
update permisos_roles
set tabs = array_remove(tabs, 'boletas-adiestramiento')
where 'boletas-adiestramiento' = any(tabs) and 'boletas' = any(tabs);
