export type LeadStage = "Novo Lead" | "Qualificado" | "Consulta Marcada" | "Fechado";

export type LeadItem = {
  id: string;
  name: string;
  source: string;
  interest: string;
  owner: string;
  lastActivity: string;
  stage: LeadStage;
};
