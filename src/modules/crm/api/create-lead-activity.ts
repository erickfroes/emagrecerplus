import { http } from "@/lib/http";
import type { LeadActivityItem } from "@/types/api";

export async function createLeadActivity(
  leadId: string,
  input: {
    activityType: string;
    description?: string;
    dueAt?: string;
  }
) {
  return http<LeadActivityItem>(`/leads/${leadId}/activities`, {
    method: "POST",
    body: input,
  });
}
