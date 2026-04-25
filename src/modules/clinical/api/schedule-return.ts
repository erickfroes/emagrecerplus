import { http } from "@/lib/http";
import type { ScheduleReturnResponse } from "@/types/api";

export async function scheduleReturn(
  id: string,
  body: {
    startsAt: string;
    endsAt?: string;
    notes?: string;
  }
) {
  return http<ScheduleReturnResponse>(`/encounters/${id}/schedule-return`, {
    method: "POST",
    body,
  });
}
