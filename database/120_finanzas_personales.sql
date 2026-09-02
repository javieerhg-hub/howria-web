-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Pestaña nueva "Finanzas personales", solo para administrador.
--
-- 1) paseador_vinculado: dice que una cuenta (Howria administrador) y una
--    cuenta de terreno (el paseador Javier H) son LA MISMA PERSONA. Los
--    clientes de ese paseador son de Howria administración; la cuenta de
--    paseador existe solo para llevar el orden operativo. Sin esta
--    columna habría que escribir un nombre a mano en el código, que es
--    justo lo que no se quiere.
--
--    Nace vacía a propósito: nadie más tiene esta doble cuenta, y una
--    fila sin vincular simplemente no ve la sección de paseos.
--
-- 2) El permiso de la pestaña, mismo patrón que
--    104_permisos_roles_tab_paseadores.sql. Solo administrador: muestra
--    la ganancia del dueño, no es información de equipo.

alter table usuarios add column if not exists paseador_vinculado text;

update permisos_roles set tabs = array_append(tabs, 'finanzas-personales')
where rol = 'administrador'
  and not ('finanzas-personales' = any(tabs));
