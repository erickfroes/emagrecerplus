import { http } from "@/lib/http";
import type { AppointmentsResponse } from "@/types/api";

export type AppointmentsFilters = {
  date?: string;
  status?: string;
  professional?: string;
  unit?: string;
};

export async function getAppointments(filters: AppointmentsFilters = {}) {
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
