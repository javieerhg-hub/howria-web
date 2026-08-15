-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Habilita el link público genérico (/agendaadiestrador sin ?c=): cuando
-- alguien que todavía no es cliente reserva ahí, sus datos crean un
-- prospecto (pestaña Seguimiento) y la cita queda enlazada a ese
-- prospecto en vez de a un cliente existente.

alter table prospectos add column if not exists email text;
alter table citas_agenda add column if not exists prospecto_id uuid references prospectos(id) on delete set null;
