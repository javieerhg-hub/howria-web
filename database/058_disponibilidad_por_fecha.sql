-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- `disponibilidad_adiestrador` (028) es una plantilla semanal fija — una
-- fila por (adiestrador, día de semana) que se repite para siempre, sin
-- forma de que una fecha puntual sea distinta (vacaciones, día suelto
-- cerrado, etc.). Esta tabla nueva reemplaza esa lógica con control por
-- fecha concreta: una fila por (adiestrador, fecha).
--
-- `disponibilidad_adiestrador` no se toca ni se borra — queda sin uso, se
-- puede limpiar más adelante. El calendario nuevo arranca en blanco (no
-- se proyecta el horario semanal viejo hacia esta tabla).

create table if not exists disponibilidad_fecha (
  id uuid primary key default gen_random_uuid(),
  adiestrador text not null,
  fecha date not null,
  disponible boolean not null default false,
  hora_inicio time not null default '09:00',
  hora_fin time not null default '18:00',
  created_at timestamptz not null default now(),
  unique (adiestrador, fecha)
);
alter table disponibilidad_fecha enable row level security;

-- Mismo criterio que disponibilidad_select/insert/update/delete de
-- disponibilidad_adiestrador (028): cualquier autenticado lee solo las
-- fechas disponibles (para calcular horarios libres); el adiestrador
-- dueño y coordinador/administrador leen/editan todo lo propio.
create policy "disponibilidad_fecha_select" on disponibilidad_fecha for select using (
  auth.role() = 'authenticated'
  and (disponible = true or mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre())
);
create policy "disponibilidad_fecha_insert" on disponibilidad_fecha for insert with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "disponibilidad_fecha_update" on disponibilidad_fecha for update using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
create policy "disponibilidad_fecha_delete" on disponibilidad_fecha for delete using (
  mi_rol() in ('coordinador', 'administrador') or adiestrador = mi_nombre()
);
