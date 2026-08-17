-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: en Finanzas, "Ganancia de Howria" restaba los pagos a
-- trabajadores (costosPeriodo) filtrados por fecha_pago (el día en que
-- se registró/tildó el pago), mientras que los ingresos se filtraban
-- por la fecha de la boleta (el día del trabajo). Son dos dimensiones
-- de fecha distintas — un pago registrado hoy puede cubrir una semana
-- de trabajo de hace rato, así que la "ganancia" de un período podía
-- mezclar ingresos de una semana con costos de otra.
--
-- Se agrega periodo_desde: la fecha de INICIO del período de trabajo
-- que el pago realmente cubre (ya se calculaba en pantalla vía
-- rangoPeriodo(), pero no se guardaba). Finanzas pasa a filtrar los
-- costos por esta fecha en vez de por fecha_pago, igual que ya hace
-- con los ingresos.
--
-- Sin cambios de RLS — la política de update/insert de
-- pagos_trabajadores ya cubre columnas nuevas.

alter table pagos_trabajadores add column if not exists periodo_desde date;
