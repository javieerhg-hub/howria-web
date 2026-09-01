-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Tres cosas encadenadas alrededor de pagarle a un trabajador:
--   1. Guardar el comprobante de transferencia junto al pago.
--   2. Que el paseador pueda VER su propio pago (hoy no puede).
--   3. Que pueda avisar en privado si algo no le cuadra.

-- ---------------------------------------------------------------
-- 1. El comprobante
-- ---------------------------------------------------------------
-- La imagen va dentro de la columna, igual que las fotos de los perros
-- (la app no usa almacenamiento de archivos aparte). Se guarda
-- comprimida a 1200px: a los 480px que se usan para fotos, los montos
-- de una transferencia salen borrosos y el comprobante no sirve.
alter table pagos_trabajadores add column if not exists comprobante text;

-- Foto del detalle con el que se calculó ESE pago: qué perro, cuántos
-- paseos, a qué tarifa. Se guarda en vez de recalcularlo después por dos
-- motivos. Uno, el paseador solo ve sus propios registros de paseo por
-- RLS, así que si regenerara el detalle podría salirle MENOS de lo que
-- se le pagó (los paseos compartidos de clientes ajenos no los ve). Dos,
-- una liquidación es un comprobante: tiene que decir lo mismo dentro de
-- seis meses, aunque los datos de origen hayan cambiado.
alter table pagos_trabajadores add column if not exists detalle jsonb;

-- ---------------------------------------------------------------
-- 2. Que el trabajador vea su propio pago
-- ---------------------------------------------------------------
-- Hasta ahora pagos_trabajadores era solo de coordinador/administrador,
-- así que el paseador no tenía forma de enterarse de lo que se le pagó.
-- Se le agrega lectura ÚNICAMENTE de sus propias filas.
--
-- Ojo: solo select. No se le da update ni insert — RLS no puede limitar
-- por columna, así que dejarlo escribir aunque fuera "para marcar como
-- visto" le habilitaría también cambiarse el monto. Por eso lo de
-- "visto" vive en su propia tabla, más abajo.
-- Se borran las DOS: la vieja por nombre, y la nueva por si esta
-- migracion ya se corrio antes (create policy no tiene "if not exists",
-- asi que sin este drop correrla dos veces falla).
drop policy if exists "pagos_trabajadores_select_coord_admin" on pagos_trabajadores;
drop policy if exists "pagos_trabajadores_select" on pagos_trabajadores;
create policy "pagos_trabajadores_select" on pagos_trabajadores for select using (
  mi_rol() in ('coordinador', 'administrador') or paseador_nombre = mi_nombre()
);

-- Qué pagos ya vio el trabajador. Tabla aparte justamente para no darle
-- permiso de escritura sobre la tabla donde vive el monto.
create table if not exists pagos_vistos (
  pago_id uuid primary key references pagos_trabajadores(id) on delete cascade,
  visto_en timestamptz not null default now()
);
alter table pagos_vistos enable row level security;

drop policy if exists "pagos_vistos_select" on pagos_vistos;
create policy "pagos_vistos_select" on pagos_vistos for select using (
  mi_rol() in ('coordinador', 'administrador')
  or exists (select 1 from pagos_trabajadores p where p.id = pago_id and p.paseador_nombre = mi_nombre())
);
-- Solo puede marcar como visto un pago que sea suyo.
drop policy if exists "pagos_vistos_insert" on pagos_vistos;
create policy "pagos_vistos_insert" on pagos_vistos for insert with check (
  exists (select 1 from pagos_trabajadores p where p.id = pago_id and p.paseador_nombre = mi_nombre())
);

-- ---------------------------------------------------------------
-- 3. El aviso privado si algo no cuadra
-- ---------------------------------------------------------------
-- Aparte del chat de equipo a propósito: hablar de plata delante de
-- todos incomoda, y esto tiene que poder decirse sin público.
create table if not exists reclamos_pago (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid references pagos_trabajadores(id) on delete set null,
  trabajador text not null,
  mensaje text not null,
  creado_en timestamptz not null default now(),
  resuelto boolean not null default false,
  resuelto_por text,
  resuelto_en timestamptz
);
alter table reclamos_pago enable row level security;

-- Lo ve quien lo escribió y quien tiene que resolverlo. Nadie más.
drop policy if exists "reclamos_pago_select" on reclamos_pago;
create policy "reclamos_pago_select" on reclamos_pago for select using (
  mi_rol() in ('coordinador', 'administrador') or trabajador = mi_nombre()
);
-- Escribirlo solo a nombre propio: sin esto, alguien podría dejar un
-- reclamo firmado por otra persona.
drop policy if exists "reclamos_pago_insert" on reclamos_pago;
create policy "reclamos_pago_insert" on reclamos_pago for insert with check (
  trabajador = mi_nombre()
);
-- Marcarlo resuelto es de quien lo atiende, no de quien lo escribió.
drop policy if exists "reclamos_pago_update" on reclamos_pago;
create policy "reclamos_pago_update" on reclamos_pago for update using (
  mi_rol() in ('coordinador', 'administrador')
) with check (
  mi_rol() in ('coordinador', 'administrador')
);

create index if not exists reclamos_pago_sin_resolver_idx on reclamos_pago (creado_en) where not resuelto;
