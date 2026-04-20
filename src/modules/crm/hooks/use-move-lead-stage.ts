"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { moveLeadStage } from "../api/move-lead-stage";

export function useMoveLeadStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, stageCode }: { id: string; stageCode: string }) =>
      moveLeadStage(id, stageCode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
