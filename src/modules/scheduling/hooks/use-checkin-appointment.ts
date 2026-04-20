"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { checkinAppointment } from "../api/checkin-appointment";

export function useCheckinAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => checkinAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}
