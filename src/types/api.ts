export type ApiMeta = {
  page: number;
  pageSize: number;
  total: number;
  query?: string;
};

export type ApiListResponse<T> = {
  data: T[];
  meta: ApiMeta;
};

export type ApiDetailResponse<T> = {
  data: T;
};

export type DashboardSummaryResponse = {
  stats: {
    scheduledToday: number;
    completedToday: number;
    noShows7d: number;
    openLeads: number;
    openClinicalTasks: number;
  };
  todayAppointments: Array<{
    id: string;
    time: string;
    patient: string;
    type: string;
    professional: string;
    status: "scheduled" | "confirmed" | "completed" | "no_show";
  }>;
  alerts: Array<{
    id: string;
    title: string;
    description: string;
  }>;
  pipeline: Array<{
    code: string;
    title: string;
    count: number;
  }>;
};

export type PatientListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  status: string;
  tags: string[];
  flags: string[];
  lastConsultation: string | null;
  nextAppointment: string | null;
};

export type PatientsListResponse = {
  items: PatientListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type PatientTimelineItem = {
  id: string;
  type: "consulta" | "anamnese" | "soap" | "prescricao" | "evento";
  title: string;
  description: string;
  dateLabel: string;
};

export type PatientCarePlanItem = {
  id: string;
  title: string;
  status: string;
  dueDate: string;
};

export type PatientTaskListItem = {
  id: string;
  title: string;
  priority: "Alta" | "Media" | "Baixa";
  status: "Aberta" | "Em andamento" | "Concluida";
  dueDate: string;
  owner: string;
};

export type PatientHabitCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
  trend: "up" | "down" | "stable";
};

export type PatientCommercialLeadContext = {
  leadId: string;
  leadName: string | null;
  leadStatus: string | null;
  stageCode: string | null;
  stageName: string | null;
  convertedAt: string | null;
  source: string | null;
  interestType: string | null;
  lastCommercialTouchAt: string | null;
};

export type PatientCommercialEnrollment = {
  id: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  enrolledAt: string | null;
  activatedAt: string | null;
  source: string | null;
  notes: string | null;
};

export type PatientCommercialProgram = {
  id: string;
  name: string;
  code: string;
  programType: string | null;
  durationDays: number | null;
};

export type PatientCommercialPackage = {
  id: string;
  name: string;
  code: string;
  tier: string | null;
  billingModel: string | null;
  price: number | null;
  currencyCode: string | null;
};

export type PatientCommercialEntitlement = {
  id: string;
  code: string;
  title: string;
  entitlementType: string;
  balanceTotal: number;
  balanceUsed: number;
  balanceRemaining: number;
  active: boolean;
  serviceId: string | null;
  serviceName: string | null;
  endsAt: string | null;
};

export type PatientCommercialBenefits = {
  tier: string;
  allowsCommunity: boolean;
  chatPriority: boolean;
};

export type PatientCommercialVigency = {
  startDate: string | null;
  endDate: string | null;
  renewalRisk: "none" | "medium" | "high" | "expired";
};

export type PatientCommercialEligibility = {
  hasActiveEnrollment: boolean;
  hasCompletedPackage: boolean;
  canRequestUpgrade: boolean;
};

export type PatientCommercialFinancialSummary = {
  pendingCount: number;
  overdueCount: number;
  pendingAmount: number;
  overdueAmount: number;
  nextDueDate: string | null;
  lastEventAt: string | null;
  currencyCode: string;
};

export type PatientCommercialContext = {
  hasCommercialContext: boolean;
  lead: PatientCommercialLeadContext | null;
  enrollment?: PatientCommercialEnrollment | null;
  program?: PatientCommercialProgram | null;
  package?: PatientCommercialPackage | null;
  entitlements?: PatientCommercialEntitlement[];
  benefits?: PatientCommercialBenefits | null;
  vigency?: PatientCommercialVigency | null;
  eligibility?: PatientCommercialEligibility | null;
  financialSummary?: PatientCommercialFinancialSummary | null;
};

export type PatientNutritionTarget = {
  id: string;
  runtimeId: string | null;
  type: string;
  code: string | null;
  label: string;
  goalValue: number | null;
  unit: string | null;
  period: string;
  mealType: string | null;
  guidance: string | null;
  position: number;
  active: boolean;
};

export type PatientNutritionPlan = {
  id: string;
  runtimeId: string | null;
  status: string;
  name: string;
  summary: string | null;
  startsAt: string | null;
  endsAt: string | null;
  currentVersion: {
    id: string;
    runtimeId: string | null;
    versionNumber: number;
    status: string;
    title: string;
    summary: string | null;
    guidance: string | null;
    mealGoalDaily: number | null;
    waterGoalMl: number | null;
    effectiveFrom: string;
    effectiveTo: string | null;
    publishedAt: string | null;
  } | null;
  targets: PatientNutritionTarget[];
};

