import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedSupabaseAdmin: SupabaseClient | null = null;

function getRequiredEnv(name: string, fallbackName?: string) {
  const value = process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : "");

  if (!value) {
    throw new Error(`${name}${fallbackName ? `/${fallbackName}` : ""} ausente para usar o Supabase admin.`);
  }

  return value;
}

export function getSupabaseAdmin() {
  if (cachedSupabaseAdmin) {
    return cachedSupabaseAdmin;
  }

  cachedSupabaseAdmin = createClient(
    getRequiredEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"),
    getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );

  return cachedSupabaseAdmin;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, property);

    return typeof value === "function" ? value.bind(client) : value;
  },
});
