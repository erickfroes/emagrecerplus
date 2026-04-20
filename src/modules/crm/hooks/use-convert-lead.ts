"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { convertLead } from "../api/convert-lead";

export function useConvertLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => convertLead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
