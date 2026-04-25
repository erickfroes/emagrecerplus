"use client";

import { useQuery } from "@tanstack/react-query";
import { getLeadActivities } from "@/modules/crm/api/get-lead-activities";
import { useAuthStore } from "@/state/auth-store";

export function useLeadActivities(leadId?: string) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["lead-activities", currentUnitId, leadId],
    queryFn: () => getLeadActivities(leadId!),
    enabled: Boolean(leadId),
  });
}
