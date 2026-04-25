import { http } from "@/lib/http";
import type { PrescriptionRecord } from "@/modules/clinical/types";

export type CreatePrescriptionItemInput = {
  itemType: string;
  title: string;
  dosage?: string;
  frequency?: string;
  route?: string;
  durationDays?: number;
  quantity?: number;
  unit?: string;
  instructions?: string;
  position?: number;
};

export type CreatePrescriptionRecordInput = {
  prescriptionType: string;
  summary?: string;
  issuedAt?: string;
  items: CreatePrescriptionItemInput[];
};

export async function createPrescriptionRecord(encounterId: string, input: CreatePrescriptionRecordInput) {
  return http<PrescriptionRecord>(`/encounters/${encounterId}/prescriptions`, {
    method: "POST",
    body: input,
  });
}
