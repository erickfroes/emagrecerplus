import { http } from "@/lib/http";

export async function rescheduleAppointment(
  id: string,
  input: { startsAt: string; endsAt: string; reason?: string }
) {
  return http<{
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
  }>(`/appointments/${id}/reschedule`, {
    method: "PATCH",
    body: input,
  });
}
