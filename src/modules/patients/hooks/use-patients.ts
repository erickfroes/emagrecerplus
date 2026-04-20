"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getPatients,
  type PatientsListFilters,
} from "@/modules/patients/api/get-patients";

export function usePatients(filters: PatientsListFilters = {}) {
  return useQuery({
    queryKey: ["patients", filters.search, filters.status, filters.tag, filters.flag],
    queryFn: () => getPatients(filters),
  });
}
