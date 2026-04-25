import { http } from "@/lib/http";
import type { EnqueuePatientResponse } from "@/types/api";

export async function enqueuePatient(id: string) {
  return http<EnqueuePatientResponse>(`/appointments/${id}/enqueue`, {
    method: "PATCH",
  });
}
