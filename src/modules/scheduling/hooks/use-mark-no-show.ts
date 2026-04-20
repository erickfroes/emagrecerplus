"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { markNoShow } from "../api/mark-no-show";

export function useMarkNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      markNoShow(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
