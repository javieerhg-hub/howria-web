-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: en Pago trabajadores, el bono/descuento que se escribe antes
-- de marcar el pago se guardaba solo en localStorage del navegador de
-- quien lo tipeaba — si otra persona (o el mismo Javier en otro
-- dispositivo) abría la pestaña después, ese ajuste pendiente era
-- invisible, con riesgo real de pagar el monto equivocado. Se mueve a
-- una tabla, un borrador por paseador+período, visible para todo el
-- equipo con acceso a la pestaña hasta que el pago se confirma (momento
-- en que la fila se borra — ya quedó registrado en pagos_trabajadores).

create table if not exists ajustes_pago_pendientes (
  id uuid primary key default gen_random_uuid(),
  paseador_nombre text not null,
  periodo text not null,
  etiqueta text not null,
  monto integer not null default 0,
  actualizado_por text,
  actualizado_en timestamptz not null default now(),
  unique (paseador_nombre, periodo, etiqueta)
);

alter table ajustes_pago_pendientes enable row level security;

-- Mismo criterio que pagos_trabajadores — solo coordinador/administrador
-- ven y tocan esta pestaña.
drop policy if exists "ajustes_pago_pendientes_select_coord_admin" on ajustes_pago_pendientes;
create policy "ajustes_pago_pendientes_select_coord_admin" on ajustes_pago_pendientes for select using (mi_rol() in ('coordinador', 'administrador'));

drop policy if exists "ajustes_pago_pendientes_insert_coord_admin" on ajustes_pago_pendientes;
create policy "ajustes_pago_pendientes_insert_coord_admin" on ajustes_pago_pendientes for insert with check (mi_rol() in ('coordinador', 'administrador'));

drop policy if exists "ajustes_pago_pendientes_update_coord_admin" on ajustes_pago_pendientes;
create policy "ajustes_pago_pendientes_update_coord_admin" on ajustes_pago_pendientes for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));

drop policy if exists "ajustes_pago_pendientes_delete_coord_admin" on ajustes_pago_pendientes;
create policy "ajustes_pago_pendientes_delete_coord_admin" on ajustes_pago_pendientes for delete using (mi_rol() in ('coordinador', 'administrador'));
