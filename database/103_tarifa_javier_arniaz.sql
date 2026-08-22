-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la revisión en vivo de la app: Javier Arniaz tenía 25
-- paseos realizados en el período pero $0 de pago calculado, porque
-- nunca se le cargó "tarifa a pagar al paseador" en sus clientes.
-- Javier (el dueño) confirmó: a Javi se le paga el 100% de lo que se
-- le cobra al cliente por ese paseo.

-- 1) Revisar antes de aplicar: qué clientes de Javier Arniaz van a cambiar.
select nombre, valor_paseo_ref, tarifa_paseador
from clientes
where paseador_nombre = 'Javier Arniaz'
order by nombre;

-- 2) Aplicar: tarifa_paseador = valor_paseo_ref (100%) para sus clientes.
update clientes
set tarifa_paseador = valor_paseo_ref
where paseador_nombre = 'Javier Arniaz';
