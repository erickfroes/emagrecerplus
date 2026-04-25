import { http } from "@/lib/http";
import type { StartEncounterResponse } from "@/types/api";

export async function startEncounter(id: string) {
  return http<StartEncounterResponse>(`/appointments/${id}/start-encounter`, {
    method: "PATCH",
  });
}
