-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la auditoría técnica del 2026-08-19: la migración 098 agregó
-- `paseador_compartido`/`porcentaje_compartido` a `registro_paseos` sin
-- ninguna restricción propia — heredaba solo la RLS que ya existía para
-- el resto de la fila ("registro_paseos_update": coordinador/
-- administrador/entrenador, O el propio paseador para SUS clientes). En
-- la práctica eso significa que cualquier paseador podía, llamando
-- directo a la API de Supabase (sin pasar por la pantalla "Compartir
-- con..." de Coordinación), asignarse a sí mismo un "compañero de
-- reparto" en uno de sus propios clientes y elegir cualquier porcentaje
-- — incluyendo valores fuera de rango (0, negativos, más de 100), que
-- rompen el cálculo `(100 - porcentaje) / 100` en Mis Paseos, Finanzas y
-- Pago Trabajadores.
--
-- Dos capas de defensa, ambas necesarias:

-- 1) Rango válido — RLS no puede validar esto (es un CHECK de columna,
--    no una política de fila), así que va como constraint de tabla.
alter table registro_paseos drop constraint if exists registro_paseos_porcentaje_compartido_check;
alter table registro_paseos add constraint registro_paseos_porcentaje_compartido_check
  check (porcentaje_compartido is null or (porcentaje_compartido between 1 and 99));

-- 2) Quién puede tocar estas dos columnas específicas — RLS no distingue
--    columnas dentro de una misma fila, así que se resuelve con un
--    trigger: si alguien intenta cambiar paseador_compartido o
--    porcentaje_compartido y no es coordinador/administrador/entrenador,
--    la escritura se rechaza (el resto de la fila —realizado, nota, etc.—
--    sigue funcionando igual que antes para cualquier paseador en sus
--    propios clientes, esto no lo toca).
-- Cubre insert Y update: la app siempre pasa por "upsert" (insert que se
-- vuelve update si la fila ya existe), pero alguien llamando directo a la
-- API podría mandar un insert nuevo con paseador_compartido ya puesto
-- desde el principio, sin pasar nunca por un update.
create or replace function bloquear_reparto_no_staff()
returns trigger
language plpgsql
security definer
as $$
begin
  if (
    (tg_op = 'INSERT' and new.paseador_compartido is not null)
    or (tg_op = 'UPDATE' and (
      new.paseador_compartido is distinct from old.paseador_compartido
      or new.porcentaje_compartido is distinct from old.porcentaje_compartido
    ))
  ) and mi_rol() not in ('coordinador', 'administrador', 'entrenador') then
    raise exception 'Solo coordinador, administrador o entrenador pueden repartir el pago de un paseo.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_reparto_no_staff on registro_paseos;
create trigger trg_bloquear_reparto_no_staff
  before insert or update on registro_paseos
  for each row
  execute function bloquear_reparto_no_staff();
