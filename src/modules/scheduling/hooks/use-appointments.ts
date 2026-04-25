"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getAppointments,
  type AppointmentsFilters,
} from "@/modules/scheduling/api/get-appointments";
import { useAuthStore } from "@/state/auth-store";

export function useAppointments(filters: AppointmentsFilters = {}) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: [
      "appointments",
      currentUnitId,
      filters.date,
      filters.status,
      filters.professional,
      filters.unit,
    ],
    queryFn: () => getAppointments(filters),
  });
}
