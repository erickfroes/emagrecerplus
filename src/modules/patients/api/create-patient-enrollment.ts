import { http } from "@/lib/http";
import type { PatientCommercialContext } from "@/types/api";

export type CreatePatientEnrollmentInput = {
  programId: string;
  packageId: string;
  startDate?: string;
  endDate?: string;
  enrollmentStatus?: string;
  source?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
};

export async function createPatientEnrollment(
  patientId: string,
  input: CreatePatientEnrollmentInput
) {
  return http<PatientCommercialContext>(`/patients/${patientId}/enrollments`, {
    method: "POST",
    body: input,
  });
}
