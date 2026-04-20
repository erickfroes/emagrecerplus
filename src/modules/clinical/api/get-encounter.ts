import { http } from "@/lib/http";
import type { EncounterDetailsResponse } from "@/types/api";

export async function getEncounter(id: string) {
  return http<EncounterDetailsResponse>(`/encounters/${id}`);
}