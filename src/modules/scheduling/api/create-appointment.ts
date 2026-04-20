import { http } from "@/lib/http";

export type CreateAppointmentInput = {
  patientId: string;
  appointmentTypeId: string;
  professionalId?: string;
  startsAt: string;
  endsAt: string;
  notes?: string;
};

export async function createAppointment(input: CreateAppointmentInput) {
  return http<{ id: string; status: string }>("/appointments", {
    method: "POST",
    body: input,
  });
}