import { http } from "@/lib/http";
import type { SoapNoteFormValues } from "@/modules/clinical/schemas/soap-note.schema";

export async function saveSoapNote(encounterId: string, values: SoapNoteFormValues) {
  return http<{
    id: string;
    noteType?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    signedAt?: string | null;
  }>(`/encounters/${encounterId}/soap-note`, {
    method: "PATCH",
    body: values,
  });
}