-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Marca de "hasta cuándo leyó cada quien" el chat de equipo (088) — de ahí
-- sale el número en la burbuja del chat. Una fila por persona, nunca
-- compartida ni visible para otra (mismo patrón que avisos_descartados,
-- 084_avisos_descartados.sql).

create table if not exists mensajes_equipo_lecturas (
  usuario_email text primary key,
  ultima_lectura timestamptz not null default now()
);

alter table mensajes_equipo_lecturas enable row level security;

drop policy if exists "mensajes_equipo_lecturas_select_propio" on mensajes_equipo_lecturas;
create policy "mensajes_equipo_lecturas_select_propio" on mensajes_equipo_lecturas for select using (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "mensajes_equipo_lecturas_insert_propio" on mensajes_equipo_lecturas;
create policy "mensajes_equipo_lecturas_insert_propio" on mensajes_equipo_lecturas for insert with check (usuario_email = (auth.jwt() ->> 'email'));

drop policy if exists "mensajes_equipo_lecturas_update_propio" on mensajes_equipo_lecturas;
create policy "mensajes_equipo_lecturas_update_propio" on mensajes_equipo_lecturas for update using (usuario_email = (auth.jwt() ->> 'email')) with check (usuario_email = (auth.jwt() ->> 'email'));
