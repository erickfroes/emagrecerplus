"use client";

import { useQuery } from "@tanstack/react-query";
import { getLeadActivities } from "@/modules/crm/api/get-lead-activities";

export function useLeadActivities(leadId?: string) {
  return useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: () => getLeadActivities(leadId!),
    enabled: Boolean(leadId),
  });
}
