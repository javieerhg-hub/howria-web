-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Pago del adiestrador, que funciona distinto al del paseador.
--
-- Un paseador cobra por paseo a una tarifa fija que vive en el cliente;
-- el cálculo sale solo. Un adiestrador no: cada evaluación y cada pack
-- se acuerdan aparte, así que el monto lo define quien paga, ítem por
-- ítem (decisión explícita de Javier).
--
-- Ojo con la diferencia entre estas dos cosas, que se confunden fácil:
--   tarifas_adiestrador.precio_evaluacion  = lo que le cobra AL CLIENTE
--                                            (sale en la página pública)
--   citas_agenda.pago_adiestrador          = lo que se le paga A ÉL
-- No son lo mismo ni tienen por qué parecerse.

-- ---------------------------------------------------------------
-- 1. Lo que se le paga por cada evaluación o clase realizada
-- ---------------------------------------------------------------
alter table citas_agenda add column if not exists pago_adiestrador integer;
-- Una cita ya pagada deja de aparecer entre las pendientes, pero se
-- puede seguir consultando en el historial del pago que la cubrió.
alter table citas_agenda add column if not exists pagado_adiestrador boolean not null default false;

-- ---------------------------------------------------------------
-- 2. Distinguir un pago de paseos de uno de adiestramiento
-- ---------------------------------------------------------------
-- Ambos viven en pagos_trabajadores a propósito: Finanzas ya lee esa
-- tabla como costo del negocio, y partirla en dos obligaría a sumar en
-- dos lados y a acordarse siempre de los dos. Lo que cambia es de dónde
-- sale el monto, no que sea un pago.
--
-- Las filas que ya existen son todas de paseos, por eso el default.
alter table pagos_trabajadores add column if not exists tipo text not null default 'paseos';
alter table pagos_trabajadores drop constraint if exists pagos_trabajadores_tipo_check;
alter table pagos_trabajadores add constraint pagos_trabajadores_tipo_check
  check (tipo in ('paseos', 'adiestramiento')) not valid;

-- ---------------------------------------------------------------
-- 3. La pestaña nueva
-- ---------------------------------------------------------------
-- Solo coordinador y administrador: muestra cuánto gana cada
-- adiestrador, igual que Pago trabajadores. Mismo patrón que
-- 104_permisos_roles_tab_paseadores.sql.
update permisos_roles set tabs = array_append(tabs, 'pago-adiestramiento')
where rol in ('coordinador', 'administrador')
  and not ('pago-adiestramiento' = any(tabs));

-- Las citas se consultan por adiestrador y estado al armar el pago.
create index if not exists citas_agenda_pago_pendiente_idx
  on citas_agenda (adiestrador) where not pagado_adiestrador;
