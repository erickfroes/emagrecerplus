"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  listClinicalDocuments,
  type ClinicalDocumentListParams,
} from "../api/list-documents";

export function useClinicalDocuments(
  filters: ClinicalDocumentListParams = {},
  options: { enabled?: boolean } = {},
) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: [
      "clinical-documents",
      currentUnitId,
      filters.patientId ?? "",
      filters.documentType ?? "",
      filters.status ?? "",
      filters.limit ?? "",
      filters.offset ?? "",
    ],
    queryFn: () => listClinicalDocuments(filters),
    enabled: options.enabled ?? true,
  });
}
