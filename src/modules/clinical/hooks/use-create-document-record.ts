"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { createDocumentRecord, type CreateDocumentRecordInput } from "../api/create-document-record";

export function useCreateDocumentRecord(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (input: CreateDocumentRecordInput) => createDocumentRecord(encounterId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
