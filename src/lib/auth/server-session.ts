import type { User } from "@supabase/supabase-js";
import type { AuthSession } from "@/types/auth";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type AuthMode = "mock" | "real";
type AppSessionState = "valid" | "invalid" | "unavailable";

export type ServerAuthState = {
  authMode: AuthMode;
  supabaseUser: User | null;
  accessToken: string | null;
  appSession: AuthSession | null;
  appSessionState: AppSessionState;
};

const apiBaseUrl =
  process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

function getAuthMode(): AuthMode {
  return process.env.NEXT_PUBLIC_AUTH_MODE === "real" ? "real" : "mock";
}

export async function getServerAuthState(): Promise<ServerAuthState> {
  const authMode = getAuthMode();

  if (authMode !== "real") {
    return {
      authMode,
      supabaseUser: null,
      accessToken: null,
      appSession: null,
      appSessionState: "valid",
    };
  }

  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authMode,
      supabaseUser: null,
      accessToken: null,
      appSession: null,
      appSessionState: "invalid",
    };
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? null;

  if (!accessToken) {
    return {
      authMode,
      supabaseUser: user,
      accessToken: null,
      appSession: null,
      appSessionState: "invalid",
    };
  }

  try {
    const response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        authMode,
        supabaseUser: user,
        accessToken,
        appSession: null,
        appSessionState: response.status === 401 || response.status === 403 ? "invalid" : "unavailable",
      };
    }

    return {
      authMode,
      supabaseUser: user,
      accessToken,
      appSession: (await response.json()) as AuthSession,
      appSessionState: "valid",
    };
  } catch {
    return {
      authMode,
      supabaseUser: user,
      accessToken,
      appSession: null,
      appSessionState: "unavailable",
    };
  }
}
