"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rescheduleAppointment } from "../api/reschedule-appointment";

export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      startsAt,
      endsAt,
      reason,
    }: {
      id: string;
      startsAt: string;
      endsAt: string;
      reason?: string;
    }) => rescheduleAppointment(id, { startsAt, endsAt, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