export type PatientDetailsResponse = {
  id: string;
  name: string;
  age: number;
  email: string | null;
  phone: string | null;
  tags: string[];
  flags: string[];
  summary: {
    mainGoal?: string | null;
    lastConsultation?: string | null;
    nextConsultation?: string | null;
    activeFlags: string[];
    openTasks: number;
    adherence: string;
  };
  agenda: Array<{
    id: string;
    dateTime: string;
    type: string;
    professional: string;
    status: "Confirmado" | "Agendado" | "Concluido";
  }>;
  timeline: PatientTimelineItem[];
  carePlan: PatientCarePlanItem[];
  tasks: PatientTaskListItem[];
  habits: PatientHabitCard[];
  operationalAlerts?: unknown[];
  commercialContext?: PatientCommercialContext | null;
};

export type AppointmentListItem = {
  id: string;
  time: string;
  startsAt: string;
  endsAt: string;
  patient: string;
  type: string;
  professional: string;
  room?: string;
  status: string;
};

export type AppointmentsResponse = {
  items: AppointmentListItem[];
};

export type StartEncounterResponse = {
  appointmentId: string;
  appointmentStatus: string;
  encounterId: string;
  encounterStatus: string;
  queueStatus: string | null;
};

export type EnqueuePatientResponse = {
  id: string;
  status: string;
  queueStatus: string;
};

export type LeadListItem = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interest: string | null;
  owner: string;
  lastContact: string;
  stage: string;
  timeline: Array<{
    id: string;
    kind: "activity" | "stage";
    title: string;
    description: string;
    dateLabel: string;
  }>;
};

export type LeadsKanbanResponse = {
  columns: Array<{
    code: string;
    title: string;
    items: LeadListItem[];
  }>;
};

export type LeadActivityItem = {
  id: string;
  activityType: "CALL" | "MESSAGE" | "TASK" | "NOTE" | "EMAIL" | "MEETING";
  title: string;
  description: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: string;
};

export type LeadActivitiesResponse = {
  items: LeadActivityItem[];
};

export type CommercialCatalogService = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  serviceType: string;
  durationMinutes: number | null;
  listPrice: number;
  currencyCode: string;
  active: boolean;
};

export type CommercialCatalogPackage = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  packageType: string;
  billingModel: string;
  tier: string | null;
  price: number;
  currencyCode: string;
  featured: boolean;
  active: boolean;
  serviceCount: number;
};

export type CommercialCatalogPackageService = {
  id: string;
  packageId: string;
  serviceId: string;
  quantity: number;
  required: boolean;
  notes: string | null;
  itemPriceOverride: number | null;
};

export type CommercialCatalogProgram = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  programType: string;
  durationDays: number | null;
  featured: boolean;
  active: boolean;
  packageCount: number;
};

export type CommercialCatalogProgramPackage = {
  id: string;
  programId: string;
  packageId: string;
  sortOrder: number;
  recommended: boolean;
};

export type CommercialCatalogResponse = {
  services: CommercialCatalogService[];
  packages: CommercialCatalogPackage[];
  packageServices: CommercialCatalogPackageService[];
  programs: CommercialCatalogProgram[];
  programPackages: CommercialCatalogProgramPackage[];
};

export type ClinicalTaskListResponse = {
  items: Array<{
    id: string;
    title: string;
    patient: string;
    priority: string;
    status: string;
    assignedTo: string;
    dueAt: string | null;
  }>;
};

export type SettingsAccessUnit = {
  id: string;
  name: string;
  city: string;
  status: string;
  isDefault: boolean;
};

export type SettingsAccessRole = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  appRoleCode: string;
  scope: "system" | "tenant";
};

export type SettingsTeamMember = {
  membershipId: string;
  profileId: string;
  fullName: string;
  email: string;
  status: string;
  roleCode: string;
  roleName: string;
  appRoleCode: string;
  isDefault: boolean;
  joinedAt: string | null;
  lastSeenAt: string | null;
  units: Array<{
    id: string;
    name: string;
    city: string;
    status: string;
    accessLevel: string;
    isPrimary: boolean;
  }>;
};

export type SettingsPendingInvitation = {
  id: string;
  email: string;
  status: string;
  roleCode: string | null;
  roleName: string | null;
  appRoleCode: string | null;
  unitIds: string[];
  createdAt: string;
  expiresAt: string;
  invitedByName: string | null;
};

export type SettingsAccessOverview = {
  tenant: {
    id: string;
    legalName: string;
    tradeName: string | null;
    status: string;
    defaultTimezone: string;
  };
  currentUnitId: string | null;
  canManageAccess: boolean;
  roles: SettingsAccessRole[];
  units: SettingsAccessUnit[];
  members: SettingsTeamMember[];
  pendingInvitations: SettingsPendingInvitation[];
};

