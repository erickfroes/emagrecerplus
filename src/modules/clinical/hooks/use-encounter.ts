"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { getEncounter } from "../api/get-encounter";

export function useEncounter(id: string) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["encounter", currentUnitId, id],
    queryFn: () => getEncounter(id),
    enabled: Boolean(id),
  });
}
