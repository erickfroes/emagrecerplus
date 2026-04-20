import { http } from "@/lib/http";
import type { LeadActivityItem } from "@/types/api";

export async function updateLeadActivity(
  leadId: string,
  activityId: string,
  input: {
    activityType?: string;
    description?: string;
    dueAt?: string;
    completed?: boolean;
  }
) {
  return http<LeadActivityItem>(`/leads/${leadId}/activities/${activityId}`, {
    method: "PATCH",
    body: input,
  });
}
