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
    type: string;
    summary: string;
  }>;
  adverseEvents: Array<{
    id: string;
    severity: string;
    type: string;
    description: string;
    status: string;
  }>;
};
