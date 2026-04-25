"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  getClinicalTasks,
  type ClinicalTasksFilters,
} from "../api/get-clinical-tasks";

export function useClinicalTasks(filters: ClinicalTasksFilters = {}) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: [
      "clinical-tasks",
      currentUnitId,
      filters.search,
      filters.patient,
      filters.priority,
      filters.status,
    ],
    queryFn: () => getClinicalTasks(filters),
  });
}
