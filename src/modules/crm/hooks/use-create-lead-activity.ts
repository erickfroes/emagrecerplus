"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLeadActivity } from "@/modules/crm/api/create-lead-activity";

export function useCreateLeadActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      activityType,
      description,
      dueAt,
    }: {
      leadId: string;
      activityType: string;
      description?: string;
      dueAt?: string;
    }) => createLeadActivity(leadId, { activityType, description, dueAt }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["lead-activities", variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
