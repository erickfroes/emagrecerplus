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
  anamnesis: {
    chiefComplaint?: string | null;
    historyOfPresentIllness?: string | null;
    pastMedicalHistory?: string | null;
    lifestyleHistory?: string | null;
    notes?: string | null;
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
  prescriptions: Array<{
    id: string;
    prescriptionType: string;
    summary?: string | null;
    issuedAt: string;
  }>;
  adverseEvents: Array<{
    id: string;
    eventType: string;
    severity: string;
    status: string;
    description: string;
  }>;
};
