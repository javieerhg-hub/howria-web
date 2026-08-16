-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Javier pidió poder declarar qué pack/cuántas clases compró un
-- alumno directamente desde la pestaña "Alumnos", sin depender de que ya
-- exista una factura (boletas_adiestramiento) — y recién después, si
-- quiere, vincular ese seguimiento a una factura ya enviada. Antes
-- (062) el "pack" era literalmente una fila de boletas_adiestramiento;
-- ahora pasa a ser su propia entidad, con un enlace opcional.

create table planes_clases (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nombre text,
  num_clases int not null default 1 check (num_clases >= 0),
  incluye_evaluacion boolean not null default false,
  boleta_adiestramiento_id uuid references boletas_adiestramiento(id) on delete set null,
  creado_por text,
  creado_en timestamptz not null default now()
);
alter table planes_clases enable row level security;

-- Crear/editar un plan (cuántas clases tiene, si incluye evaluación,
-- vincular/desvincular una factura) queda abierto al mismo equipo que ya
-- maneja adiestramiento. Borrar un plan completo (se lleva puestas todas
-- sus clases marcadas, cascade) queda solo para coordinador/
-- administrador — es una acción más grande que deshacer una clase suelta.
create policy "planes_clases_select" on planes_clases for select using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "planes_clases_insert" on planes_clases for insert with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "planes_clases_update" on planes_clases for update using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
create policy "planes_clases_delete" on planes_clases for delete using (
  mi_rol() in ('coordinador', 'administrador')
);
