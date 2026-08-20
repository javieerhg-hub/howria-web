-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la revisión de lógica financiera: "Eliminar boleta" en
-- Facturas (y en "Historial de ventas" de la ficha de un cliente) borraba
-- la fila para siempre, sin dejar ningún rastro de que existió — a
-- diferencia de "Deshacer pago" en Pago Trabajadores, que sí registra
-- quién y cuándo. Una boleta ya pagada y ya contada en la "Ganancia" de
-- un mes pasado podía desaparecer sin auditoría.
--
-- No se cambia el comportamiento de "Eliminar" (sigue borrando la fila
-- real de boletas/boletas_adiestramiento, para no tener que enseñarle a
-- cada pantalla —Finanzas, Pago Trabajadores— a ignorar boletas
-- "borradas" pero todavía presentes) — se agrega, aparte, una bitácora
-- de solo-lectura con una copia completa de cada boleta justo antes de
-- borrarla.

create table if not exists boletas_eliminadas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('paseo', 'adiestramiento')),
  datos jsonb not null,
  eliminada_por text,
  eliminada_en timestamptz not null default now()
);

alter table boletas_eliminadas enable row level security;

drop policy if exists "boletas_eliminadas_insert" on boletas_eliminadas;
create policy "boletas_eliminadas_insert" on boletas_eliminadas for insert with check (
  mi_rol() in ('coordinador', 'administrador')
);

drop policy if exists "boletas_eliminadas_select" on boletas_eliminadas;
create policy "boletas_eliminadas_select" on boletas_eliminadas for select using (
  mi_rol() in ('coordinador', 'administrador')
);
