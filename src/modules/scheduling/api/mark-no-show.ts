import { http } from "@/lib/http";

export async function markNoShow(id: string, reason?: string) {
  return http<{
    id: string;
    status: string;
  }>(`/appointments/${id}/no-show`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
}
