import { http } from "@/lib/http";

export type ClinicalDocumentLegalEvidence = {
  id: string;
  runtimeId: string;
  documentId: string;
  runtimeDocumentId: string;
  documentVersionId: string | null;
  runtimeDocumentVersionId: string | null;
  printableArtifactId: string | null;
  runtimePrintableArtifactId: string | null;
  signatureRequestId: string | null;
  runtimeSignatureRequestId: string | null;
  evidenceStatus: "missing" | "partial" | "complete" | "failed" | "superseded";
  verificationStatus: "not_required" | "pending" | "verified" | "failed";
  providerCode: string | null;
  externalRequestId: string | null;
  externalEnvelopeId: string | null;
  hashAlgorithm: string;
  documentHash: string | null;
  printableArtifactHash: string | null;
  signedArtifactHash: string | null;
  manifestHash: string | null;
  verifiedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  consolidatedAt: string | null;
  document: {
    id?: string;
    documentType?: string;
    status?: string;
    title?: string;
    documentNumber?: string | null;
    issuedAt?: string | null;
    signedAt?: string | null;
  } | null;
  patient: {
    id?: string;
    name?: string;
  } | null;
  professional: {
    id?: string;
    name?: string;
    professionalType?: string;
    licenseNumber?: string | null;
  } | null;
  version: {
    id?: string;
    versionNumber?: number;
    status?: string;
    checksum?: string | null;
    issuedAt?: string | null;
    signedAt?: string | null;
    hasStorageObject?: boolean;
    hasSignedStorageObject?: boolean;
  } | null;
  printableArtifact: {
    id?: string;
    artifactKind?: string;
    renderStatus?: string;
    renderedAt?: string | null;
    checksum?: string | null;
    contentType?: string | null;
    hasStorageObject?: boolean;
    failureReason?: string | null;
  } | null;
  signature: {
    id?: string;
    signerType?: string;
    signerName?: string | null;
    signerEmail?: string | null;
    providerCode?: string | null;
    externalRequestId?: string | null;
    externalEnvelopeId?: string | null;
    requestStatus?: string;
    requestedAt?: string | null;
    expiresAt?: string | null;
    completedAt?: string | null;
  } | null;
  signatories: Array<{
    signatureRequestId?: string | null;
    signerType?: string | null;
    name?: string | null;
    email?: string | null;
    providerCode?: string | null;
    status?: string | null;
    requestedAt?: string | null;
    completedAt?: string | null;
  }>;
  provider: {
    providerCode?: string | null;
    externalRequestId?: string | null;
    externalEnvelopeId?: string | null;
    latestDispatchStatus?: string | null;
    latestDispatchAt?: string | null;
    latestDispatchCompletedAt?: string | null;
    idempotencyKey?: string | null;
  } | null;
  hashes: {
    algorithm?: string;
    documentHash?: string | null;
    printableArtifactHash?: string | null;
    signedArtifactHash?: string | null;
    manifestHash?: string | null;
  } | null;
  events: {
    signature: Array<{
      id?: string;
      signatureRequestId?: string | null;
      eventType?: string;
      source?: string;
      externalEventId?: string | null;
      eventAt?: string | null;
      createdAt?: string | null;
    }>;
    dispatch: Array<{
      id?: string;
      signatureRequestId?: string | null;
      providerCode?: string;
      dispatchStatus?: string;
      externalRequestId?: string | null;
      idempotencyKey?: string | null;
      attemptedAt?: string | null;
      completedAt?: string | null;
      errorMessage?: string | null;
    }>;
  };
  timestamps: Record<string, string | null | undefined> | null;
  statusReasons: string[];
  accessAudit: Array<{
    id?: string;
    accessAction?: string;
    accessStatus?: string;
    targetKind?: string;
    artifactKind?: string | null;
    signedUrlExpiresAt?: string | null;
    createdAt?: string | null;
    actor?: {
      name?: string | null;
      email?: string | null;
    } | null;
  }>;
  evidenceAccessAudit: Array<{
    id?: string;
    eventType?: string;
    action?: string | null;
    createdAt?: string | null;
    actorType?: string | null;
    actor?: {
      name?: string | null;
      email?: string | null;
    } | null;
  }>;
  accessAuditSummary: {
    eventCount?: number;
    capturedAt?: string | null;
  } | null;
  providerContract: {
    realProviderImplemented?: boolean;
    expectedVerificationFields?: string[];
  } | null;
  evidencePackage?: ClinicalDocumentEvidencePackage | null;
  providerReadiness?: ClinicalDocumentSignatureProviderReadiness | null;
};

export type ClinicalDocumentSignatureProviderReadiness = {
  documentId: string;
  runtimeDocumentId: string;
  signatureRequestId: string | null;
  runtimeSignatureRequestId: string | null;
  providerCode: string | null;
  providerMode: string | null;
  adapterCode: string | null;
  providerStatus: string | null;
  externalDocumentId: string | null;
  externalEnvelopeId: string | null;
  providerEventHash: string | null;
  rawEventHash: string | null;
  providerPayloadHash: string | null;
  hmacStrategy: string | null;
  hmacValid: boolean;
  verificationMethod: string | null;
  verificationStatus: string | null;
  verificationFailureReason: string | null;
  verifiedAt: string | null;
  providerRealAdapterImplemented: boolean;
  credentialsPending: boolean;
  latestDispatch: Record<string, unknown> | null;
  latestEvent: Record<string, unknown> | null;
};

export type ClinicalDocumentEvidencePackage = {
  id: string | null;
  runtimeId: string | null;
  documentId: string;
  runtimeDocumentId: string;
  evidenceId: string | null;
  runtimeEvidenceId: string | null;
  packageKind: string;
  packageStatus: "not_generated" | "generating" | "generated" | "failed" | "superseded";
  contentType: string | null;
  fileName: string | null;
  checksum: string | null;
  byteSize: number | null;
  generatedAt: string | null;
  failedAt: string | null;
  failureReason: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  events: Array<{
    id?: string;
    eventAction?: string;
    eventStatus?: string;
    signedUrlExpiresAt?: string | null;
    createdAt?: string | null;
    actor?: {
      name?: string | null;
      email?: string | null;
    } | null;
  }>;
};

export async function getClinicalDocumentEvidence(documentId: string) {
  return http<ClinicalDocumentLegalEvidence>(`/documents/${encodeURIComponent(documentId)}/evidence`);
}
