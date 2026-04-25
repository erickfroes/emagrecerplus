"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  createDocumentSignatureRequest,
  type CreateDocumentSignatureRequestInput,
} from "../api/create-document-signature-request";

export function useCreateDocumentSignatureRequest(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: ({
      documentId,
      input,
    }: {
      documentId: string;
      input: CreateDocumentSignatureRequestInput;
    }) => createDocumentSignatureRequest(documentId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
