import { useQuery } from "@tanstack/react-query";
import {
  getClinicalTasks,
  type ClinicalTasksFilters,
} from "../api/get-clinical-tasks";

export function useClinicalTasks(filters: ClinicalTasksFilters = {}) {
  return useQuery({
    queryKey: [
      "clinical-tasks",
      filters.search,
      filters.patient,
      filters.priority,
      filters.status,
    ],
    queryFn: () => getClinicalTasks(filters),
  });
}
