export type ClinicalTaskItem = {
  id: string;
  title: string;
  patient: string;
  priority: "Alta" | "Media" | "Baixa";
  owner: string;
  dueDate: string;
  status: "Aberta" | "Em andamento" | "Concluida";
};

export type EncounterStep = {
  id: string;
  label: string;
  done: boolean;
  state?: "pending" | "in_progress" | "completed" | "locked";
  summary?: string;
};

export type DocumentTemplateRecord = {
  id: string;
  title: string;
  templateKind: string;
  templateScope?: string;
  description?: string | null;
  status: string;
  summary?: string | null;
  currentVersion?: {
    id: string;
    runtimeId?: string;
    versionNumber: number;
    title?: string;
    status?: string | null;
    summary?: string | null;
    content?: Record<string, unknown>;
    renderSchema?: Record<string, unknown>;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    publishedAt?: string | null;
  } | null;
};

export type EncounterDocumentRecord = {
  id: string;
  runtimeId?: string;
  documentType: string;
  title: string;
  summary: string | null;
  status: string;
  issuedAt: string | null;
  expiresAt?: string | null;
  signedAt: string | null;
  documentNumber: string | null;
  template?: {
    id: string;
    title: string;
    templateKind: string;
    status: string;
  } | null;
  currentVersion?: {
    id: string;
    versionNumber: number;
    status: string;
    title?: string;
    summary?: string | null;
    content?: Record<string, unknown>;
    renderedHtml?: string | null;
    storageObjectPath?: string | null;
    signedStorageObjectPath?: string | null;
  } | null;
  signatureRequests?: Array<{
    id: string;
    runtimeId?: string;
    signerType: string;
    signerName?: string | null;
    signerEmail?: string | null;
    providerCode?: string | null;
    externalRequestId?: string | null;
    requestStatus: string;
    requestedAt: string | null;
    expiresAt?: string | null;
    completedAt?: string | null;
    latestDispatch?: {
      id: string;
      providerCode: string;
      dispatchStatus: string;
      externalRequestId?: string | null;
      attemptedAt?: string | null;
      completedAt?: string | null;
      errorMessage?: string | null;
    } | null;
  }>;
  printableArtifacts?: Array<{
    id: string;
    runtimeId?: string;
    artifactKind: string;
    renderStatus: string;
    renderedAt?: string | null;
    storageObjectPath?: string | null;
    failureReason?: string | null;
  }>;
};

export type EncounterDetail = {
  id: string;
  patientName: string;
  professional: string;
  typeLabel: string;
  scheduledTime: string;
  status: "Em andamento" | "Encerrado";
  steps: EncounterStep[];
  anamnesis: {
    chiefComplaint: string;
    history: string;
    background: string;
    surgeryHistory: string;
    familyHistory: string;
    medications: string;
    allergies: string;
    lifestyle: string;
    notes: string;
  };
  soap: {
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
  carePlan: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string;
  }>;
  documents: EncounterDocumentRecord[];
  tasks: Array<{
    id: string;
    title: string;
    priority: "Alta" | "Media" | "Baixa";
    owner: string;
    dueDate: string;
  }>;
  goals: Array<{
    id: string;
    type: string;
    title: string;
    targetValue: string;
    dueDate: string;
  }>;
  prescriptions: Array<{
    id: string;
    prescriptionType: string;
    summary: string | null;
    issuedAt: string;
    items: Array<{
      id: string;
      itemType: string;
      title: string;
      dosage?: string | null;
      frequency?: string | null;
      route?: string | null;
      durationDays?: number | null;
      quantity?: number | null;
      unit?: string | null;
      instructions?: string | null;
      position?: number | null;
    }>;
  }>;
  adverseEvents: Array<{
    id: string;
    severity: string;
    type: string;
    description: string;
    status: string;
  }>;
};

export type PrescriptionRecord = EncounterDetail["prescriptions"][number];

export type PrescriptionRecordItem = PrescriptionRecord["items"][number];
