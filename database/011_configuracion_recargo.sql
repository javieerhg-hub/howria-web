-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

create table if not exists configuracion (
  clave text primary key,
  valor numeric not null
);

insert into configuracion (clave, valor) values ('recargo_fin_semana', 30)
on conflict (clave) do nothing;

alter table configuracion enable row level security;
create policy "solo_autenticados" on configuracion for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Guardar en cada boleta el % de recargo que estaba vigente al emitirla
alter table boletas add column if not exists recargo_pct numeric not null default 30;
