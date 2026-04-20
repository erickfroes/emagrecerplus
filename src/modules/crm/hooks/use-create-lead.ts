import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLead, type CreateLeadInput } from "../api/create-lead";

export function useCreateLead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateLeadInput) => createLead(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}