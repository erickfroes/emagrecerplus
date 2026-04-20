import { http } from "@/lib/http";
import type { ClinicalTaskListResponse } from "@/types/api";

export type ClinicalTasksFilters = {
  search?: string;
  patient?: string;
  priority?: string;
  status?: string;
};

export async function getClinicalTasks(filters: ClinicalTasksFilters = {}) {
  const query = new URLSearchParams();

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.patient) {
    query.set("patient", filters.patient);
  }

  if (filters.priority) {
    query.set("priority", filters.priority);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return http<ClinicalTaskListResponse>(`/clinical/tasks${suffix}`);
}
