import { http } from "@/lib/http";

export type EncounterDocumentAccessLink = {
  id: string;
  artifactKind: string | null;
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
  label: string;
  openUrl: string;
  renderStatus: string | null;
  storageObjectPath: string;
};

export type EncounterDocumentAccessLinksResponse = {
  documentId: string;
  generatedAt: string;
  expiresAt: string;
  currentVersion: EncounterDocumentAccessLink | null;
  artifacts: EncounterDocumentAccessLink[];
};

export async function getDocumentAccessLinks(documentId: string) {
  return http<EncounterDocumentAccessLinksResponse>(
    `/documents/${encodeURIComponent(documentId)}/access-links`
  );
}
