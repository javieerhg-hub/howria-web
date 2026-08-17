-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: al eliminar a alguien en Usuarios, su nombre/correo quedan
-- guardados en logins_pendientes_borrar para poder restaurar el perfil
-- si fue un error — pero no se guardaba su ROL, así que "Restaurar"
-- siempre recreaba a la persona como "paseador", sin importar que
-- antes fuera coordinador/entrenador/administrador. Si no se corregía
-- a mano, esa persona perdía acceso a sus pestañas en silencio.
--
-- Sin cambios de RLS — la política ya existente de esta tabla cubre
-- columnas nuevas.

alter table logins_pendientes_borrar add column if not exists rol text;
