"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  createDocumentPrintableArtifact,
  type CreateDocumentPrintableArtifactInput,
} from "../api/create-document-printable-artifact";

export function useCreateDocumentPrintableArtifact(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: ({ documentId, input }: { documentId: string; input: CreateDocumentPrintableArtifactInput }) =>
      createDocumentPrintableArtifact(documentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
