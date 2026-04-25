import { supabaseAdmin } from "../../lib/supabase-admin.ts";

export type RuntimeDocumentTemplate = {
  id: string;
  title: string;
  description: string | null;
  templateKind: string;
  templateScope: string;
  status: string;
  currentVersion: {
    id: string;
    runtimeId: string;
    versionNumber: number;
    status: string;
    title: string;
    summary: string | null;
    content: Record<string, unknown>;
    renderSchema: Record<string, unknown>;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    publishedAt: string | null;
  } | null;
};

export type RuntimeEncounterDocument = {
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
  template: {
    id: string;
    title: string;
    templateKind: string;
    status: string;
  } | null;
  currentVersion: {
    id: string;
    runtimeId: string;
    versionNumber: number;
    status: string;
    title: string;
    summary: string | null;
    content: Record<string, unknown>;
    renderedHtml: string | null;
    storageObjectPath: string | null;
    signedStorageObjectPath: string | null;
    issuedAt: string | null;
    signedAt: string | null;
  } | null;
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
  printableArtifacts: Array<{
    id: string;
    runtimeId: string;
    artifactKind: string;
    renderStatus: string;
    storageObjectPath: string | null;
    renderedAt: string | null;
    failureReason: string | null;
  }>;
};

export type IssueRuntimeEncounterDocumentInput = {
  legacyTenantId: string;
  legacyEncounterId: string;
  legacyUnitId?: string | null;
  documentTemplateId?: string | null;
  documentType?: string | null;
  title?: string | null;
  summary?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  content?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  legacyCreatedByUserId?: string | null;
};

export type GetRuntimeEncounterDocumentSnapshotInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
};

export type CreateRuntimeDocumentSignatureRequestInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
  signerType?: string | null;
  signerName?: string | null;
  signerEmail?: string | null;
  providerCode?: string | null;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
  legacyCreatedByUserId?: string | null;
};

export type DispatchRuntimeDocumentSignatureRequestInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
  signatureRequestId: string;
  providerCode?: string | null;
};

export type CreateRuntimeDocumentPrintableArtifactInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
  artifactKind?: string | null;
  metadata?: Record<string, unknown>;
  legacyCreatedByUserId?: string | null;
};

export type ListRuntimeAccessiblePatientDocumentsInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  patientId?: string | null;
  status?: string | null;
  documentType?: string | null;
  limit?: number | null;
  offset?: number | null;
};

export type RuntimeAccessiblePatientDocument = {
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

export type RuntimeAccessiblePatientDocumentList = {
  items: RuntimeAccessiblePatientDocument[];
  total: number;
  limit: number;
  offset: number;
};

export type PrepareRuntimeDocumentAccessInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
  artifactReference?: string | null;
};

export type RuntimeDocumentAccessTarget = {
  id: string;
  runtimeId: string;
  targetKind: "document_version" | "printable_artifact";
  documentId: string;
  runtimeDocumentId: string;
  documentVersionId: string | null;
  runtimeDocumentVersionId: string | null;
  printableArtifactId: string | null;
  runtimePrintableArtifactId: string | null;
  artifactKind: string;
  renderStatus: string | null;
  documentTitle: string;
  documentType: string;
  storageBucket: string;
  storageObjectPath: string;
};

