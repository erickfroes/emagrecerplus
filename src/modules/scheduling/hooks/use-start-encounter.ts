"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { startEncounter } from "../api/start-encounter";

export function useStartEncounter() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => startEncounter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
      queryClient.invalidateQueries({ queryKey: ["encounter"] });
    },
  });
}
