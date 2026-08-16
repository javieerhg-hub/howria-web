-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Javier Arniaz (entrenador) pidió poder marcar clase a clase
-- si se realizó o no, dentro del pack de clases que el cliente compró
-- (boletas_adiestramiento.num_clases), y anotar qué se trabajó ese día.
-- Hoy num_clases es solo un multiplicador de precio, no hay ningún
-- registro por clase.
--
-- Mismo patrón que disponibilidad_fecha (059): una fila EXISTE cuando
-- esa clase puntual (numero_clase, dentro de un pack) se realizó — no
-- hay columna "realizada" booleana. Marcar = insert (o upsert, si se
-- corrige el tema de una clase ya marcada); deshacer = delete.

create table clases_realizadas (
  id uuid primary key default gen_random_uuid(),
  boleta_adiestramiento_id uuid not null references boletas_adiestramiento(id) on delete cascade,
  numero_clase int not null check (numero_clase >= 1),
  fecha_realizada date not null,
  temas text[] not null default '{}',
  notas text,
  creado_por text,
  creado_en timestamptz not null default now(),
  unique (boleta_adiestramiento_id, numero_clase)
);
alter table clases_realizadas enable row level security;

-- Mismo criterio de acceso que ya tiene boletas_adiestramiento (038): el
-- equipo de adiestramiento (entrenador/coordinador/administrador) puede
-- leer, marcar y deshacer clases de cualquier pack, sin acotar por fila
-- a "solo mis propios clientes" — mismo nivel de confianza que ya se le
-- da al resto de esa tabla.
create policy "clases_realizadas_select" on clases_realizadas for select using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_insert" on clases_realizadas for insert with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_update" on clases_realizadas for update using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "clases_realizadas_delete" on clases_realizadas for delete using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
