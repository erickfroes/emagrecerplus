"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { scheduleReturn } from "../api/schedule-return";

export function useScheduleReturn(id: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (payload: { startsAt: string; endsAt?: string; notes?: string }) =>
      scheduleReturn(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, id] });
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
