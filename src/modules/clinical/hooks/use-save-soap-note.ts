import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { saveSoapNote } from "../api/save-soap-note";
import type { SoapNoteFormValues } from "../schemas/soap-note.schema";

export function useSaveSoapNote(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (values: SoapNoteFormValues) => saveSoapNote(encounterId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
