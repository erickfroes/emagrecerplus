import { http } from "@/lib/http";
import type { EncounterDocumentRecord } from "@/modules/clinical/types";

export type CreateDocumentRecordInput = {
  documentType: string;
  templateId?: string;
  title: string;
  summary?: string;
  issuedAt?: string;
  expiresAt?: string;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

export async function createDocumentRecord(encounterId: string, input: CreateDocumentRecordInput) {
  return http<EncounterDocumentRecord>(`/encounters/${encounterId}/documents`, {
    method: "POST",
    body: input,
  });
}
