import { createClient } from "jsr:@supabase/supabase-js@2";

import { getOptionalEnv, getRequiredEnv } from "./env.ts";

function createBaseClient(apiKey: string, authHeader?: string) {
  const url = getRequiredEnv("SUPABASE_URL");

  return createClient(url, apiKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: authHeader
      ? {
          headers: {
            Authorization: authHeader,
          },
        }
      : undefined,
  });
}

export function createEdgeUserClient(authHeader: string) {
  const publishableKey =
    getOptionalEnv("SUPABASE_ANON_KEY") ??
    getOptionalEnv("SUPABASE_PUBLISHABLE_KEY") ??
    getRequiredEnv("SUPABASE_ANON_KEY");

  return createBaseClient(publishableKey, authHeader);
}

export function createEdgeServiceClient() {
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createBaseClient(serviceRoleKey);
}
