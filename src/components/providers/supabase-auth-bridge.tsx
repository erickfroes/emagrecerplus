"use client";

import { useEffect } from "react";
import { getAuthMe } from "@/modules/auth/api/get-auth-me";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { HttpError } from "@/lib/http";
import { useAuthStore } from "@/state/auth-store";
import { env } from "@/lib/env";

export function SupabaseAuthBridge() {
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setAuthResolved = useAuthStore((state) => state.setAuthResolved);

  useEffect(() => {
    if (env.authMode !== "real") {
      setAuthResolved(true);
      return;
    }

    const supabase = getSupabaseBrowserClient();

    const clearSupabaseSession = async () => {
      await supabase.auth.signOut();
    };

    const syncAppSession = async (accessToken: string) => {
      const appSession = await getAuthMe(accessToken);
      setSession({
        token: accessToken,
        session: appSession,
      });
    };

    const syncCurrentSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        clearSession();
        setAuthResolved(true);
        return;
      }

      try {
        await syncAppSession(session.access_token);
      } catch (error) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) {
          await clearSupabaseSession();
        }

        clearSession();
      } finally {
        setAuthResolved(true);
      }
    };

    void syncCurrentSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setAuthResolved(false);

      if (!session?.access_token) {
        clearSession();
        setAuthResolved(true);
        return;
      }

      try {
        await syncAppSession(session.access_token);
      } catch (error) {
        if (error instanceof HttpError && [401, 403].includes(error.status)) {
          await clearSupabaseSession();
        }

        clearSession();
      } finally {
        setAuthResolved(true);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [clearSession, setAuthResolved, setSession]);

  return null;
}
