import { http } from "@/lib/http";
import type { PatientsListResponse } from "@/types/api";

export type PatientsListFilters = {
  search?: string;
  status?: string;
  tag?: string;
  flag?: string;
};

export async function getPatients(filters: PatientsListFilters = {}) {
  const query = new URLSearchParams();

  if (filters.search) {
    query.set("search", filters.search);
  }

  if (filters.status) {
    query.set("status", filters.status);
  }

  if (filters.tag) {
    query.set("tag", filters.tag);
  }

  if (filters.flag) {
    query.set("flag", filters.flag);
  }

  const suffix = query.size ? `?${query.toString()}` : "";
  return http<PatientsListResponse>(`/patients${suffix}`);
}
