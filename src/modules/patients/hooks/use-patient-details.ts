"use client";

import { useQuery } from "@tanstack/react-query";
import { getPatientById } from "@/modules/patients/api/get-patient-by-id";
import { useAuthStore } from "@/state/auth-store";

export function usePatientDetails(id: string) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["patient-details", currentUnitId, id],
    queryFn: () => getPatientById(id),
    enabled: Boolean(id),
  });
}
