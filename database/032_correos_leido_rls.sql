-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Agrega el estado leído/no leído a la pestaña Mail y habilita que el
-- staff pueda marcarlo (hoy correos solo tiene política de select).

alter table correos add column if not exists leido boolean not null default false;

drop policy if exists "correos_update_staff" on correos;
create policy "correos_update_staff" on correos for update using (
  mi_rol() in ('coordinador', 'administrador')
) with check (
  mi_rol() in ('coordinador', 'administrador')
);
