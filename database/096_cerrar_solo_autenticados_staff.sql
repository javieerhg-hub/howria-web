-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Bug de seguridad encontrado en la auditoría de permisos: cuatro tablas
-- se quedaron desde 018_seguridad_rls_y_auth.sql con la política original
-- "solo_autenticados" (`for all using auth.role() = 'authenticated'`) y
-- NUNCA se reemplazó, aunque son datos internos del equipo. Como las
-- cuentas de clientes también inician sesión real (026_rls_login_
-- clientes.sql), "autenticado" hoy incluye a cualquier cliente — en
-- teoría, un cliente conectado a su propio portal podría leer o escribir
-- objetivos_semanales, objetivos_mensuales, tareas_equipo o prospectos de
-- cualquiera llamando directo a la API de Supabase (sin pasar por la app).
--
-- Caso aparte y más grave: prospectos ya tenía pensada una restricción
-- fina para el rol entrenador (055_prospectos_entrenador_sus_citas.sql,
-- "solo los prospectos que pidieron cita con él, no todos los del
-- negocio") pero como las políticas de Postgres se combinan con OR, la
-- política vieja "solo_autenticados" (cualquier autenticado, sin
-- excepción) seguía anulando esa restricción en la práctica.
--
-- objetivos_semanales / objetivos_mensuales / tareas_equipo: ningún
-- cliente las usa (son de uso interno del equipo, HowriaAdmin.jsx las
-- carga sin filtrar por rol), así que se acotan a "cualquier rol de
-- staff" sin restricción adicional por fila.
drop policy if exists "solo_autenticados" on objetivos_semanales;
create policy "objetivos_semanales_staff" on objetivos_semanales for all using (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
);

drop policy if exists "solo_autenticados" on objetivos_mensuales;
create policy "objetivos_mensuales_staff" on objetivos_mensuales for all using (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
);

drop policy if exists "solo_autenticados" on tareas_equipo;
create policy "tareas_equipo_staff" on tareas_equipo for all using (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
) with check (
  mi_rol() in ('paseador', 'entrenador', 'coordinador', 'administrador')
);

-- prospectos: se acota a coordinador/administrador (el dueño histórico de
-- Seguimiento/Prospección) — la política de 055 sigue aparte, sin tocar,
-- dándole al entrenador acceso solo a sus propios prospectos vinculados.
drop policy if exists "solo_autenticados" on prospectos;
create policy "prospectos_staff" on prospectos for all using (
  mi_rol() in ('coordinador', 'administrador')
) with check (
  mi_rol() in ('coordinador', 'administrador')
);
