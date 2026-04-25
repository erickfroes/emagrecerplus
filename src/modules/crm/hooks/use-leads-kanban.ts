"use client";

import { useQuery } from "@tanstack/react-query";
import { getLeadsKanban } from "@/modules/crm/api/get-leads";
import { useAuthStore } from "@/state/auth-store";

export function useLeadsKanban() {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["leads-kanban", currentUnitId],
    queryFn: getLeadsKanban,
  });
}
