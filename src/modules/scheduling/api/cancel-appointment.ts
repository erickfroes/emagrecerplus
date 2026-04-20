import { http } from "@/lib/http";

export async function cancelAppointment(id: string, reason?: string) {
  return http<{
    id: string;
    status: string;
  }>(`/appointments/${id}/cancel`, {
    method: "PATCH",
    body: reason ? { reason } : {},
  });
}
