import { http } from "@/lib/http";

export async function convertLead(id: string) {
  return http<{
    id: string;
    patientId: string;
    converted: boolean;
    reusedExistingPatient: boolean;
  }>(`/leads/${id}/convert`, {
    method: "POST",
  });
}
