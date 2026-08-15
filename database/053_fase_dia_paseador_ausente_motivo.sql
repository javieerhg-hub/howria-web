-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: ruta guiada del paseador (Mis Paseos) — si un paseador no va a
-- salir a hacer su ronda hoy, puede "Justificar ausencia" en vez de
-- iniciarla, dejando un motivo. No se reutiliza el "cancelado" de
-- registro_paseos para esto: ese campo significa específicamente "el
-- cliente canceló" (no cuenta en contra del pago del paseador), y una
-- ausencia del paseador es un caso distinto que el coordinador necesita
-- distinguir. Se guarda acá, en fase_dia_paseador, que ya es única por
-- paseador_nombre+fecha — sin tocar la fase en sí (la fila puede quedar en
-- "pendiente" con un motivo de ausencia al lado).
--
-- Sin política RLS nueva: las 4 políticas de 049_fase_dia_paseador.sql
-- gatean toda la fila (el paseador dueño, o coordinador/administrador),
-- no columna por columna — una columna más queda cubierta sola.

alter table fase_dia_paseador add column if not exists ausente_motivo text;
