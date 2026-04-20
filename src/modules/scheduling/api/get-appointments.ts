import { env } from "@/lib/env";
import { http } from "@/lib/http";
import type { AppointmentsResponse } from "@/types/api";

export type AppointmentsFilters = {
  date?: string;
  status?: string;
  professional?: string;
  unit?: string;
};

const fallbackAppointments: AppointmentsResponse = {
  items: [
    {
      id: "app-1",
      time: "08:00",
      startsAt: "2026-04-20T08:00:00.000Z",
      endsAt: "2026-04-20T08:45:00.000Z",
      patient: "Mariana Souza",
      type: "Consulta inicial",
      professional: "Dr. Erick Froes",
      room: "Sala 2",
      status: "Confirmado",
    },
    {
      id: "app-2",
      time: "09:30",
      startsAt: "2026-04-20T09:30:00.000Z",
      endsAt: "2026-04-20T10:15:00.000Z",
      patient: "Paula Ribeiro",
      type: "Retorno",
      professional: "Dr. Erick Froes",
      room: "Sala 1",
      status: "Agendado",
    },
    {
      id: "app-3",
      time: "11:00",
      startsAt: "2026-04-20T11:00:00.000Z",
      endsAt: "2026-04-20T11:45:00.000Z",
      patient: "Lucas Martins",
      type: "Avaliacao corporal",
      professional: "Dra. Lais Mendes",
      room: "Sala 3",
      status: "Concluido",
    },
  ],
};

export async function getAppointments(filters: AppointmentsFilters = {}) {
  if (env.useMocks) {
    const status = filters.status?.trim().toLowerCase();
    const professional = filters.professional?.trim().toLowerCase();
    const unit = filters.unit?.trim().toLowerCase();

    return {
      items: fallbackAppointments.items.filter((item) =>
        matchesAppointmentField(item.status, status) &&
        matchesAppointmentField(item.professional, professional) &&
        matchesAppointmentField(item.room ?? "", unit)
      ),
    };
  }

  const query = new URLSearchParams();

  if (filters.date) {
    query.set("date", filters.date);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  if (filters.professional) {
    query.set("professional", filters.professional);
  }

  if (filters.unit) {
    query.set("unit", filters.unit);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return http<AppointmentsResponse>(`/appointments${suffix}`);
}

function matchesAppointmentField(value: string, filter?: string) {
  if (!filter) {
    return true;
  }

  return value.toLowerCase().includes(filter);
}
