"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { getDocumentTemplates } from "../api/get-document-templates";

export function useDocumentTemplates(kind?: string | null) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);
  const kindKey = kind && kind !== "all" ? kind : "all";

  return useQuery({
    queryKey: ["document-templates", currentUnitId, kindKey],
    queryFn: () => getDocumentTemplates(kind),
    enabled: true,
  });
}
