-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Un paseador no podía marcar un paseo de un cliente que le reasignaron.
--
-- Caso real (2026-09-01): Felipe/Benito hoy es cliente de Andreína, pero
-- la fila de registro_paseos de ese día ya existía escrita con
-- paseador_nombre = 'Javier H', de cuando el cliente era de él. Al
-- intentar marcarlo, Andreína recibía:
--
--   new row violates row-level security policy (USING expression)
--   for table "registro_paseos"
--
-- El "USING expression" es la pista: el guardado es un upsert, así que
-- cuando la fila ya existe se evalúa la política de UPDATE, y su USING
-- mira la fila VIEJA. Ahí decía 'Javier H', no ella.
--
-- Lo mismo pasaba en SELECT, y eso era peor que el error: la fila le
-- quedaba invisible, así que el paseo le aparecía pendiente para siempre
-- aunque ya estuviera marcado.
--
-- La regla nueva agrega: también es tuya la fila de un cliente que HOY
-- está asignado a ti, diga lo que diga el nombre guardado en la fila. Eso
-- cubre toda reasignación — la permanente de "Reasignar pendientes" y
-- cualquier cambio de paseador en la ficha del cliente.
--
-- Al marcarlo, el upsert reescribe paseador_nombre con el paseador actual
-- del cliente, así que la fila queda corregida sola y el pago va a quien
-- corresponde.

create or replace function paseo_de_mi_cliente(id_cliente uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from clientes c
    where c.id = id_cliente and c.paseador_nombre = mi_nombre()
  );
$$;

drop policy if exists "registro_paseos_select" on registro_paseos;
create policy "registro_paseos_select" on registro_paseos for select using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or paseador_nombre = mi_nombre()
  or paseo_de_mi_cliente(cliente_id)
);

drop policy if exists "registro_paseos_insert" on registro_paseos;
create policy "registro_paseos_insert" on registro_paseos for insert with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or paseador_nombre = mi_nombre()
  or paseo_de_mi_cliente(cliente_id)
);

drop policy if exists "registro_paseos_update" on registro_paseos;
create policy "registro_paseos_update" on registro_paseos for update using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or paseador_nombre = mi_nombre()
  or paseo_de_mi_cliente(cliente_id)
) with check (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or paseador_nombre = mi_nombre()
  or paseo_de_mi_cliente(cliente_id)
);

drop policy if exists "registro_paseos_delete" on registro_paseos;
create policy "registro_paseos_delete" on registro_paseos for delete using (
  mi_rol() in ('coordinador', 'administrador', 'entrenador')
  or paseador_nombre = mi_nombre()
  or paseo_de_mi_cliente(cliente_id)
);
