-- Corre esto en el SQL Editor de Supabase (proyecto Howria)

-- 1) Los 24 clientes que ya estaban cargados son de Javier Arunías
update clientes set paseador_nombre = 'Javier Arunías' where paseador_nombre is null;

-- 2) Estos 17 clientes nuevos son de Javier Herrera
insert into clientes (nombre, perro, valor_paseo_ref, paseador_nombre, estado_cliente) values
('Paty', 'Caluga', 7140, 'Javier Herrera', 'activo'),
('Sandra', 'Jako y Maya', 9900, 'Javier Herrera', 'activo'),
('Consuelo', 'Pandora y Olivia', 9500, 'Javier Herrera', 'activo'),
('Claudio', 'Pepe', 5830, 'Javier Herrera', 'activo'),
('Braulio', 'Willy & Antonio', 7730, 'Javier Herrera', 'activo'),
('Valeria', 'Juto Mimu', 12140, 'Javier Herrera', 'activo'),
('Mauricio', 'Alexa y Pepi', 9000, 'Javier Herrera', 'activo'),
('Jocelin', 'Kaiser', 6190, 'Javier Herrera', 'activo'),
('Rosario', 'Tara Tantor y Tinto', 8300, 'Javier Herrera', 'activo'),
('Milena', 'Lilo', 6000, 'Javier Herrera', 'activo'),
('Gaston', 'Venom', 6000, 'Javier Herrera', 'activo'),
('Joyce', 'Flaco', 7000, 'Javier Herrera', 'activo'),
('Pilar', 'Kira y Rocco', 7000, 'Javier Herrera', 'activo'),
('Juan Cristobal', 'Kira', 6550, 'Javier Herrera', 'activo'),
('Francisca', 'Ringo', 6000, 'Javier Herrera', 'activo'),
('Carito', 'Rayo', 7000, 'Javier Herrera', 'activo'),
('Beatriz', 'Kaiser', 8000, 'Javier Herrera', 'activo');
