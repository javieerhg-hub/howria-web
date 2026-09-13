-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- El cupón de 10% del plan mensual de paseos: el aviso que sale al entrar
-- a howria.cl pide el correo y le manda el código por mail (ver
-- api/cupon.js y src/PromoCupon.jsx).
--
-- POR QUÉ UNA TABLA Y NO UN CÓDIGO FIJO PARA TODOS. Un "PASEO10" suelto
-- se comparte por WhatsApp en un día y se pierde la única cosa que hace
-- que este aviso valga la pena: saber quién pidió el cupón y si terminó
-- contratando. Acá cada correo recibe SU código, y el cupón es la prueba
-- de que esa persona llegó por la web.
--
-- EL CORREO ES ÚNICO A PROPÓSITO: alguien que vuelve a pedir el cupón
-- recibe el mismo código que ya tenía, no uno nuevo. Sin eso, la misma
-- persona podía juntar cupones dándole al botón, y cada uno habría
-- creado otro prospecto duplicado en Seguimiento.
--
-- El prospecto se crea en la misma llamada (origen "Cupón 10%"), así que
-- el lead aparece solo en la pestaña Seguimiento, que es donde el equipo
-- ya trabaja los contactos nuevos. `prospecto_id` guarda a cuál, para
-- poder mirar después quién pidió cupón y en qué terminó.
create table if not exists cupones_promocion (
  id uuid primary key default gen_random_uuid(),
  -- Siempre en minúsculas y sin espacios (lo normaliza api/cupon.js) —
  -- si no, "Ana@Gmail.com" y "ana@gmail.com" serían dos cupones.
  email text not null unique,
  -- Opcional: el aviso solo exige el correo. Sirve para saludar por su
  -- nombre en el mail y para que el prospecto no quede como "ana123".
  nombre text,
  codigo text not null unique,
  -- Para cuando haya una segunda promoción: las de ahora quedan todas
  -- marcadas y no se mezclan con la siguiente.
  campana text not null default 'paseo-mensual-10',
  -- 30 DÍAS ES UN DEFAULT, NO UNA DECISIÓN TOMADA. Un cupón sin fecha de
  -- vencimiento es una promesa abierta para siempre: alguien puede
  -- aparecer en dos años con el código. Cambiá el intervalo acá si el
  -- plazo real es otro — la fecha se calcula en la base al crear el
  -- cupón y viaja al correo, así que no hay un segundo lugar que tocar.
  valido_hasta date not null default (now() + interval '30 days')::date,
  -- Se marca recién cuando Resend acepta el correo, igual que
  -- citas_agenda.email_enviado: si el envío falla, esto queda en false y
  -- se ve que el cupón existe pero nunca llegó.
  email_enviado boolean not null default false,
  prospecto_id uuid references prospectos(id) on delete set null,
  -- Se llenan a mano cuando se aplica el descuento en una boleta. Hoy no
  -- hay pantalla que los escriba (ver la nota de abajo).
  usado_en timestamptz,
  usado_por text,
  created_at timestamptz not null default now()
);

-- Para listarlos por fecha sin escanear la tabla entera.
create index if not exists cupones_promocion_recientes_idx
  on cupones_promocion (created_at desc);

alter table cupones_promocion enable row level security;

-- Quién puede VER los cupones: coordinador y administrador, igual que
-- prospectos (database/012) — es la misma información comercial.
drop policy if exists "cupones_select_coord_admin" on cupones_promocion;
create policy "cupones_select_coord_admin" on cupones_promocion
  for select using (mi_rol() in ('coordinador', 'administrador'));

-- Quién puede marcarlo como usado. Todavía no hay pantalla que lo haga
-- —hoy el descuento se aplica a mano en la boleta— pero la policy queda
-- puesta para que agregarla después no necesite otra migración.
drop policy if exists "cupones_update_coord_admin" on cupones_promocion;
create policy "cupones_update_coord_admin" on cupones_promocion
  for update using (mi_rol() in ('coordinador', 'administrador'))
  with check (mi_rol() in ('coordinador', 'administrador'));

-- NO HAY POLICY DE INSERT, y es intencional: el único que crea cupones es
-- api/cupon.js con la service role key (que se salta la RLS). Si alguien
-- con sesión pudiera insertar acá, podría fabricarse cupones para sí
-- mismo sin pasar por el formulario.
--
-- Tampoco hay policy de delete: un cupón emitido es la prueba de qué se
-- le prometió a esa persona. Si hay que sacar uno, se borra a mano desde
-- el SQL Editor.
