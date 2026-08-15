-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

create table if not exists permisos_roles (
  rol text primary key,
  tabs text[] not null default '{}'
);

insert into permisos_roles (rol, tabs) values
  ('entrenador', ARRAY['mis-paseos']),
  ('coordinador', ARRAY['inicio','mis-paseos','boletas','facturas','clientes','finanzas','pagos','coordinacion','mapa','equipo','agenda','seguimiento']),
  ('administrador', ARRAY['inicio','mis-paseos','boletas','facturas','clientes','finanzas','pagos','coordinacion','mapa','ingreso-personal','equipo','agenda','seguimiento','usuarios'])
on conflict (rol) do nothing;

-- "asignaciones" salió de las filas de arriba el 14-08-2026: nunca fue una
-- pestaña propia (quedó absorbida por Coordinación) y solo sobrevivía como
-- entrada fantasma en la tabla — ver auditoría de esa fecha.

alter table permisos_roles enable row level security;
create policy "solo_autenticados" on permisos_roles for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
