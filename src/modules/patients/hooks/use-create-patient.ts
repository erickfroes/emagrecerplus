import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPatient, type CreatePatientInput } from "../api/create-patient";

export function useCreatePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePatientInput) => createPatient(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}