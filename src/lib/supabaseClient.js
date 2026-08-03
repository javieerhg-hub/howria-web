import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Cliente separado, solo para crear cuentas de acceso de otras personas
// (signUp) sin pisar la sesión del administrador que está logueado
// haciendo la acción — no persiste sesión ni toca el localStorage.
const supabaseCreacionCuentas = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const ALFABETO_PASSWORD = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789"; // sin 0/O ni 1/l/I
export function generarPasswordTemporal() {
  const valores = new Uint32Array(12);
  crypto.getRandomValues(valores);
  return Array.from(valores, (v) => ALFABETO_PASSWORD[v % ALFABETO_PASSWORD.length]).join("");
}

export async function crearCuentaAcceso(email) {
  const password = generarPasswordTemporal();
  const { error } = await supabaseCreacionCuentas.auth.signUp({ email, password });
  return { password, error };
}
