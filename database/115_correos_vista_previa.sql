-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Sacar el cuerpo de los correos de la carga inicial.
--
-- Medido en producción: `correos` pesaba 141 KB con 40 correos, y casi
-- todo es el cuerpo — el HTML completo de cada mensaje. Se baja apenas
-- entras aunque nunca abras la pestaña Mail, y crece con cada correo que
-- recibe el negocio. El cuerpo solo hace falta cuando alguien abre UN
-- correo, así que ahora se pide en ese momento.
--
-- El problema de simplemente dejarlo fuera es el adelanto de la tarjeta
-- ("vista previa" en Mail.jsx), que hoy se arma sacándole las etiquetas
-- al HTML completo. Esta columna guarda ese adelanto ya calculado y
-- acotado a 160 caracteres, así la lista no depende del cuerpo y su peso
-- deja de crecer con lo largos que sean los correos.

alter table correos add column if not exists vista_previa text;

-- Se calcula en la base y no en el código a propósito: los correos entran
-- por tres caminos distintos (el Worker de Cloudflare vía
-- api/correo-entrante.js, api/responder-correo.js, y los avisos
-- automáticos de citas). Un trigger los cubre a todos sin tener que
-- acordarse en cada uno.
create or replace function correos_calcular_vista_previa() returns trigger as $$
begin
  new.vista_previa := left(
    btrim(regexp_replace(
      coalesce(
        nullif(btrim(new.cuerpo_texto), ''),
        -- Sin cuerpo de texto (es el caso de nuestros propios avisos, que
        -- se mandan solo en HTML) se le sacan las etiquetas al HTML.
        regexp_replace(coalesce(new.cuerpo_html, ''), '<[^>]*>', ' ', 'g')
      ),
      '\s+', ' ', 'g')),
    160);
  return new;
end;
$$ language plpgsql;

drop trigger if exists correos_vista_previa_trg on correos;
create trigger correos_vista_previa_trg
  before insert or update of cuerpo_texto, cuerpo_html on correos
  for each row execute function correos_calcular_vista_previa();

-- Los 40 que ya existen.
update correos set vista_previa = left(
  btrim(regexp_replace(
    coalesce(
      nullif(btrim(cuerpo_texto), ''),
      regexp_replace(coalesce(cuerpo_html, ''), '<[^>]*>', ' ', 'g')
    ),
    '\s+', ' ', 'g')),
  160);

-- Sin cambios de RLS: es una columna más de una tabla que ya solo pueden
-- leer coordinador y administrador (031_correos.sql).
