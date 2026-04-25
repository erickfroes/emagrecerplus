"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { getSettingsAccessOverview } from "../api/get-settings-access-overview";

export function useSettingsAccessOverview() {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["settings-access", currentUnitId],
    queryFn: getSettingsAccessOverview,
  });
}
