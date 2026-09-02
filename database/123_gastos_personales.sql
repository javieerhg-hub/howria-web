-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Gastos personales de quien mira "Finanzas personales", para poder
-- descontarlos de lo que gana y ver cuanto le queda limpio en el mes.
--
-- PRIVADOS DE VERDAD, no solo escondidos: hay 3 cuentas de administrador
-- y los gastos de una persona no son de las otras. La RLS los ata al
-- correo de la sesion, en las cuatro operaciones — mismo patron que
-- mensajes_equipo_lecturas (089) y avisos_descartados (084). Esta tabla
-- NO tiene politica para administrador ni coordinador: ser jefe no da
-- derecho a ver el arriendo de otro.
--
-- usuario_email va con default desde el token, asi una fila mal armada
-- por el cliente no puede quedar sin dueno (y la policy de insert la
-- rechazaria igual).
--
-- monto en integer: son pesos chilenos, no existen los centavos.
--
-- fijo/fijo_hasta: un arriendo no se escribe de nuevo cada mes. Un gasto
-- fijo cuenta en todos los meses desde su fecha; cuando se deja de pagar
-- se le pone fijo_hasta y deja de contar despues de ese mes, sin borrar
-- el historial de los meses en que si se pago.

create table if not exists gastos_personales (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null default (auth.jwt() ->> 'email'),
  descripcion text not null,
  monto integer not null default 0,
  categoria text not null default 'otros',
  fecha date not null default current_date,
  fijo boolean not null default false,
  fijo_hasta date,
  creado_en timestamptz not null default now()
);

create index if not exists gastos_personales_dueno_idx
  on gastos_personales (usuario_email, fecha);

alter table gastos_personales enable row level security;

drop policy if exists "gastos_personales_select_propio" on gastos_personales;
create policy "gastos_personales_select_propio" on gastos_personales
  for select using (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "gastos_personales_insert_propio" on gastos_personales;
create policy "gastos_personales_insert_propio" on gastos_personales
  for insert with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "gastos_personales_update_propio" on gastos_personales;
create policy "gastos_personales_update_propio" on gastos_personales
  for update using (usuario_email = (auth.jwt() ->> 'email'))
  with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "gastos_personales_delete_propio" on gastos_personales;
create policy "gastos_personales_delete_propio" on gastos_personales
  for delete using (usuario_email = (auth.jwt() ->> 'email'));
