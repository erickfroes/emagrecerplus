"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { getClinicalDocumentEvidence } from "../api/get-document-evidence";

export function useClinicalDocumentEvidence(
  documentId: string,
  options: { enabled?: boolean } = {},
) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["clinical-document-evidence", currentUnitId, documentId],
    queryFn: () => getClinicalDocumentEvidence(documentId),
    enabled: Boolean(documentId) && (options.enabled ?? true),
  });
}
