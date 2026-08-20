-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la revisión de lógica financiera: "Ganancia de Howria" en
-- Finanzas es hoy solo ingresos menos pago a trabajadores — no existía
-- ningún lugar para cargar otros costos del negocio (arriendo, insumos,
-- marketing, etc.), así que la "ganancia" mostrada no era la utilidad
-- real. Javier confirmó que quiere poder cargarlos.
--
-- Cada fila es un costo puntual con fecha propia (no recurrente/
-- automático) — un arriendo mensual se carga una vez por mes, a mano,
-- mismo criterio simple que ya usan los ajustes de pago.

create table if not exists costos_negocio (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  monto integer not null,
  fecha date not null,
  creado_por text,
  creado_en timestamptz not null default now()
);

alter table costos_negocio enable row level security;

-- Mismo criterio que el resto de las pantallas de plata del negocio
-- (Pago Trabajadores, ajustes) — solo coordinador/administrador.
drop policy if exists "costos_negocio_select" on costos_negocio;
create policy "costos_negocio_select" on costos_negocio for select using (mi_rol() in ('coordinador', 'administrador'));

drop policy if exists "costos_negocio_insert" on costos_negocio;
create policy "costos_negocio_insert" on costos_negocio for insert with check (mi_rol() in ('coordinador', 'administrador'));

drop policy if exists "costos_negocio_delete" on costos_negocio;
create policy "costos_negocio_delete" on costos_negocio for delete using (mi_rol() in ('coordinador', 'administrador'));
