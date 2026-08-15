-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Tabla para la pestaña "Mail" del panel: guarda tanto los correos
-- entrantes (recibidos en contacto@howria.cl vía Cloudflare Email Routing
-- + api/correo-entrante.js) como los salientes (confirmaciones de cita
-- que ya se mandan por Resend desde api/confirmar-cita.js).

create table if not exists correos (
  id uuid primary key default gen_random_uuid(),
  direccion text not null check (direccion in ('entrante', 'saliente')),
  remitente text not null,
  destinatario text not null,
  asunto text,
  cuerpo_texto text,
  cuerpo_html text,
  cliente_id uuid references clientes(id) on delete set null,
  prospecto_id uuid references prospectos(id) on delete set null,
  creado_en timestamptz not null default now()
);
alter table correos enable row level security;

drop policy if exists "correos_select_staff" on correos;
create policy "correos_select_staff" on correos for select using (
  mi_rol() in ('coordinador', 'administrador')
);
-- Sin política de insert/update/delete: solo se escribe con la service
-- role key desde api/correo-entrante.js y api/confirmar-cita.js, que
-- bypassan RLS — igual que citas_agenda/prospectos desde el link público.

update permisos_roles
  set tabs = array(select distinct unnest(tabs || array['mail']))
  where rol in ('coordinador', 'administrador');
