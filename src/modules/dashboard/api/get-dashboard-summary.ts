import { env } from "@/lib/env";
import { http } from "@/lib/http";
import type { DashboardSummaryResponse } from "@/types/api";

const fallbackSummary: DashboardSummaryResponse = {
  stats: {
    scheduledToday: 12,
    completedToday: 5,
    noShows7d: 2,
    openLeads: 18,
    openClinicalTasks: 7,
  },
  todayAppointments: [
    {
      id: "appt-1",
      time: "08:00",
      patient: "Mariana Souza",
      type: "Consulta inicial",
      professional: "Dr. Erick Froes",
      status: "confirmed",
    },
    {
      id: "appt-2",
      time: "09:30",
      patient: "Paula Ribeiro",
      type: "Retorno",
      professional: "Dr. Erick Froes",
      status: "scheduled",
    },
    {
      id: "appt-3",
      time: "11:00",
      patient: "Lucas Martins",
      type: "Avaliacao corporal",
      professional: "Dra. Lais Mendes",
      status: "completed",
    },
  ],
  alerts: [
    {
      id: "alert-1",
      title: "Paciente com risco de abandono",
      description: "Paula Ribeiro faltou ao retorno e possui tarefa clinica pendente.",
    },
    {
      id: "alert-2",
      title: "Lead quente sem resposta",
      description: "Carla Menezes aguarda retorno comercial desde o inicio da manha.",
    },
  ],
  pipeline: [
    { code: "new", title: "Novo lead", count: 8 },
    { code: "qualified", title: "Qualificado", count: 5 },
    { code: "scheduled", title: "Consulta marcada", count: 3 },
    { code: "proposal", title: "Proposta", count: 2 },
    { code: "closed", title: "Fechado", count: 4 },
  ],
};

export async function getDashboardSummary() {
  if (env.useMocks) {
    return fallbackSummary;
  }

  return http<DashboardSummaryResponse>("/dashboard/summary");
}