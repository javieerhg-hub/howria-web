-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: Finanzas calcula "Pago a responsables (adiestramiento)" —
-- lo que le corresponde a cada entrenador/responsable en las facturas
-- de adiestramiento con reparto — pero no había ningún lugar en la app
-- para marcar que ya se le pagó esa plata ni ver el desglose por
-- persona (a diferencia de "Pago trabajadores", que sí lo tiene para
-- paseadores). Se agrega el flag directamente en la boleta, ya que el
-- reparto también vive ahí (monto_responsable, 069).
--
-- Sin cambios de RLS — la política de update de boletas_adiestramiento
-- ya cubre columnas nuevas.

alter table boletas_adiestramiento add column if not exists pagado_a_responsable boolean not null default false;
alter table boletas_adiestramiento add column if not exists pagado_a_responsable_por text;
alter table boletas_adiestramiento add column if not exists pagado_a_responsable_en timestamptz;
