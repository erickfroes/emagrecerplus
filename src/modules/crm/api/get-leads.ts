import { http } from "@/lib/http";
import type { LeadsKanbanResponse } from "@/types/api";

export async function getLeadsKanban() {
  return http<LeadsKanbanResponse>("/leads/kanban");
}
