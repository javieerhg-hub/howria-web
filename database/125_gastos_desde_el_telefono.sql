-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Gastos que entran solos desde el iPhone: cada pago con Apple Pay dispara
-- un atajo que se los manda a api/gastos.js. Ver el plan completo en la
-- conversación; acá solo van las columnas que eso necesita.
--
-- Las tres son "add column if not exists", así que correr esto dos veces
-- no rompe nada.

-- De dónde salió el gasto. Los que ya existen son todos escritos a mano,
-- y el default se encarga de dejarlos así sin tener que actualizarlos.
alter table gastos_personales add column if not exists origen text not null default 'manual';

-- Un gasto que entró solo NO cuenta hasta que Javier lo revisa: llega sin
-- categoría y con el nombre del comercio tal como lo manda Apple, que a
-- veces es críptico ("EL CERRO SPA"). Contarlo de inmediato ensuciaría el
-- "te queda limpio", que es el número que más se mira.
--
-- Default TRUE a propósito: los gastos que ya están escritos a mano son
-- decisiones tomadas, no tienen nada que revisar. El endpoint es el único
-- que inserta con false.
alter table gastos_personales add column if not exists confirmado boolean not null default true;

-- El texto crudo que mandó el iPhone, tal cual llegó. Sirve para dos
-- cosas: si el parseo del monto o del comercio sale mal, el dato original
-- no se perdió y se puede corregir a mano; y mirando estos textos se
-- puede mejorar el parseo después, con casos reales en vez de suposiciones.
alter table gastos_personales add column if not exists origen_texto text;

-- La bandeja se consulta por "lo que falta revisar", no por fecha.
create index if not exists gastos_personales_por_revisar_idx
  on gastos_personales (usuario_email) where not confirmado;

-- OJO: la RLS de 123 no cambia. El endpoint escribe con la service role
-- key, que la salta, y fija usuario_email a mano desde una variable de
-- entorno. Nadie más puede escribir en los gastos de otro: la policy de
-- insert sigue exigiendo que usuario_email calce con el correo del token.
