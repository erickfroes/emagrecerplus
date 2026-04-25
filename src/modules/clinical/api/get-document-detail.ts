import { http } from "@/lib/http";

export type ClinicalDocumentDetail = {
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
  encounter: {
    id: string;
    runtimeId: string;
    encounterType: string;
    status: string;
    openedAt: string | null;
    closedAt: string | null;
  } | null;
  template: {
    id: string;
    title: string;
    templateKind: string;
    status: string;
  } | null;
  author: {
    runtimeId: string;
    name: string;
    email: string | null;
  } | null;
  professional: {
    id: string;
    runtimeId: string;
    name: string;
    professionalType: string;
    licenseNumber: string | null;
  } | null;
  currentVersion: {
    id: string;
    runtimeId: string;
    versionNumber: number;
    status: string;
    title: string;
    summary: string | null;
    issuedAt: string | null;
    signedAt: string | null;
    checksum: string | null;
    hasStorageObject: boolean;
  } | null;
  printableArtifacts: Array<{
    id: string;
    runtimeId: string;
    artifactKind: string;
    renderStatus: string;
    renderedAt: string | null;
    failureReason: string | null;
    checksum: string | null;
    hasStorageObject: boolean;
  }>;
  signatureRequests: Array<{
    id: string;
    runtimeId: string;
    signerType: string;
    signerName: string | null;
    signerEmail: string | null;
    providerCode: string;
    externalRequestId: string | null;
    requestStatus: string;
    requestedAt: string | null;
    expiresAt: string | null;
    completedAt: string | null;
    latestDispatch: {
      id: string;
      providerCode: string;
      dispatchStatus: string;
      externalRequestId: string | null;
      attemptedAt: string | null;
      completedAt: string | null;
      errorMessage: string | null;
    } | null;
  }>;
  signatureEvents: Array<{
    id: string;
    runtimeId: string;
    signatureRequestId: string | null;
    eventType: string;
    source: string;
    externalEventId: string | null;
    eventAt: string | null;
    createdAt: string | null;
  }>;
  dispatchEvents: Array<{
    id: string;
    signatureRequestId: string | null;
    providerCode: string;
    dispatchStatus: string;
    externalRequestId: string | null;
    attemptedAt: string | null;
    completedAt: string | null;
    errorMessage: string | null;
  }>;
  prescriptions: Array<{
    id: string;
    runtimeId: string;
    prescriptionType: string;
    summary: string | null;
    issuedAt: string | null;
  }>;
  accessEvents: Array<{
    id: string;
    runtimeId: string;
    accessAction: string;
    accessStatus: string;
    targetKind: string;
    artifactKind: string | null;
    signedUrlExpiresAt: string | null;
    createdAt: string | null;
    actor: {
      runtimeId: string;
      name: string;
      email: string | null;
    } | null;
  }>;
};

export async function getClinicalDocumentDetail(documentId: string) {
  return http<ClinicalDocumentDetail>(`/documents/${encodeURIComponent(documentId)}`);
}
