"use client";

import { useQuery } from "@tanstack/react-query";
import { getCommercialCatalog } from "@/modules/crm/api/get-commercial-catalog";
import { useAuthStore } from "@/state/auth-store";

export function useCommercialCatalog() {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: ["commercial-catalog", currentUnitId],
    queryFn: getCommercialCatalog,
  });
}
