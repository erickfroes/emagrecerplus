import { http } from "@/lib/http";
import type { DashboardSummaryResponse } from "@/types/api";

export async function getDashboardSummary() {
  return http<DashboardSummaryResponse>("/dashboard/summary");
}
