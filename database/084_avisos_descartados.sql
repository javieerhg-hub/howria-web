-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: los avisos que se descartan en el dashboard de Inicio
-- (coordinador/administrador) se guardaban solo en localStorage —
-- descartar "3 paseos sin marcar" en la PC no hacía nada en el celular
-- de la misma persona, el mismo aviso volvía a aparecer ahí sin marcar.
-- Se mueve a una tabla por usuario, para que quede sincronizado entre
-- sus propios dispositivos (no compartido entre distintas personas).

create table if not exists avisos_descartados (
  id uuid primary key default gen_random_uuid(),
  usuario_email text not null,
  clave text not null,
  creado_en timestamptz not null default now(),
  unique (usuario_email, clave)
);

alter table avisos_descartados enable row level security;

-- Cada quien ve y gestiona solo sus propios avisos descartados — nunca
-- los de otra persona del equipo.
drop policy if exists "avisos_descartados_select_propio" on avisos_descartados;
create policy "avisos_descartados_select_propio" on avisos_descartados for select using (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "avisos_descartados_insert_propio" on avisos_descartados;
create policy "avisos_descartados_insert_propio" on avisos_descartados for insert with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "avisos_descartados_delete_propio" on avisos_descartados;
create policy "avisos_descartados_delete_propio" on avisos_descartados for delete using (usuario_email = (auth.jwt() ->> 'email'));
