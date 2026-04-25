import { http } from "@/lib/http";
import type { CompleteEncounterResponse } from "@/types/api";

export async function completeEncounter(id: string) {
  return http<CompleteEncounterResponse>(`/encounters/${id}/complete`, {
    method: "PATCH",
  });
}
