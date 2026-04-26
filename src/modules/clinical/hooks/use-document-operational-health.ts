"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  getDocumentOperationalHealth,
  type DocumentOperationalHealthParams,
} from "../api/get-document-operational-health";

export function useDocumentOperationalHealth(
  filters: DocumentOperationalHealthParams,
  options: { enabled?: boolean } = {},
) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: [
      "document-operational-health",
      currentUnitId,
      filters.periodFrom ?? "",
      filters.periodTo ?? "",
      filters.provider ?? "",
      filters.status ?? "",
      filters.limit ?? "",
    ],
    queryFn: () => getDocumentOperationalHealth(filters),
    enabled: options.enabled ?? true,
  });
}
