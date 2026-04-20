import { http } from "@/lib/http";
import type { PatientDetailsResponse } from "@/types/api";

export async function getPatientById(id: string) {
  return http<PatientDetailsResponse>(`/patients/${id}`);
}
