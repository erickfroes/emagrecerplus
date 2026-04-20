export type PatientListItem = {
  id: string;
  name: string;
  phone: string;
  email: string;
  status: string;
  tags: string[];
  nextAppointment?: string;
};

export type PatientAgendaItem = {
  id: string;
  dateLabel: string;
  type: string;
  professional: string;
  status: "Confirmado" | "Agendado" | "Concluído";
};

export type PatientTaskItem = {
  id: string;
  title: string;
  owner: string;
  dueDate: string;
  priority: "Alta" | "Média" | "Baixa";
  status: "Aberta" | "Em andamento" | "Concluída";
};

export type PatientHabitSnapshot = {
  id: string;
  label: string;
  value: string;
  helper: string;
  trend: "up" | "down" | "stable";
};

export type PatientDetail = {
  id: string;
  name: string;
  email: string;
  phone: string;
  tags: string[];
  summary: {
    mainGoal: string;
    lastEncounter: string;
    nextEncounter: string;
    programStage: string;
    adherence: string;
  };
  agenda: PatientAgendaItem[];
  clinical: {
    currentPlan: string;
    lastSoap: string;
    flags: string[];
    activeProtocols: string[];
  };
  tasks: PatientTaskItem[];
  habits: PatientHabitSnapshot[];
};
