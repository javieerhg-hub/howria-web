-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Clientes que no tienen días fijos, sino fechas que el tutor avisa mes
-- a mes (caso de Chascona).
--
-- Hasta ahora la ficha solo sabía guardar dias_habituales: días de la
-- SEMANA que se repiten todas las semanas. Un cliente así no se puede
-- describir con eso, y quedaba sin ningún día — o sea, invisible en
-- Coordinación, imposible de marcar y, por lo tanto, imposible de pagar
-- al paseador. Le pasó a Marisol: boleta emitida por 13 paseos que el
-- sistema no podía registrar.
--
-- Es una columna aparte y no un reemplazo: la mayoría de los clientes sí
-- tienen días fijos y esa forma es más cómoda para ellos. Un cliente
-- puede tener las dos (días fijos + alguna fecha extra suelta).
alter table clientes add column if not exists dias_puntuales date[] not null default '{}';

-- Sin cambios de RLS: es una columna más de una tabla que ya tiene sus
-- políticas.
