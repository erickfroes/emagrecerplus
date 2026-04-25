import { createClient } from "@supabase/supabase-js";

function resolveSupabaseUrl() {
  const value = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!value) {
    throw new Error("SUPABASE_URL nao definida.");
  }

  return value;
}

function resolveSupabasePublishableKey() {
  const value =
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_ANON_KEY;

  if (!value) {
    throw new Error("SUPABASE publishable key nao definida.");
  }

  return value;
}

export function createSupabaseRequestClient(accessToken: string) {
  return createClient(resolveSupabaseUrl(), resolveSupabasePublishableKey(), {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
