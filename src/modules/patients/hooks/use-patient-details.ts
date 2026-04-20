"use client";

import { useQuery } from "@tanstack/react-query";
import { getPatientById } from "@/modules/patients/api/get-patient-by-id";

export function usePatientDetails(id: string) {
  return useQuery({
    queryKey: ["patient-details", id],
    queryFn: () => getPatientById(id),
    enabled: Boolean(id),
  });
}
