-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Marca los clientes que entraron solos por la agenda pública y todavía
-- no pasaron por una decisión del equipo.
--
-- Contexto: api/cliente-agenda.js ya crea un cliente REAL apenas alguien
-- reserva por el link público (antes de que nadie confirme la cita), a
-- propósito incompleto: sin paseador, sin tarifa, sin plan. Eso sirve
-- para que la cita aparezca de una en las pantallas del entrenador, pero
-- hasta ahora ese cliente quedaba flotando sin que nadie decidiera qué
-- hacer con él — solo se lo veía como una pastilla suelta en Inicio.
--
-- Con esta columna, esos clientes aparecen en un panel de Coordinación
-- donde se define qué servicio va a tomar (paseos / evaluación / clases)
-- y quién lo atiende. Al guardar la decisión, la marca vuelve a false y
-- el cliente sale del panel.
--
-- Los clientes que ya existen quedan en false: no son entrantes nuevos,
-- así que no tiene sentido pedir una decisión sobre ellos.
--
-- Sin cambios de RLS: coordinador/administrador ya pueden actualizar
-- clientes (es lo mismo que hacen desde la pestaña Clientes).

alter table clientes add column if not exists triage_pendiente boolean not null default false;

-- Los que están pendientes se consultan siempre filtrando por esta
-- columna, y son unos pocos entre decenas de clientes.
create index if not exists clientes_triage_pendiente_idx
  on clientes (triage_pendiente) where triage_pendiente;
