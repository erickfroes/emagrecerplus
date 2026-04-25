"use client";

import { useQuery } from "@tanstack/react-query";
import { getDashboardSummary } from "@/modules/dashboard/api/get-dashboard-summary";
import { useAuthStore } from "@/state/auth-store";

export function useDashboardSummary() {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["dashboard-summary", currentUnitId],
    queryFn: getDashboardSummary,
  });
}
