-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Hallado en la revisión de lógica financiera: un ajuste de pago (bono o
-- descuento en Pago Trabajadores) quedaba registrado con quién y cuándo,
-- pero nunca por qué — un número suelto sin ninguna explicación, ni
-- siquiera en el historial final una vez pagado. Se agrega "motivo" al
-- borrador (ajustes_pago_pendientes) y al pago ya confirmado
-- (pagos_trabajadores), para que la razón también quede en el historial,
-- no solo en el momento de escribirlo.

alter table ajustes_pago_pendientes add column if not exists motivo text;
alter table pagos_trabajadores add column if not exists ajuste_motivo text;
