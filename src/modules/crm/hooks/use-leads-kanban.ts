"use client";

import { useQuery } from "@tanstack/react-query";
import { getLeadsKanban } from "@/modules/crm/api/get-leads";

export function useLeadsKanban() {
  return useQuery({
    queryKey: ["leads-kanban"],
    queryFn: getLeadsKanban,
  });
}