export type DocumentLayoutPreset = {
  code: string;
  name: string;
  description: string | null;
  paperSize: string;
  headerAlignment: "left" | "center" | "right";
  headerVariant: string;
  showLogo: boolean;
  showHeaderBand: boolean;
  showDocumentMeta: boolean;
  showPatientSummary: boolean;
  showSignatureBlock: boolean;
  showFooterNote: boolean;
  showWatermark: boolean;
  density: string;
  sectionStyle: string;
  borderStyle: string;
  titleScale: string;
  bodyScale: string;
  marginPreset: string;
  accentMode: string;
  contentLayout?: Record<string, unknown>;
};

export type DocumentLayoutBranding = {
  brandName: string | null;
  legalName: string | null;
  tradeName: string | null;
  logoPath: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  headerTitle: string | null;
  headerSubtitle: string | null;
  crmLabel: string | null;
  addressLine: string | null;
  contactLine: string | null;
  website: string | null;
  footerNote: string | null;
  signatureNote: string | null;
  watermarkText: string | null;
  showLogo: boolean;
  showLegalName: boolean;
  showContactBlock: boolean;
};

export type DocumentLayoutGuideline = {
  code: string;
  title: string;
  summary: string;
};

export type DocumentLayoutStudioSnapshot = {
  tenant: {
    id: string;
    legacyTenantId: string;
    legalName: string;
    tradeName: string | null;
    defaultTimezone: string | null;
  };
  unit?: {
    id: string;
    legacyUnitId: string | null;
    name: string | null;
  } | null;
  branding: DocumentLayoutBranding;
  presets: DocumentLayoutPreset[];
  standards: DocumentLayoutGuideline[];
  templates: import("@/modules/clinical/types").DocumentTemplateRecord[];
};

export type EncounterDetailsResponse = {
  id: string;
  patient: {
    id: string;
    name: string;
  };
  professional: {
    id: string;
    name: string;
  };
  appointment: {
    id: string;
    type: string;
    startsAt: string;
    status: string;
  } | null;
  encounterType: string;
  status: string;
  nutritionPlan: PatientNutritionPlan | null;
  medicalRecord: {
    id: string;
    primaryGoal?: string | null;
    currentPhase?: string | null;
    riskLevel: string;
    careSummary?: string | null;
    lifestyleSummary?: string | null;
    nutritionSummary?: string | null;
    medicationSummary?: string | null;
    alertSummary?: string | null;
    lastEncounterAt?: string | null;
  } | null;
  sections: Array<{
    id: string;
    code: string;
    label: string;
    position: number;
    completionState: "pending" | "in_progress" | "completed" | "locked";
    isRequired: boolean;
    summary?: string | null;
    completedAt?: string | null;
  }>;
  anamnesis: {
    id?: string | null;
    chiefComplaint?: string | null;
    historyOfPresentIllness?: string | null;
    pastMedicalHistory?: string | null;
    pastSurgicalHistory?: string | null;
    familyHistory?: string | null;
    medicationHistory?: string | null;
    allergyHistory?: string | null;
    lifestyleHistory?: string | null;
    gynecologicalHistory?: string | null;
    notes?: string | null;
  } | null;
  soapDraft: {
    id?: string | null;
    noteType?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    signedAt?: string | null;
  } | null;
  notes: Array<{
    id: string;
    noteType?: string | null;
    subjective?: string | null;
    objective?: string | null;
    assessment?: string | null;
    plan?: string | null;
    signedAt?: string | null;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueAt: string | null;
  }>;
  goals: Array<{
    id: string;
    title: string;
    goalType: string;
    targetValue?: string | null;
    currentValue?: string | null;
    status?: string | null;
    targetDate?: string | null;
  }>;
  carePlan: Array<{
    id: string;
    itemType?: string | null;
    title: string;
    status?: string | null;
    dueDate?: string | null;
    completedAt?: string | null;
  }>;
  documents: Array<{
    id: string;
    runtimeId?: string;
    documentType: string;
    status: string;
    title: string;
    summary?: string | null;
    documentNumber?: string | null;
    issuedAt?: string | null;
    expiresAt?: string | null;
    signedAt?: string | null;
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
      issuedAt?: string | null;
      signedAt?: string | null;
    } | null;
    signatureRequests?: Array<{
      id: string;
      runtimeId?: string;
      signerType: string;
      signerName?: string | null;
      signerEmail?: string | null;
      providerCode?: string | null;
      requestStatus: string;
      requestedAt?: string | null;
      expiresAt?: string | null;
      completedAt?: string | null;
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
  }>;
  prescriptions: Array<{
    id: string;
    prescriptionType: string;
    summary?: string | null;
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
    eventType: string;
    severity: string;
    status: string;
    description: string;
  }>;
  problemList: Array<{
    id: string;
    problemCode?: string | null;
    problemName: string;
    clinicalStatus: string;
    severity?: string | null;
    onsetDate?: string | null;
    resolvedDate?: string | null;
    notes?: string | null;
  }>;
};

export type CompleteEncounterResponse = {
  id: string;
  status: string;
  closedAt: string;
  appointmentStatus: string | null;
  queueStatus?: string | null;
};

export type ScheduleReturnResponse = {
  id: string;
  encounterId: string;
  status: string;
  startsAt: string;
  endsAt: string;
};
