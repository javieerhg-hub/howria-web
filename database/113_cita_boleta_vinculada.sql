-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Vincular una evaluación o clase con la boleta en que se cobró.
--
-- Para qué: al pagarle al adiestrador hay que saber cuánto entró por esa
-- evaluación, y esa plata vive en la boleta, no en la cita. Con el
-- vínculo, la pantalla de Pago adiestramiento puede mostrar los tres
-- números juntos — entró tanto, al adiestrador le toca tanto, a Howria
-- le queda el resto — en vez de pedir que uno los cruce de memoria.
--
-- citas_agenda.precio existe desde antes, pero es el precio de lista que
-- se mostró al reservar por el link público. No siempre es lo que se
-- terminó cobrando: hay descuentos, packs que absorben la evaluación y
-- citas agendadas a mano sin precio. La boleta sí dice lo que se cobró.
--
-- El vínculo es opcional a propósito: una evaluación de cortesía o
-- todavía sin facturar tiene que poder pagarse igual.
alter table citas_agenda add column if not exists boleta_adiestramiento_id uuid
  references boletas_adiestramiento(id) on delete set null;

create index if not exists citas_agenda_boleta_idx on citas_agenda (boleta_adiestramiento_id);
