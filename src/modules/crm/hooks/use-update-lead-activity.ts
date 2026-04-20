"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateLeadActivity } from "@/modules/crm/api/update-lead-activity";

export function useUpdateLeadActivity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      activityId,
      activityType,
      description,
      dueAt,
      completed,
    }: {
      leadId: string;
      activityId: string;
      activityType?: string;
      description?: string;
      dueAt?: string;
      completed?: boolean;
    }) => updateLeadActivity(leadId, activityId, { activityType, description, dueAt, completed }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["lead-activities", variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ["leads-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
