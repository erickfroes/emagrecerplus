import { useMutation, useQueryClient } from "@tanstack/react-query";
import { saveSoapNote } from "../api/save-soap-note";
import type { SoapNoteFormValues } from "../schemas/soap-note.schema";

export function useSaveSoapNote(encounterId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (values: SoapNoteFormValues) => saveSoapNote(encounterId, values),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", encounterId] });
    },
  });
}