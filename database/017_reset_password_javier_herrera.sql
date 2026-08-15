-- Corre esto en el SQL Editor de Supabase (proyecto Howria)
-- Restablece la contraseña de Javier Herrera directamente

update auth.users
set encrypted_password = crypt('admin2026', gen_salt('bf'))
where email = 'javier.herrera@howria.local';
