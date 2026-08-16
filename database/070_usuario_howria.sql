-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
--
-- Contexto: la ganancia de la empresa (lo que no es pago al trabajador
-- ni gastos del servicio) va a quedar atribuida a una cuenta llamada
-- "Howria" en vez de a "Javier Herrera" — Javier Herrera (la persona)
-- también hace paseos de verdad, así que se le crea una cuenta nueva y
-- separada para eso (rol paseador, se crea desde Usuarios → Agregar
-- usuario, no por SQL).
--
-- Solo se renombra: mismo email, misma contraseña, mismo rol — el login
-- de Javier sigue funcionando exactamente igual, solo cambia el nombre
-- que se muestra en la app.
--
-- No hace falta tocar `clientes`: paseador_nombre/responsable_nombre son
-- texto libre sin relación (FK) con usuarios, así que los clientes que
-- hoy dicen "Javier Herrera" van a seguir diciendo eso — y van a quedar
-- atribuidos solos a la cuenta nueva de paseador una vez que exista,
-- sin ninguna migración de datos.

update usuarios set nombre = 'Howria' where nombre = 'Javier Herrera';
