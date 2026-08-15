-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: consola de estados en vivo (audit de la especificación grande
-- de "manada" de Javier, fase 2 — ver database/047_mascotas.sql para la
-- fase 1). El paseador tiene una sola fase para toda su ronda del día
-- (Pendiente, En Recolección, En Parque, En Retorno, Completado) que va
-- tocando a medida que avanza; el coordinador la ve en vivo en
-- Coordinación. Es una capa nueva y aditiva — el marcado de cada perro
-- como hecho/cancelado en "registro_paseos" sigue funcionando exactamente
-- igual, no se toca nada de esa tabla.

create table if not exists fase_dia_paseador (
  id uuid primary key default gen_random_uuid(),
  paseador_nombre text not null,
  fecha date not null,
  fase text not null default 'pendiente'
    check (fase in ('pendiente','en_recoleccion','en_parque','en_retorno','completado')),
  actualizado_en timestamptz not null default now(),
  constraint fase_dia_paseador_unica unique (paseador_nombre, fecha)
);

alter table fase_dia_paseador enable row level security;

-- Nota: coordinador/administrador pueden leer y escribir la fase de
-- cualquier paseador (pensando en un botón de corrección futuro), aunque
-- por ahora el panel solo construye un badge de lectura en Coordinación
-- — no hay ninguna pantalla todavía que use ese permiso de escritura.
create policy "fase_dia_paseador_select" on fase_dia_paseador for select using (
  mi_rol() in ('coordinador','administrador') or paseador_nombre = mi_nombre()
);
create policy "fase_dia_paseador_insert" on fase_dia_paseador for insert with check (
  mi_rol() in ('coordinador','administrador') or paseador_nombre = mi_nombre()
);
create policy "fase_dia_paseador_update" on fase_dia_paseador for update using (
  mi_rol() in ('coordinador','administrador') or paseador_nombre = mi_nombre()
) with check (
  mi_rol() in ('coordinador','administrador') or paseador_nombre = mi_nombre()
);
create policy "fase_dia_paseador_delete" on fase_dia_paseador for delete using (
  mi_rol() in ('coordinador','administrador')
);

alter publication supabase_realtime add table fase_dia_paseador;
