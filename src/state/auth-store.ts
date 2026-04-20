import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getMockSession } from "@/lib/auth";
import type { LoginInput, AuthSession, PermissionKey } from "@/types/auth";
import type { EntityId } from "@/types/common";

type AuthState = {
  token: string | null;
  session: AuthSession | null;
  hasHydrated: boolean;
  authResolved: boolean;
  login: (payload: LoginInput) => void;
  logout: () => void;
  setSession: (payload: { token: string; session: AuthSession }) => void;
  clearSession: () => void;
  setCurrentUnit: (unitId: EntityId) => void;
  hasPermission: (permission: PermissionKey) => boolean;
  setHasHydrated: (value: boolean) => void;
  setAuthResolved: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      session: null,
      hasHydrated: typeof window === "undefined",
      authResolved: false,

      login: ({ email }) => {
        const session = getMockSession(email);
        set({
          token: "mock-token",
          session,
          authResolved: true,
        });
      },

      logout: () => {
        set({
          token: null,
          session: null,
          authResolved: true,
        });
      },

      setSession: ({ token, session }) => {
        set({
          token,
          session,
          authResolved: true,
        });
      },

      clearSession: () => {
        set({
          token: null,
          session: null,
          authResolved: true,
        });
      },

      setCurrentUnit: (unitId) => {
        const session = get().session;
        if (!session) return;

        const unitExists = session.units.some((unit) => unit.id === unitId);
        if (!unitExists) return;

        set({
          session: {
            ...session,
            currentUnitId: unitId,
          },
        });
      },

      hasPermission: (permission) => {
        return Boolean(get().session?.permissions.includes(permission));
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value });
      },

      setAuthResolved: (value) => {
        set({ authResolved: value });
      },
    }),
    {
      name: "emagreceplus-auth",
      partialize: (state) => ({
        token: state.token,
        session: state.session,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);