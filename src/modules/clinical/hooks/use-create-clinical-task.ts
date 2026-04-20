"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createClinicalTask, type CreateClinicalTaskInput } from "../api/create-clinical-task";

export function useCreateClinicalTask(encounterId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateClinicalTaskInput) => createClinicalTask(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clinical-tasks"] });

      if (encounterId) {
        queryClient.invalidateQueries({ queryKey: ["encounter", encounterId] });
      }
    },
  });
}
