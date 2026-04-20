import { http } from "@/lib/http";
import type { LeadActivitiesResponse } from "@/types/api";

export async function getLeadActivities(leadId: string) {
  return http<LeadActivitiesResponse>(`/leads/${leadId}/activities`);
}
