"use client";

import { useAuthStore } from "@/state/auth-store";

export function useAuth() {
  const token = useAuthStore((state) => state.token);
  const session = useAuthStore((state) => state.session);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const authResolved = useAuthStore((state) => state.authResolved);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const setCurrentUnit = useAuthStore((state) => state.setCurrentUnit);
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const setAuthResolved = useAuthStore((state) => state.setAuthResolved);

  return {
    token,
    session,
    user: session?.user ?? null,
    units: session?.units ?? [],
    permissions: session?.permissions ?? [],
    currentUnitId: session?.currentUnitId ?? null,
    isAuthenticated: Boolean(token && session),
    hasHydrated,
    authResolved,
    login,
    logout,
    setSession,
    clearSession,
    setCurrentUnit,
    hasPermission,
    setAuthResolved,
  };
}