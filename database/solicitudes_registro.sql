-- Corre esto en el SQL Editor de Supabase (proyecto Howria).
-- Solicitudes de cuenta de gente nueva que quiere unirse al equipo Howria
-- (formulario "Registro de cuenta" en la bienvenida del login). Quedan
-- pendientes hasta que un administrador las revisa y aprueba desde el
-- panel — no dan acceso a la app por sí solas.
create table if not exists solicitudes_registro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  email text not null,
  telefono text,
  mensaje text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aprobada', 'rechazada')),
  creado_en timestamptz not null default now()
);

alter table solicitudes_registro enable row level security;

-- Solo administrador ve y gestiona las solicitudes — aprobar una crea una
-- fila en usuarios, y eso ya requiere ser administrador por su cuenta
-- (usuarios_insert_admin en rls_permisos_por_rol.sql), así que se mantiene
-- la misma regla acá para consistencia.
drop policy if exists "solicitudes_registro_select" on solicitudes_registro;
create policy "solicitudes_registro_select" on solicitudes_registro for select using (mi_rol() = 'administrador');

drop policy if exists "solicitudes_registro_update" on solicitudes_registro;
create policy "solicitudes_registro_update" on solicitudes_registro for update using (mi_rol() = 'administrador') with check (mi_rol() = 'administrador');

drop policy if exists "solicitudes_registro_delete" on solicitudes_registro;
create policy "solicitudes_registro_delete" on solicitudes_registro for delete using (mi_rol() = 'administrador');

-- Sin política de insert: el formulario público no tiene sesión, así que
-- se escribe con la service role key desde api/solicitud-registro.js —
-- mismo patrón que citas_agenda/prospectos desde los links públicos.
