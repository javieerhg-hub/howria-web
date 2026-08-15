-- Corre esto en el SQL Editor de Supabase (proyecto Howria).
-- Guarda las suscripciones a notificaciones push del navegador (Web Push)
-- del staff que las activa desde el panel. Cada fila es un par
-- navegador+dispositivo; una persona puede tener varias (celular, notebook).
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_usuario_email_idx on push_subscriptions (usuario_email);

alter table push_subscriptions enable row level security;

-- Cada usuario solo puede ver/crear/borrar sus propias suscripciones. El
-- envío real de notificaciones ocurre en las funciones serverless con la
-- service role key (bypassa RLS), así que estas políticas solo gobiernan
-- lo que hace el navegador del propio usuario al activar/desactivar.
drop policy if exists "push_subscriptions_select_propio" on push_subscriptions;
create policy "push_subscriptions_select_propio" on push_subscriptions
  for select using (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "push_subscriptions_insert_propio" on push_subscriptions;
create policy "push_subscriptions_insert_propio" on push_subscriptions
  for insert with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "push_subscriptions_update_propio" on push_subscriptions;
create policy "push_subscriptions_update_propio" on push_subscriptions
  for update using (usuario_email = (auth.jwt() ->> 'email')) with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "push_subscriptions_delete_propio" on push_subscriptions;
create policy "push_subscriptions_delete_propio" on push_subscriptions
  for delete using (usuario_email = (auth.jwt() ->> 'email'));
