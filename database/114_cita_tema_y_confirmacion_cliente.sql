-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Agendar una clase de un plan: tema de la clase y confirmación del
-- cliente desde el correo.

-- ---------------------------------------------------------------
-- 1. El tema de la clase
-- ---------------------------------------------------------------
-- Columna propia y no "notas": notas se usa DESPUÉS de la clase, para
-- anotar cómo salió (ver confirmarRealizada en Agenda). El tema se
-- define ANTES y es lo que se le anuncia al cliente; mezclarlos haría
-- que anotar el seguimiento borrara lo que se había prometido.
alter table citas_agenda add column if not exists tema text;

-- ---------------------------------------------------------------
-- 2. Confirmación del cliente
-- ---------------------------------------------------------------
-- Un secreto por cita para armar el enlace del correo. Va como columna
-- y no derivado del id: el id es predecible dentro de la app y no sirve
-- como llave de una página pública, donde cualquiera con la URL entra.
alter table citas_agenda add column if not exists token_confirmacion uuid not null default gen_random_uuid();
create unique index if not exists citas_agenda_token_idx on citas_agenda (token_confirmacion);

-- Cuándo confirmó el cliente. Distinto de confirmada_en, que es cuándo
-- lo confirmó el EQUIPO: son dos confirmaciones distintas y saber que
-- la persona vio el correo y dijo "sí voy" es justamente lo que se
-- quiere agregar.
alter table citas_agenda add column if not exists confirmada_cliente_en timestamptz;

-- La página pública lee y escribe con la service role key desde
-- api/cita-publica.js, que bypassa RLS — igual que la agenda pública.
-- No se abre ninguna política nueva.
