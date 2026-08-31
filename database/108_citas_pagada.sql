-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Marca simple de "el cliente ya pagó esta cita", para las evaluaciones
-- que se cobran en el momento. Se registra desde la ficha del cliente,
-- en la sección Evaluación.
--
-- No pasa por boletas a propósito: es una anotación de que la persona
-- está al día, no un documento de venta. Si la evaluación se factura de
-- verdad, eso sigue siendo una boleta de adiestramiento en el modo
-- "Solo evaluación" (ver database/105 y src/tabs/Boletas.jsx), que es lo
-- que entra en Finanzas.
--
-- "Si ya se realizó o no" NO necesita columna: citas_agenda.estado ya
-- tiene 'realizada' desde database/012.

alter table citas_agenda add column if not exists pagada boolean not null default false;
alter table citas_agenda add column if not exists pagada_en date;
