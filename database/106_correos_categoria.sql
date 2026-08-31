-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Etiqueta de tema para los correos de contacto@howria.cl. Hasta ahora
-- lo único que se podía hacer con un correo era marcarlo leído o
-- archivarlo (y archivar era del hilo completo de una persona, todo o
-- nada). Con esto cada correo puede llevar una categoría y la bandeja
-- se puede filtrar por ella.
--
-- Queda en null para los correos que ya existen y para los que entran
-- nuevos: null significa "sin clasificar", que es un estado válido y de
-- hecho el punto de partida de cualquier correo que llega.
--
-- Sin cambios de RLS: la política de update de correos
-- (032_correos_leido_rls.sql) ya deja a coordinador/administrador
-- escribir sobre estas filas, igual que con "leido" y "archivado".

alter table correos add column if not exists categoria text;

-- Se agrega la restricción aparte y con "not valid" para que no falle si
-- alguna fila quedara con un valor raro: valida de aquí en adelante sin
-- revisar todo lo viejo. Las filas existentes tienen null, que la
-- restricción permite igual.
alter table correos drop constraint if exists correos_categoria_check;
alter table correos add constraint correos_categoria_check
  check (categoria is null or categoria in ('consulta', 'cliente', 'agenda', 'pago', 'proveedor', 'spam'))
  not valid;
