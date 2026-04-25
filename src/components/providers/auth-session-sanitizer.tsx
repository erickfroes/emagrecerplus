"use client";

import { useEffect } from "react";
import { env } from "@/lib/env";
import { useAuthStore } from "@/state/auth-store";

export function AuthSessionSanitizer() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const clearSession = useAuthStore((state) => state.clearSession);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    const authState = useAuthStore.getState();
    const { token, session } = authState;

    if (!token && !session) {
      return;
    }

    if (!token || !session) {
      clearSession();
      return;
    }

    if (env.authMode === "mock" && token !== "mock-token") {
      clearSession();
      return;
    }

    if (env.authMode === "real" && token === "mock-token") {
      clearSession();
      return;
    }

    if (session.user.role === "patient") {
      return;
    }

    const unitIds = session.units.map((unit) => unit.id).filter(Boolean);
    const accessibleUnitIds = session.accessibleUnitIds.filter(Boolean);
    const eligibleUnitIds = accessibleUnitIds.filter((unitId) => unitIds.includes(unitId));
    const hasValidCurrentUnit =
      Boolean(session.currentUnitId) &&
      unitIds.includes(session.currentUnitId) &&
      accessibleUnitIds.includes(session.currentUnitId);

    if (hasValidCurrentUnit) {
      return;
    }

    const fallbackUnitId = eligibleUnitIds[0] ?? unitIds[0] ?? null;

    if (!fallbackUnitId) {
      clearSession();
      return;
    }

    useAuthStore.setState({
      session: {
        ...session,
        currentUnitId: fallbackUnitId,
      },
    });
  }, [clearSession, hasHydrated]);

  return null;
}
