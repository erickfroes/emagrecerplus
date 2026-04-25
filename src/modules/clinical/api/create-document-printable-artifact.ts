import { http } from "@/lib/http";
import type { EncounterDocumentRecord } from "@/modules/clinical/types";

export type CreateDocumentPrintableArtifactInput = {
  artifactKind?: string;
};

export async function createDocumentPrintableArtifact(
  documentId: string,
  input: CreateDocumentPrintableArtifactInput
) {
  return http<EncounterDocumentRecord>(`/documents/${documentId}/printable-artifacts`, {
    method: "POST",
    body: input,
  });
}
