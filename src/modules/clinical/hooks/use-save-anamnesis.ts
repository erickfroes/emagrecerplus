import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveAnamnesis } from "../api/save-anamnesis";
import type { AnamnesisFormValues } from "../schemas/anamnesis.schema";

export function useSaveAnamnesis(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: AnamnesisFormValues) => saveAnamnesis(encounterId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", encounterId] });
    },
  });
}