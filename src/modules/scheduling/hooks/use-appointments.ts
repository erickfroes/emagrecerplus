"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAppointments,
  type AppointmentsFilters,
} from "@/modules/scheduling/api/get-appointments";

export function useAppointments(filters: AppointmentsFilters = {}) {
  return useQuery({
    queryKey: [
      "appointments",
      filters.date,
      filters.status,
      filters.professional,
      filters.unit,
    ],
    queryFn: () => getAppointments(filters),
  });
}
