-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Catálogo de packs de clases: lo que se puede vender, definido una vez
-- y reusado en cada cliente. Hasta ahora cada plan de clases se armaba a
-- mano cliente por cliente (planes_clases, database/066), sin una lista
-- de "estos son los packs que vendemos".
--
-- Se usa desde la ficha del cliente: cuando alguien vino por evaluación,
-- le fue bien y compra clases, se elige acá el pack y el cliente pasa de
-- evaluación a clases con su plan ya creado.
--
-- No lleva precio a propósito. El precio se escribe al emitir la boleta
-- (modo "Pack con precio propio", database/105), porque en la práctica
-- no siempre es el mismo: hay descuentos, convenios y precios armados
-- para un caso puntual. Guardar un precio acá obligaría a corregirlo
-- después cada vez que no calce.

create table if not exists packs_clases (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  num_clases int not null default 1 check (num_clases >= 0),
  incluye_evaluacion boolean not null default false,
  -- Desactivar en vez de borrar: un pack que ya se le vendió a alguien
  -- sigue nombrado en su plan, y borrarlo dejaría ese historial sin
  -- referencia. Desactivado = no aparece para elegir, pero no se pierde.
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table packs_clases enable row level security;

-- Verlo: todo el equipo que trabaja adiestramiento. Editar el catálogo
-- es configuración, así que queda en coordinador/administrador.
drop policy if exists "packs_clases_select" on packs_clases;
create policy "packs_clases_select" on packs_clases for select using (
  mi_rol() in ('entrenador', 'coordinador', 'administrador')
);
drop policy if exists "packs_clases_insert" on packs_clases;
create policy "packs_clases_insert" on packs_clases for insert with check (
  mi_rol() in ('coordinador', 'administrador')
);
drop policy if exists "packs_clases_update" on packs_clases;
create policy "packs_clases_update" on packs_clases for update using (
  mi_rol() in ('coordinador', 'administrador')
) with check (
  mi_rol() in ('coordinador', 'administrador')
);
drop policy if exists "packs_clases_delete" on packs_clases;
create policy "packs_clases_delete" on packs_clases for delete using (
  mi_rol() in ('coordinador', 'administrador')
);

-- El pack que Javier vende hoy. Se puede renombrar y ajustar desde la
-- app (Alumnos -> Packs de clases), incluido si incluye la evaluación.
insert into packs_clases (nombre, num_clases, incluye_evaluacion)
select '4 clases + adiestramiento', 4, false
where not exists (select 1 from packs_clases where nombre = '4 clases + adiestramiento');
