import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);

// Cliente separado, solo para crear cuentas de acceso de otras personas
// (signUp) sin pisar la sesión del administrador que está logueado
// haciendo la acción. persistSession:false no alcanza solo — sin un
// storageKey propio, este cliente comparte el BroadcastChannel del
// cliente principal, y el signUp() dispara un evento "SIGNED_IN" que la
// pestaña del administrador recibe como si fuera su propia sesión
// (dejaba la app en un estado roto/en blanco a mitad de aprobar a
// alguien). Con storageKey distinto quedan completamente aislados.
const supabaseCreacionCuentas = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "howria-creacion-cuentas" },
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
