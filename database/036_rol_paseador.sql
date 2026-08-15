-- Corre esto en el SQL Editor de Supabase (proyecto Howria).
-- Nuevo rol "paseador", separado de "entrenador" — antes un solo rol
-- "entrenador" cubría tanto paseos como clases de adiestramiento. El
-- paseador es el rol por defecto para cuentas nuevas (alta manual,
-- "Ingreso de personal nuevo", y aprobar un "Registro de cuenta") y solo
-- ve Inicio y Mis paseos.
insert into permisos_roles (rol, tabs) values
  ('paseador', ARRAY['inicio', 'mis-paseos'])
on conflict (rol) do nothing;

-- Sin avisos por defecto: con acceso solo a Inicio/Mis paseos, un
-- paseador no puede ver Agenda ni Mail, así que notificarle de citas o
-- correos nuevos no le sirve de nada.
insert into notificaciones_roles (rol, eventos) values
  ('paseador', ARRAY[]::text[])
on conflict (rol) do nothing;
