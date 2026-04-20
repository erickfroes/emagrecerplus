import { http } from "@/lib/http";

export type CreatePatientInput = {
  fullName: string;
  cpf?: string;
  birthDate?: string;
  primaryPhone?: string;
  primaryEmail?: string;
  goalsSummary?: string;
  lifestyleSummary?: string;
};

export async function createPatient(input: CreatePatientInput) {
  return http<{ id: string; name: string }>("/patients", {
    method: "POST",
    body: input,
  });
}