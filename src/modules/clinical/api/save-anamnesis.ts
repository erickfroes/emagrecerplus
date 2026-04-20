import { http } from "@/lib/http";
import type { AnamnesisFormValues } from "@/modules/clinical/schemas/anamnesis.schema";

export async function saveAnamnesis(encounterId: string, values: AnamnesisFormValues) {
  return http<{
    chiefComplaint?: string | null;
    historyOfPresentIllness?: string | null;
    pastMedicalHistory?: string | null;
    lifestyleHistory?: string | null;
    notes?: string | null;
  }>(`/encounters/${encounterId}/anamnesis`, {
    method: "PATCH",
    body: values,
  });
}