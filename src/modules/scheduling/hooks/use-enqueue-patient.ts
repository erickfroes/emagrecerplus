"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { enqueuePatient } from "../api/enqueue-patient";

export function useEnqueuePatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => enqueuePatient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
