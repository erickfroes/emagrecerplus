import { http } from "@/lib/http";

export type ClinicalDocumentListItem = {
  id: string;
  runtimeId: string;
  documentType: string;
  status: string;
  title: string;
  summary: string | null;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  signedAt: string | null;
  patient: {
    id: string;
    runtimeId: string;
    name: string;
  } | null;
  encounterId: string | null;
  currentVersion: {
    id: string;
    runtimeId: string;
    versionNumber: number;
    status: string;
    title: string;
    issuedAt: string | null;
    signedAt: string | null;
    hasStorageObject: boolean;
  } | null;
  printableArtifacts: Array<{
    id: string;
    runtimeId: string;
    artifactKind: string;
    renderStatus: string;
    renderedAt: string | null;
    hasStorageObject: boolean;
  }>;
  signatureRequests: Array<{
    id: string;
    runtimeId: string;
    signerType: string;
    providerCode: string;
    requestStatus: string;
    requestedAt: string | null;
    completedAt: string | null;
  }>;
};

export type ClinicalDocumentListResponse = {
  items: ClinicalDocumentListItem[];
  total: number;
  limit: number;
  offset: number;
};

export type ClinicalDocumentListParams = {
  patientId?: string;
  status?: string;
  documentType?: string;
  limit?: number;
  offset?: number;
};

export async function listClinicalDocuments(params: ClinicalDocumentListParams = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  }

  const query = searchParams.toString();

  return http<ClinicalDocumentListResponse>(`/documents${query ? `?${query}` : ""}`);
}
