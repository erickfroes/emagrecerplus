"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getPatients,
  type PatientsListFilters,
} from "@/modules/patients/api/get-patients";
import { useAuthStore } from "@/state/auth-store";

export function usePatients(filters: PatientsListFilters = {}) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["patients", currentUnitId, filters.search, filters.status, filters.tag, filters.flag],
    queryFn: () => getPatients(filters),
  });
}
