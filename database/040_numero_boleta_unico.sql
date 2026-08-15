-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- La app arma el número de boleta ella misma (numero: correlativo, ver
-- ajuste_numero_boleta.sql) leyendo el último número al abrir la pestaña
-- y sumando 1 en el navegador — si dos personas del equipo generan una
-- boleta casi al mismo tiempo, ambas pueden calcular el mismo próximo
-- número y guardarlo dos veces, porque nada en la base lo impedía. La app
-- ya fue corregida para identificar cada boleta por su id interno al
-- editar/eliminar/marcar pagada (no por este número visible), pero sigue
-- siendo confuso tener dos boletas con el mismo N° en pantalla — esto
-- agrega la restricción que faltaba para que la base misma lo impida.

-- ============================================================
-- 0) Revisar primero si ya existen números repetidos hoy. Si cualquiera
--    de las dos consultas de abajo devuelve filas, hay que resolver esos
--    duplicados a mano (renumerando una de las boletas repetidas) ANTES
--    de correr el "alter table" de más abajo — si no, va a fallar solo.
-- ============================================================
select numero, count(*) from boletas group by numero having count(*) > 1;
select numero, count(*) from boletas_adiestramiento group by numero having count(*) > 1;

-- ============================================================
-- 1) Una vez confirmado que no hay duplicados, agregar la restricción.
-- ============================================================
alter table boletas add constraint boletas_numero_unico unique (numero);
alter table boletas_adiestramiento add constraint boletas_adiestramiento_numero_unico unique (numero);
