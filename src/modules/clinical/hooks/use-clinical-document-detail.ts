"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { getClinicalDocumentDetail } from "../api/get-document-detail";

export function useClinicalDocumentDetail(
  documentId: string,
  options: { enabled?: boolean } = {},
) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["clinical-document-detail", currentUnitId, documentId],
    queryFn: () => getClinicalDocumentDetail(documentId),
    enabled: Boolean(documentId) && (options.enabled ?? true),
  });
}
