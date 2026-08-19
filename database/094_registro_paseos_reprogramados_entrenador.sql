-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- 093_permisos_roles_entrenador_coordinacion.sql le dio al entrenador
-- acceso a la pestaña Coordinación (Hoy/Semana/Reprogramar paseos), pero
-- eso solo controla qué VE en el menú — las políticas RLS de
-- registro_paseos y paseos_reprogramados seguían restringiendo las
-- escrituras a coordinador/administrador (registro_paseos, además, ya
-- tenía un límite explícito a propósito: "entrenador solo sus propios
-- paseos"). Sin este script, el entrenador vería la pestaña pero con
-- datos incompletos en Hoy/Semana (en blanco para paseos que no son
-- suyos) y un error al intentar reprogramar el paseo de otro paseador.
--
-- Javier confirmó explícitamente que quiere que el entrenador tenga acá
-- el mismo nivel de control que un coordinador: puede ver/marcar/
-- reprogramar el paseo de CUALQUIER paseador, no solo el suyo — mismo
-- criterio de confianza ya aceptado en clientes (064, "equipo chico").

-- registro_paseos (019_rls_permisos_por_rol.sql)
drop policy if exists "registro_paseos_select" on registro_paseos;
create policy "registro_paseos_select" on registro_paseos for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
);
drop policy if exists "registro_paseos_insert" on registro_paseos;
create policy "registro_paseos_insert" on registro_paseos for insert with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
);
drop policy if exists "registro_paseos_update" on registro_paseos;
create policy "registro_paseos_update" on registro_paseos for update using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
) with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
);
drop policy if exists "registro_paseos_delete" on registro_paseos;
create policy "registro_paseos_delete" on registro_paseos for delete using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
);

-- paseos_reprogramados (092_paseos_reprogramados.sql)
drop policy if exists "paseos_reprogramados_select" on paseos_reprogramados;
create policy "paseos_reprogramados_select" on paseos_reprogramados for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador') or paseador_nombre = mi_nombre()
);
drop policy if exists "paseos_reprogramados_insert_coord_admin" on paseos_reprogramados;
create policy "paseos_reprogramados_insert_coord_admin" on paseos_reprogramados for insert with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);
drop policy if exists "paseos_reprogramados_delete_coord_admin" on paseos_reprogramados;
create policy "paseos_reprogramados_delete_coord_admin" on paseos_reprogramados for delete using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
);

-- fase_dia_paseador (049_fase_dia_paseador.sql) — Coordinación solo LEE
-- esta tabla (badge de fase/ausencia por paseador), nunca escribe desde
-- ahí, así que solo hace falta ampliar el select.
drop policy if exists "fase_dia_paseador_select" on fase_dia_paseador;
create policy "fase_dia_paseador_select" on fase_dia_paseador for select using (
  mi_rol() in ('coordinador','administrador','entrenador') or paseador_nombre = mi_nombre()
);