export type RecordRuntimeDocumentAccessEventInput = {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  documentReference: string;
  accessAction: "open" | "download";
  accessStatus?: "granted" | "denied" | "storage_error";
  artifactReference?: string | null;
  documentVersionReference?: string | null;
  signedUrlExpiresAt?: string | null;
  storageBucket?: string | null;
  storageObjectPath?: string | null;
  legacyActorUserId?: string | null;
  metadata?: Record<string, unknown>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asStringOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function parseTemplate(value: unknown): RuntimeDocumentTemplate | null {
  if (!isRecord(value)) {
    return null;
  }

  const currentVersion = isRecord(value.currentVersion)
    ? {
        id: String(value.currentVersion.id ?? ""),
        runtimeId: String(value.currentVersion.runtimeId ?? ""),
        versionNumber: Number(value.currentVersion.versionNumber ?? 0),
        status: String(value.currentVersion.status ?? "draft"),
        title: String(value.currentVersion.title ?? ""),
        summary: asStringOrNull(value.currentVersion.summary),
        content: isRecord(value.currentVersion.content) ? value.currentVersion.content : {},
        renderSchema: isRecord(value.currentVersion.renderSchema)
          ? value.currentVersion.renderSchema
          : {},
        effectiveFrom: asStringOrNull(value.currentVersion.effectiveFrom),
        effectiveTo: asStringOrNull(value.currentVersion.effectiveTo),
        publishedAt: asStringOrNull(value.currentVersion.publishedAt),
      }
    : null;

  return {
    id: String(value.id ?? ""),
    title: String(value.title ?? ""),
    description: asStringOrNull(value.description),
    templateKind: String(value.templateKind ?? "custom"),
    templateScope: String(value.templateScope ?? "tenant"),
    status: String(value.status ?? "draft"),
    currentVersion,
  };
}

export function parseRuntimeEncounterDocument(value: unknown): RuntimeEncounterDocument {
  if (!isRecord(value)) {
    throw new Error("RPC de documento retornou payload invalido.");
  }

  const template = isRecord(value.template)
    ? {
        id: String(value.template.id ?? ""),
        title: String(value.template.title ?? ""),
        templateKind: String(value.template.templateKind ?? "custom"),
        status: String(value.template.status ?? "draft"),
      }
    : null;

  const currentVersion = isRecord(value.currentVersion)
    ? {
        id: String(value.currentVersion.id ?? ""),
        runtimeId: String(value.currentVersion.runtimeId ?? ""),
        versionNumber: Number(value.currentVersion.versionNumber ?? 0),
        status: String(value.currentVersion.status ?? "draft"),
        title: String(value.currentVersion.title ?? ""),
        summary: asStringOrNull(value.currentVersion.summary),
        content: isRecord(value.currentVersion.content) ? value.currentVersion.content : {},
        renderedHtml: asStringOrNull(value.currentVersion.renderedHtml),
        storageObjectPath: asStringOrNull(value.currentVersion.storageObjectPath),
        signedStorageObjectPath: asStringOrNull(value.currentVersion.signedStorageObjectPath),
        issuedAt: asStringOrNull(value.currentVersion.issuedAt),
        signedAt: asStringOrNull(value.currentVersion.signedAt),
      }
    : null;

  return {
    id: String(value.id ?? ""),
    runtimeId: String(value.runtimeId ?? ""),
    documentType: String(value.documentType ?? "custom"),
    status: String(value.status ?? "draft"),
    title: String(value.title ?? ""),
    summary: asStringOrNull(value.summary),
    documentNumber: asStringOrNull(value.documentNumber),
    issuedAt: asStringOrNull(value.issuedAt),
    expiresAt: asStringOrNull(value.expiresAt),
    signedAt: asStringOrNull(value.signedAt),
    template,
    currentVersion,
    signatureRequests: Array.isArray(value.signatureRequests)
      ? value.signatureRequests.filter(isRecord).map((item) => ({
          id: String(item.id ?? ""),
          runtimeId: String(item.runtimeId ?? ""),
          signerType: String(item.signerType ?? "patient"),
          signerName: asStringOrNull(item.signerName),
          signerEmail: asStringOrNull(item.signerEmail),
          providerCode: String(item.providerCode ?? "mock"),
          externalRequestId: asStringOrNull(item.externalRequestId),
          requestStatus: String(item.requestStatus ?? "pending"),
          requestedAt: asStringOrNull(item.requestedAt),
          expiresAt: asStringOrNull(item.expiresAt),
          completedAt: asStringOrNull(item.completedAt),
          latestDispatch: isRecord(item.latestDispatch)
            ? {
                id: String(item.latestDispatch.id ?? ""),
                providerCode: String(item.latestDispatch.providerCode ?? "mock"),
                dispatchStatus: String(item.latestDispatch.dispatchStatus ?? "pending"),
                externalRequestId: asStringOrNull(item.latestDispatch.externalRequestId),
                attemptedAt: asStringOrNull(item.latestDispatch.attemptedAt),
                completedAt: asStringOrNull(item.latestDispatch.completedAt),
                errorMessage: asStringOrNull(item.latestDispatch.errorMessage),
              }
            : null,
        }))
      : [],
    printableArtifacts: Array.isArray(value.printableArtifacts)
      ? value.printableArtifacts.filter(isRecord).map((item) => ({
          id: String(item.id ?? ""),
          runtimeId: String(item.runtimeId ?? ""),
          artifactKind: String(item.artifactKind ?? "preview"),
          renderStatus: String(item.renderStatus ?? "pending"),
          storageObjectPath: asStringOrNull(item.storageObjectPath),
          renderedAt: asStringOrNull(item.renderedAt),
          failureReason: asStringOrNull(item.failureReason),
        }))
      : [],
  };
}

function parseAccessiblePatientDocument(value: unknown): RuntimeAccessiblePatientDocument {
  if (!isRecord(value)) {
    throw new Error("RPC list_accessible_patient_documents retornou item invalido.");
  }

  const patient = isRecord(value.patient)
    ? {
        id: String(value.patient.id ?? ""),
        runtimeId: String(value.patient.runtimeId ?? ""),
        name: String(value.patient.name ?? ""),
      }
    : null;

  const currentVersion = isRecord(value.currentVersion)
    ? {
        id: String(value.currentVersion.id ?? ""),
        runtimeId: String(value.currentVersion.runtimeId ?? ""),
        versionNumber: Number(value.currentVersion.versionNumber ?? 0),
        status: String(value.currentVersion.status ?? "draft"),
        title: String(value.currentVersion.title ?? ""),
        issuedAt: asStringOrNull(value.currentVersion.issuedAt),
        signedAt: asStringOrNull(value.currentVersion.signedAt),
        hasStorageObject: asBoolean(value.currentVersion.hasStorageObject),
      }
    : null;

  return {
    id: String(value.id ?? ""),
    runtimeId: String(value.runtimeId ?? ""),
    documentType: String(value.documentType ?? "custom"),
    status: String(value.status ?? "draft"),
    title: String(value.title ?? ""),
    summary: asStringOrNull(value.summary),
    documentNumber: asStringOrNull(value.documentNumber),
    issuedAt: asStringOrNull(value.issuedAt),
    expiresAt: asStringOrNull(value.expiresAt),
    signedAt: asStringOrNull(value.signedAt),
    patient,
    encounterId: asStringOrNull(value.encounterId),
    currentVersion,
    printableArtifacts: Array.isArray(value.printableArtifacts)
      ? value.printableArtifacts.filter(isRecord).map((item) => ({
          id: String(item.id ?? ""),
          runtimeId: String(item.runtimeId ?? ""),
          artifactKind: String(item.artifactKind ?? "preview"),
          renderStatus: String(item.renderStatus ?? "pending"),
          renderedAt: asStringOrNull(item.renderedAt),
          hasStorageObject: asBoolean(item.hasStorageObject),
        }))
      : [],
    signatureRequests: Array.isArray(value.signatureRequests)
      ? value.signatureRequests.filter(isRecord).map((item) => ({
          id: String(item.id ?? ""),
          runtimeId: String(item.runtimeId ?? ""),
          signerType: String(item.signerType ?? "patient"),
          providerCode: String(item.providerCode ?? "mock"),
          requestStatus: String(item.requestStatus ?? "pending"),
          requestedAt: asStringOrNull(item.requestedAt),
          completedAt: asStringOrNull(item.completedAt),
        }))
      : [],
  };
}

function parseAccessiblePatientDocumentList(
  value: unknown
): RuntimeAccessiblePatientDocumentList {
  if (!isRecord(value)) {
    throw new Error("RPC list_accessible_patient_documents nao retornou objeto valido.");
  }

  return {
    items: Array.isArray(value.items) ? value.items.map(parseAccessiblePatientDocument) : [],
    total: Number(value.total ?? 0),
    limit: Number(value.limit ?? 50),
    offset: Number(value.offset ?? 0),
  };
}

function parseRuntimeDocumentAccessTarget(value: unknown): RuntimeDocumentAccessTarget {
  if (!isRecord(value)) {
    throw new Error("RPC prepare_patient_document_access nao retornou payload valido.");
  }

  const targetKind =
    value.targetKind === "printable_artifact" ? "printable_artifact" : "document_version";
  const storageObjectPath = String(value.storageObjectPath ?? "");

  if (!storageObjectPath) {
    throw new Error("RPC prepare_patient_document_access nao retornou storageObjectPath.");
  }

  return {
    id: String(value.id ?? ""),
    runtimeId: String(value.runtimeId ?? ""),
    targetKind,
    documentId: String(value.documentId ?? ""),
    runtimeDocumentId: String(value.runtimeDocumentId ?? ""),
    documentVersionId: asStringOrNull(value.documentVersionId),
    runtimeDocumentVersionId: asStringOrNull(value.runtimeDocumentVersionId),
    printableArtifactId: asStringOrNull(value.printableArtifactId),
    runtimePrintableArtifactId: asStringOrNull(value.runtimePrintableArtifactId),
    artifactKind: String(value.artifactKind ?? targetKind),
    renderStatus: asStringOrNull(value.renderStatus),
    documentTitle: String(value.documentTitle ?? "Documento"),
    documentType: String(value.documentType ?? "custom"),
    storageBucket: String(value.storageBucket ?? "patient-documents"),
    storageObjectPath,
  };
}

export async function listRuntimeDocumentTemplates(params: {
  legacyTenantId: string;
  legacyUnitId?: string | null;
  templateKind?: string | null;
}): Promise<RuntimeDocumentTemplate[]> {
  const { data, error } = await supabaseAdmin.rpc("list_document_templates", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_unit_id: params.legacyUnitId ?? null,
    p_template_kind: params.templateKind ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC list_document_templates: ${error.message}`);
  }

  if (!Array.isArray(data)) {
    throw new Error("RPC list_document_templates nao retornou uma lista valida.");
  }

  return data.map(parseTemplate).filter((item): item is RuntimeDocumentTemplate => Boolean(item));
}

export async function listRuntimeAccessiblePatientDocuments(
  params: ListRuntimeAccessiblePatientDocumentsInput
): Promise<RuntimeAccessiblePatientDocumentList> {
  const { data, error } = await supabaseAdmin.rpc("list_accessible_patient_documents", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_unit_id: params.legacyUnitId ?? null,
    p_patient_id: params.patientId ?? null,
    p_status: params.status ?? null,
    p_document_type: params.documentType ?? null,
    p_limit: params.limit ?? 50,
    p_offset: params.offset ?? 0,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC list_accessible_patient_documents: ${error.message}`);
  }

  return parseAccessiblePatientDocumentList(data);
}

