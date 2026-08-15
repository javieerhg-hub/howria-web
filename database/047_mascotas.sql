-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: hoy cada fila de "clientes" ES un perro — el campo "perro" es
-- texto libre, así que un tutor con 2 perros los escribe juntos en un
-- mismo string (ej. "Jako y Maya"). Para poder armar una matriz de
-- compatibilidad canina (qué perros no se llevan bien) hace falta que
-- cada perro tenga su propio perfil independiente, separado del tutor.
--
-- "clientes" sigue siendo el "contrato de servicio" (tutor + dirección +
-- paseador asignado + tarifas + días habituales) — no se toca nada de
-- eso. "mascotas" es una capa nueva, enganchada por cliente_id, solo con
-- el perfil del perro (raza, energía, temperamento). Así no hace falta
-- tocar boletas, Coordinación, Finanzas ni Pago trabajadores, que siguen
-- leyendo "clientes" exactamente igual que hoy.

create table if not exists mascotas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nombre text not null,
  raza text,
  peso_kg numeric,
  nivel_energia text,
  temperamento text[] not null default '{}',
  notas text,
  necesita_revision boolean not null default false,
  created_at timestamptz not null default now()
);

alter table mascotas enable row level security;

drop policy if exists "mascotas_select" on mascotas;
create policy "mascotas_select" on mascotas for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or (mi_rol() = 'paseador' and cliente_id in (select id from clientes where paseador_nombre = mi_nombre()))
  or cliente_id = mi_cliente_id()
);
drop policy if exists "mascotas_insert_coord_admin" on mascotas;
create policy "mascotas_insert_coord_admin" on mascotas for insert with check (mi_rol() in ('coordinador', 'administrador'));
drop policy if exists "mascotas_update_coord_admin" on mascotas;
create policy "mascotas_update_coord_admin" on mascotas for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
drop policy if exists "mascotas_delete_coord_admin" on mascotas;
create policy "mascotas_delete_coord_admin" on mascotas for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- Incompatibilidades entre mascotas: tabla de relación (no un array de
-- ids en cada mascota) para no tener que mantener los dos lados en
-- sincronía a mano. mascota_id_1 < mascota_id_2 fuerza un solo orden por
-- par — el código que inserta debe ordenar los dos ids antes de guardar.
-- ============================================================
create table if not exists mascota_incompatibilidades (
  id uuid primary key default gen_random_uuid(),
  mascota_id_1 uuid not null references mascotas(id) on delete cascade,
  mascota_id_2 uuid not null references mascotas(id) on delete cascade,
  motivo text,
  creado_por text,
  creado_en timestamptz not null default now(),
  constraint mascota_incompatibilidades_orden check (mascota_id_1 < mascota_id_2),
  constraint mascota_incompatibilidades_unica unique (mascota_id_1, mascota_id_2)
);

alter table mascota_incompatibilidades enable row level security;

drop policy if exists "mascota_incompatibilidades_select" on mascota_incompatibilidades;
create policy "mascota_incompatibilidades_select" on mascota_incompatibilidades for select using (mi_rol() is not null);
drop policy if exists "mascota_incompatibilidades_insert_coord_admin" on mascota_incompatibilidades;
create policy "mascota_incompatibilidades_insert_coord_admin" on mascota_incompatibilidades for insert with check (mi_rol() in ('coordinador', 'administrador'));
drop policy if exists "mascota_incompatibilidades_update_coord_admin" on mascota_incompatibilidades;
create policy "mascota_incompatibilidades_update_coord_admin" on mascota_incompatibilidades for update using (mi_rol() in ('coordinador', 'administrador')) with check (mi_rol() in ('coordinador', 'administrador'));
drop policy if exists "mascota_incompatibilidades_delete_coord_admin" on mascota_incompatibilidades;
create policy "mascota_incompatibilidades_delete_coord_admin" on mascota_incompatibilidades for delete using (mi_rol() in ('coordinador', 'administrador'));

-- ============================================================
-- Seed no destructivo: una mascota por cada cliente existente, para no
-- perder datos. "not exists" es una guarda de idempotencia — no hay
-- runner de migraciones (se pega a mano, ver database/README.md), así
-- que si alguien corre esto dos veces no duplica nada.
--
-- Los nombres con "y"/","/"&" (ej. "Jako y Maya") probablemente son más
-- de un perro escritos juntos — no se pueden separar solos de forma
-- confiable, así que se guardan como una sola mascota marcada
-- necesita_revision = true, para separarla a mano después desde la
-- ficha del cliente.
-- ============================================================
insert into mascotas (cliente_id, nombre, raza, peso_kg, necesita_revision)
select id, perro, raza, peso_kg, (perro ~* '\s+y\s+' or perro like '%,%' or perro like '%&%')
from clientes
where perro is not null and perro <> ''
  and not exists (select 1 from mascotas m where m.cliente_id = clientes.id);
