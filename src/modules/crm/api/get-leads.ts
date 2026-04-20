import { env } from "@/lib/env";
import { http } from "@/lib/http";
import type { LeadsKanbanResponse } from "@/types/api";

const fallbackKanban: LeadsKanbanResponse = {
  columns: [
    {
      code: "new",
      title: "Novo Lead",
      items: [
        {
          id: "lead-1",
          name: "Carla Menezes",
          phone: "(99) 99123-2121",
          email: "carla@email.com",
          source: "Google",
          interest: "Modulacao corporal",
          owner: "Time comercial",
          lastContact: "Hoje, 08:10",
          stage: "Novo Lead",
          timeline: [
            {
              id: "lead-1-stage",
              kind: "stage",
              title: "Etapa alterada para Novo Lead",
              description: "Atualizado pelo time comercial.",
              dateLabel: "Hoje, 08:10",
            },
          ],
        },
      ],
    },
    {
      code: "contacted",
      title: "Contatado",
      items: [
        {
          id: "lead-2",
          name: "Bianca Araujo",
          phone: "(99) 99222-1000",
          email: "bianca@email.com",
          source: "Instagram",
          interest: "Emagrecimento",
          owner: "Ana Paula",
          lastContact: "Ontem, 18:20",
          stage: "Contatado",
          timeline: [
            {
              id: "lead-2-activity",
              kind: "activity",
              title: "Ligacao registrada",
              description: "Primeiro contato realizado com sucesso.",
              dateLabel: "Ontem, 18:20",
            },
          ],
        },
      ],
    },
    {
      code: "qualified",
      title: "Qualificado",
      items: [
        {
          id: "lead-3",
          name: "Roberta Lima",
          phone: "(99) 99333-5656",
          email: "roberta@email.com",
          source: "Instagram",
          interest: "Emagrecimento",
          owner: "Ana Paula",
          lastContact: "Hoje, 09:15",
          stage: "Qualificado",
          timeline: [
            {
              id: "lead-3-stage",
              kind: "stage",
              title: "Etapa alterada para Qualificado",
              description: "Atualizado por Ana Paula.",
              dateLabel: "Hoje, 09:15",
            },
          ],
        },
      ],
    },
    {
      code: "scheduled",
      title: "Consulta Marcada",
      items: [
        {
          id: "lead-4",
          name: "Fernanda Alves",
          phone: "(99) 99444-7878",
          email: "fernanda@email.com",
          source: "Instagram",
          interest: "Emagrecimento",
          owner: "Dr. Erick Froes",
          lastContact: "Hoje, 09:40",
          stage: "Consulta Marcada",
          timeline: [
            {
              id: "lead-4-activity",
              kind: "activity",
              title: "Reuniao registrada",
              description: "Consulta inicial alinhada com o lead.",
              dateLabel: "Hoje, 09:40",
            },
          ],
        },
      ],
    },
    {
      code: "proposal",
      title: "Proposta Enviada",
      items: [
        {
          id: "lead-5",
          name: "Carolina Sousa",
          phone: "(99) 99555-8989",
          email: "carolina@email.com",
          source: "Indicacao",
          interest: "Plano premium",
          owner: "Financeiro",
          lastContact: "Hoje, 10:00",
          stage: "Proposta Enviada",
          timeline: [
            {
              id: "lead-5-activity",
              kind: "activity",
              title: "Email registrado",
              description: "Proposta enviada para validacao do lead.",
              dateLabel: "Hoje, 10:00",
            },
          ],
        },
      ],
    },
    {
      code: "closed",
      title: "Fechado",
      items: [
        {
          id: "lead-6",
          name: "Larissa Costa",
          phone: "(99) 99666-6767",
          email: "larissa@email.com",
          source: "Meta Ads",
          interest: "Programa fechado",
          owner: "Time comercial",
          lastContact: "Hoje, 10:15",
          stage: "Fechado",
          timeline: [
            {
              id: "lead-6-stage",
              kind: "stage",
              title: "Etapa alterada para Fechado",
              description: "Atualizado pelo time comercial.",
              dateLabel: "Hoje, 10:15",
            },
          ],
        },
      ],
    },
    {
      code: "lost",
      title: "Perdido",
      items: [
        {
          id: "lead-7",
          name: "Paulo Henrique",
          phone: "(99) 99777-3131",
          email: "paulo@email.com",
          source: "Google",
          interest: "Consulta avulsa",
          owner: "Time comercial",
          lastContact: "Ontem, 16:10",
          stage: "Perdido",
          timeline: [
            {
              id: "lead-7-stage",
              kind: "stage",
              title: "Etapa alterada para Perdido",
              description: "Atualizado pelo time comercial.",
              dateLabel: "Ontem, 16:10",
            },
          ],
        },
      ],
    },
  ],
};

export async function getLeadsKanban() {
  if (env.useMocks) {
    return fallbackKanban;
  }

  return http<LeadsKanbanResponse>("/leads/kanban");
}