export async function prepareRuntimeDocumentAccess(
  params: PrepareRuntimeDocumentAccessInput
): Promise<RuntimeDocumentAccessTarget> {
  const { data, error } = await supabaseAdmin.rpc("prepare_patient_document_access", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_document_id: params.documentReference,
    p_artifact_id: params.artifactReference ?? null,
    p_legacy_unit_id: params.legacyUnitId ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC prepare_patient_document_access: ${error.message}`);
  }

  return parseRuntimeDocumentAccessTarget(data);
}

export async function recordRuntimeDocumentAccessEvent(
  params: RecordRuntimeDocumentAccessEventInput
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("record_patient_document_access_event", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_document_id: params.documentReference,
    p_access_action: params.accessAction,
    p_access_status: params.accessStatus ?? "granted",
    p_artifact_id: params.artifactReference ?? null,
    p_document_version_id: params.documentVersionReference ?? null,
    p_legacy_unit_id: params.legacyUnitId ?? null,
    p_signed_url_expires_at: params.signedUrlExpiresAt ?? null,
    p_storage_bucket: params.storageBucket ?? "patient-documents",
    p_storage_object_path: params.storageObjectPath ?? null,
    p_legacy_actor_user_id: params.legacyActorUserId ?? null,
    p_request_metadata: params.metadata ?? {},
  });

  if (error) {
    throw new Error(`Falha ao executar RPC record_patient_document_access_event: ${error.message}`);
  }
}

export async function getRuntimeEncounterDocumentSnapshot(
  params: GetRuntimeEncounterDocumentSnapshotInput
): Promise<RuntimeEncounterDocument> {
  const { data, error } = await supabaseAdmin.rpc("get_patient_document_snapshot", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_document_id: params.documentReference,
    p_legacy_unit_id: params.legacyUnitId ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC get_patient_document_snapshot: ${error.message}`);
  }

  return parseRuntimeEncounterDocument(data);
}

