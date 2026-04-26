import { http } from "@/lib/http";
import type { ClinicalDocumentEvidencePackage } from "./get-document-evidence";

export type ClinicalDocumentEvidencePackageAccessLink = {
  documentId: string;
  generatedAt: string;
  expiresAt: string;
  package: ClinicalDocumentEvidencePackage;
  download: {
    downloadUrl: string;
    expiresAt: string;
    fileName: string;
    label: string;
  };
};

export async function createDocumentEvidencePackageAccessLink(documentId: string) {
  return http<ClinicalDocumentEvidencePackageAccessLink>(
    `/documents/${encodeURIComponent(documentId)}/evidence-package/access-link`,
    {
      method: "POST",
    }
  );
}
