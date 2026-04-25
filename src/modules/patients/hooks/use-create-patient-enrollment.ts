"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { createPatientEnrollment, type CreatePatientEnrollmentInput } from "../api/create-patient-enrollment";

export function useCreatePatientEnrollment(patientId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (input: CreatePatientEnrollmentInput) => createPatientEnrollment(patientId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patient-details", currentUnitId, patientId] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
