import { http } from "@/lib/http";
import type { EncounterDocumentRecord } from "@/modules/clinical/types";

export type CreateDocumentSignatureRequestInput = {
  signerType?: string;
  signerName?: string;
  signerEmail?: string;
  providerCode?: string;
  expiresAt?: string;
};

export async function createDocumentSignatureRequest(
  documentId: string,
  input: CreateDocumentSignatureRequestInput
) {
  return http<EncounterDocumentRecord>(`/documents/${documentId}/signature-requests`, {
    method: "POST",
    body: input,
  });
}
