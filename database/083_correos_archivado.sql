-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Mail era la única pestaña de la app sin forma de "limpiar"
-- lo ya resuelto — sin archivar ni eliminar hilos. Se agrega archivar
-- (marca todos los mensajes de un hilo), que es reversible y no borra
-- nada — más seguro que un eliminar definitivo para correos, que
-- pueden tener valor legal/de respaldo.
--
-- Sin cambios de RLS — la política de update de correos ya cubre
-- columnas nuevas.

alter table correos add column if not exists archivado boolean not null default false;
