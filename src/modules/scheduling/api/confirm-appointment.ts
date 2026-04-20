import { http } from "@/lib/http";

export async function confirmAppointment(id: string) {
  return http<{
    id: string;
    status: string;
  }>(`/appointments/${id}/confirm`, {
    method: "PATCH",
  });
}
