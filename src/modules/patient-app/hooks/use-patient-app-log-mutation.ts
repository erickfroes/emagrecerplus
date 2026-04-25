"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePatientAppTarget } from "@/modules/patient-app/hooks/use-patient-app-target";

export function usePatientAppLogMutation<TInput, TResult>(
  mutationFn: (input: TInput, patientId?: string | null) => Promise<TResult>
) {
  const queryClient = useQueryClient();
  const target = usePatientAppTarget();
  const queryKey = ["patient-app-cockpit", target.patientId ?? "current"];

  return useMutation({
    mutationFn: (input: TInput) => mutationFn(input, target.patientId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
}
