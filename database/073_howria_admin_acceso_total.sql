-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Javier pidió que la cuenta "Howria" (antes "Javier
-- Herrera", ver 070/071) sea la cuenta admin general de la empresa —
-- con acceso a toda la información, tanto de Javier Arniaz como de
-- Javier H y del resto de paseadores/coordinación, sin nada oculto.
--
-- 1) Asegura el rol de la cuenta. RLS ya le da a 'administrador'
--    acceso total en todas las tablas relevantes (ver
--    019_rls_permisos_por_rol.sql) — esto solo confirma/fuerza que
--    "Howria" tenga ese rol, sin asumir que ya lo tenía.
update usuarios set rol = 'administrador' where nombre = 'Howria';

-- 2) Asegura que el rol 'administrador' vea TODAS las pestañas de la
--    app (permisos_roles.tabs es editable a mano desde Usuarios, así
--    que puede haber quedado con algo desmarcado sin querer).
update permisos_roles set tabs = array[
  'inicio','mis-paseos','coordinacion','mapa','agenda','alumnos','mail',
  'clientes','boletas','facturas','finanzas','pagos','equipo','usuarios','seguimiento'
] where rol = 'administrador';