export async function issueRuntimeEncounterDocument(
  params: IssueRuntimeEncounterDocumentInput
): Promise<RuntimeEncounterDocument> {
  const { data, error } = await supabaseAdmin.rpc("issue_document_for_encounter", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_legacy_encounter_id: params.legacyEncounterId,
    p_legacy_unit_id: params.legacyUnitId ?? null,
    p_document_template_id: params.documentTemplateId ?? null,
    p_document_type: params.documentType ?? null,
    p_title: params.title ?? null,
    p_summary: params.summary ?? null,
    p_issued_at: params.issuedAt ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_content: params.content ?? {},
    p_metadata: params.metadata ?? {},
    p_legacy_created_by_user_id: params.legacyCreatedByUserId ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC issue_document_for_encounter: ${error.message}`);
  }

  return parseRuntimeEncounterDocument(data);
}

export async function createRuntimeDocumentSignatureRequest(
  params: CreateRuntimeDocumentSignatureRequestInput
): Promise<RuntimeEncounterDocument> {
  const { data, error } = await supabaseAdmin.rpc("create_document_signature_request", {
    p_legacy_tenant_id: params.legacyTenantId,
    p_document_id: params.documentReference,
    p_legacy_unit_id: params.legacyUnitId ?? null,
    p_signer_type: params.signerType ?? null,
    p_signer_name: params.signerName ?? null,
    p_signer_email: params.signerEmail ?? null,
    p_provider_code: params.providerCode ?? null,
    p_expires_at: params.expiresAt ?? null,
    p_metadata: params.metadata ?? {},
    p_legacy_requested_by_user_id: params.legacyCreatedByUserId ?? null,
  });

  if (error) {
    throw new Error(`Falha ao executar RPC create_document_signature_request: ${error.message}`);
  }

  return parseRuntimeEncounterDocument(data);
}

export async function dispatchRuntimeDocumentSignatureRequest(
  params: DispatchRuntimeDocumentSignatureRequestInput
): Promise<RuntimeEncounterDocument> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL nao definida para invocar document-signature-dispatch.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao definida para invocar document-signature-dispatch.");
  }

  const response = await fetch(
    `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/document-signature-dispatch`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        legacyTenantId: params.legacyTenantId,
        documentId: params.documentReference,
        signatureRequestId: params.signatureRequestId,
        legacyUnitId: params.legacyUnitId ?? null,
        providerCode: params.providerCode ?? null,
      }),
    }
  );

  const payload = await response.json().catch(() => null);

  if (payload && typeof payload === "object" && "document" in payload) {
    return parseRuntimeEncounterDocument((payload as { document: unknown }).document);
  }

  if (!response.ok) {
    const details =
      payload && typeof payload === "object" && "details" in payload
        ? String((payload as Record<string, unknown>).details ?? "")
        : "";
    throw new Error(
      `Falha ao invocar Edge Function document-signature-dispatch: ${response.status} ${details}`.trim()
    );
  }

  throw new Error("Edge Function document-signature-dispatch nao retornou um payload valido.");
}

export async function createRuntimeDocumentPrintableArtifact(
  params: CreateRuntimeDocumentPrintableArtifactInput
): Promise<RuntimeEncounterDocument> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL nao definida para invocar document-printable.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY nao definida para invocar document-printable.");
  }

  const response = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/functions/v1/document-printable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      legacyTenantId: params.legacyTenantId,
      documentId: params.documentReference,
      legacyUnitId: params.legacyUnitId ?? null,
      artifactKind: params.artifactKind ?? "html",
      legacyCreatedByUserId: params.legacyCreatedByUserId ?? null,
    }),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const details =
      payload && typeof payload === "object" && "details" in payload
        ? String((payload as Record<string, unknown>).details ?? "")
        : "";
    throw new Error(
      `Falha ao invocar Edge Function document-printable: ${response.status} ${details}`.trim()
    );
  }

  if (!payload || typeof payload !== "object" || !("document" in payload)) {
    throw new Error("Edge Function document-printable nao retornou um payload valido.");
  }

  return parseRuntimeEncounterDocument((payload as { document: unknown }).document);
}
