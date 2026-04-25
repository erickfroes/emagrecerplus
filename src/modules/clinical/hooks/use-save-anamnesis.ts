import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { saveAnamnesis } from "../api/save-anamnesis";
import type { AnamnesisFormValues } from "../schemas/anamnesis.schema";

export function useSaveAnamnesis(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (values: AnamnesisFormValues) => saveAnamnesis(encounterId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
