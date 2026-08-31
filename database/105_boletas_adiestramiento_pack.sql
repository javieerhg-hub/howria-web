-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Packs armados a mano en la boleta de adiestramiento. Hasta ahora el
-- total siempre salía calculado (num_clases x precio_clase - descuentos
-- + evaluación + transporte), así que para vender un pack con un precio
-- redondo había que despejar el precio por clase hacia atrás hasta que
-- el total diera lo que uno quería cobrar.
--
-- Con estas columnas se puede inventar el pack en el momento: nombre
-- propio, lo que trae escrito con las palabras de uno, y el precio
-- puesto a mano. Cuando pack_precio_manual es true, "total" es el
-- precio que se escribió tal cual — precio_clase y los descuentos
-- quedan en 0 y no participan del cálculo (ver
-- calcularBoletaAdiestramiento en src/lib/calculosBoletas.js).
--
-- Las boletas que ya existen no cambian: pack_precio_manual queda en
-- false y se siguen calculando igual que siempre.

alter table boletas_adiestramiento add column if not exists pack_nombre text;
alter table boletas_adiestramiento add column if not exists pack_incluye jsonb not null default '[]'::jsonb;
alter table boletas_adiestramiento add column if not exists pack_precio_manual boolean not null default false;
