-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Dos datos que faltaban para poder calcular márgenes y retención.

-- ---------------------------------------------------------------
-- 1. Categoría del costo: directo o fijo
-- ---------------------------------------------------------------
-- Sin esto, "otros costos" es una bolsa única y no se puede sacar el
-- margen bruto, que necesita separar lo que VARÍA con cuántos perros
-- atiendes (bolsas, bencina) de lo que se paga igual todos los meses
-- (software, seguro, contador).
--
-- Va como texto libre con un default y no como enum ni check: agregar
-- una categoría nueva no debería necesitar otra migración. La app manda
-- qué categorías se ofrecen y a cuál grupo pertenece cada una.
--
-- Los sueldos de paseadores y adiestradores NO van acá: ya viven en
-- pagos_trabajadores y son el costo directo más grande. Esta tabla es
-- para todo lo demás.
alter table costos_negocio add column if not exists categoria text not null default 'otros';

create index if not exists costos_negocio_fecha_idx on costos_negocio (fecha);

-- ---------------------------------------------------------------
-- 2. Cuándo se dio de baja un cliente
-- ---------------------------------------------------------------
-- clientes.estado_cliente ya distingue 'baja', pero no guarda CUÁNDO
-- pasó, y sin fecha no se puede medir cuántos se fueron en un mes.
alter table clientes add column if not exists baja_en timestamptz;

-- Se llena sola desde la base y no desde el código porque un cliente se
-- puede dar de baja desde varias pantallas (ficha, lista, triage), y un
-- trigger las cubre todas sin tener que acordarse en cada una.
create or replace function clientes_marcar_baja() returns trigger as $$
begin
  if new.estado_cliente = 'baja' and coalesce(old.estado_cliente, '') <> 'baja' then
    new.baja_en := now();
  elsif new.estado_cliente <> 'baja' then
    -- Volvió: deja de contar como baja.
    new.baja_en := null;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists clientes_baja_trg on clientes;
create trigger clientes_baja_trg
  before update of estado_cliente on clientes
  for each row execute function clientes_marcar_baja();

-- A propósito no se rellenan los que ya están en baja: no hay forma de
-- saber cuándo se fueron, y ponerles una fecha inventada haría que el
-- mes en curso apareciera con una fuga de clientes que no ocurrió. La
-- retención se empieza a medir desde hoy.

-- Sin cambios de RLS: son columnas de tablas que ya tienen sus políticas.
