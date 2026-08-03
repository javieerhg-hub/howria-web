-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Este script activa la seguridad real de la base de datos.

-- ============================================================
-- 1) Preparar la tabla usuarios para usar autenticación real
-- ============================================================
alter table usuarios add column if not exists email text unique;

update usuarios set email = 'camila.soto@howria.local' where nombre = 'Camila Soto';
update usuarios set email = 'pedro.vidal@howria.local' where nombre = 'Pedro Vidal';
update usuarios set email = 'javier.herrera@howria.local' where nombre = 'Javier Herrera';
update usuarios set email = 'javier.arniaz@howria.local' where nombre = 'Javier Arniaz';
update usuarios set email = 'olieska@howria.local' where nombre = 'Olieska';
update usuarios set email = 'marcela@howria.local' where nombre = 'Marcela';

-- Ya no guardamos contraseñas en esta tabla (quedaban expuestas a
-- cualquiera). Ahora viven de forma segura dentro de Supabase Auth.
alter table usuarios drop column if exists password;

-- ============================================================
-- 2) Activar RLS (seguridad a nivel de fila) en todas las tablas
--    Regla: solo alguien con sesión iniciada (autenticado) puede
--    leer o escribir. Sin sesión, la clave pública ya no sirve
--    para consultar nada.
-- ============================================================
alter table clientes enable row level security;
alter table boletas enable row level security;
alter table registro_paseos enable row level security;
alter table usuarios enable row level security;
alter table pagos_trabajadores enable row level security;
alter table equipo_interno enable row level security;
alter table objetivos_semanales enable row level security;
alter table objetivos_mensuales enable row level security;
alter table tareas_equipo enable row level security;
alter table citas_agenda enable row level security;
alter table prospectos enable row level security;
alter table clientes_portal_demo enable row level security;
alter table trabajadores enable row level security;
alter table servicios enable row level security;
alter table pagos enable row level security;

create policy "solo_autenticados" on clientes for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on boletas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on registro_paseos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on usuarios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on pagos_trabajadores for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on equipo_interno for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on objetivos_semanales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on objetivos_mensuales for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on tareas_equipo for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on citas_agenda for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on prospectos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on clientes_portal_demo for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on trabajadores for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on servicios for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "solo_autenticados" on pagos for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
