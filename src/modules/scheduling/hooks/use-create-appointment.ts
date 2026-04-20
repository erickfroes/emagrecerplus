import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createAppointment, type CreateAppointmentInput } from "../api/create-appointment";

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateAppointmentInput) => createAppointment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["patients"] });
    },
  });
}