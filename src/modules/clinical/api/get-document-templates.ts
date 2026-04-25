import { http } from "@/lib/http";
import type { DocumentTemplateRecord } from "@/modules/clinical/types";

export async function getDocumentTemplates(kind?: string | null) {
  const query = kind && kind !== "all" ? `?kind=${encodeURIComponent(kind)}` : "";
  return http<DocumentTemplateRecord[]>(`/document-templates${query}`);
}
