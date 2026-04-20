import { http } from "@/lib/http";

export async function checkinAppointment(id: string) {
  return http<{
    id: string;
    status: string;
  }>(`/appointments/${id}/check-in`, {
    method: "PATCH",
  });
}
