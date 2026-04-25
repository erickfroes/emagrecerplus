"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { completeEncounter } from "../api/complete-encounter";

export function useCompleteEncounter(id: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: () => completeEncounter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, id] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
