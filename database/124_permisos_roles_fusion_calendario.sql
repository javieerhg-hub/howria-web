-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Fase 2 de la reorganización del menú: "Calendario" e "Itinerario" eran
-- dos pestañas para el mismo dato con distinto zoom (el mes y el día).
-- Ahora son una sola pestaña, `calendario`, con un selector Mes / Día
-- adentro. El id `itinerario` deja de existir en el código.
--
-- Deshace lo que hizo 075_permisos_roles_tab_itinerario.sql.
--
-- ORDEN: correr esto ANTES del deploy, o justo después. Da lo mismo, pero
-- por si acaso: el primer UPDATE es el que importa (garantiza que nadie
-- pierda el acceso) y es inofensivo con el código viejo — a lo más
-- alguien ve las dos pestañas un rato. El segundo solo limpia un id que
-- el código nuevo ya ignora.
--
-- Por qué el primer UPDATE existe aunque 075 le dio las dos pestañas a
-- los mismos roles: desde entonces los permisos se editan a mano desde
-- la pestaña Usuarios, así que hoy podría haber un rol con `itinerario`
-- y sin `calendario`. Si lo hubiera, borrar `itinerario` a secas lo
-- dejaría sin ninguna de las dos. Esto lo cubre pase lo que pase.

-- 1) Nadie pierde el acceso: si un rol tenía SOLO itinerario, ahora
--    también tiene calendario.
update permisos_roles
set tabs = array_append(tabs, 'calendario')
where 'itinerario' = any(tabs)
  and not ('calendario' = any(tabs));

-- 2) El id viejo se va. `array_remove` saca todas las apariciones, así
--    que también limpia un eventual duplicado.
update permisos_roles
set tabs = array_remove(tabs, 'itinerario')
where 'itinerario' = any(tabs);

-- Para revisar cómo quedó (debería salir `calendario` en los roles que
-- antes tenían itinerario, y ningún `itinerario` en ninguna fila):
-- select rol, tabs from permisos_roles order by rol;
