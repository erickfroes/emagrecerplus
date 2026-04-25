import { http } from "@/lib/http";
import type { EncounterDetailsResponse as BaseEncounterDetailsResponse } from "@/types/api";
import type { EncounterDocumentRecord, PrescriptionRecord } from "@/modules/clinical/types";

export type EncounterDetailsResponse = Omit<BaseEncounterDetailsResponse, "prescriptions"> & {
  prescriptions: PrescriptionRecord[];
  documents: EncounterDocumentRecord[];
};

export async function getEncounter(id: string) {
  return http<EncounterDetailsResponse>(`/encounters/${id}`);
}
