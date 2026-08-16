-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: en una factura de adiestramiento, lo que se factura no es
-- todo para el responsable de la cuenta (el entrenador a cargo) — hay un
-- reparto con Howria como empresa (ej. de $220.000, $180.000 para el
-- entrenador y $40.000 para Howria). Antes no había forma de registrar
-- ese reparto, así que la Finanzas personal del responsable mostraba el
-- total facturado como si fuera 100% suyo.
--
-- Nullable y sin default: null significa "todavía no se definió el
-- reparto para esta factura" y se trata como 100% del responsable
-- (mismo comportamiento que había antes de esta columna, para no
-- alterar retroactivamente ninguna cifra ya calculada). Sin cambios de
-- RLS — la política de update de boletas_adiestramiento ya cubre
-- columnas nuevas, igual que en 060/063/068.

alter table boletas_adiestramiento add column if not exists monto_responsable numeric;
