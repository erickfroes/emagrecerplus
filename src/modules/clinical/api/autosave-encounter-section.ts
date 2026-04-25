import { http } from "@/lib/http";

export async function autosaveEncounterSection(
  encounterId: string,
  body:
    | {
        section: "anamnesis";
        savedAt?: string;
        chiefComplaint?: string;
        historyOfPresentIllness?: string;
        pastMedicalHistory?: string;
        lifestyleHistory?: string;
        notes?: string;
      }
    | {
        section: "soap_draft";
        savedAt?: string;
        subjective?: string;
        objective?: string;
        assessment?: string;
        plan?: string;
      }
) {
  return http<{
    section: "anamnesis" | "soap_draft";
    encounterId: string;
    legacyEncounterId: string;
    savedAt: string;
    source: string;
  }>(`/encounters/${encounterId}/autosave-section`, {
    method: "PATCH",
    body,
  });
}
