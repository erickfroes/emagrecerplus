import { http } from "@/lib/http";

export type CreateClinicalTaskInput = {
  patientId: string;
  title: string;
  encounterId?: string;
  assignedToUserId?: string;
  taskType?: string;
  description?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueAt?: string;
};

export async function createClinicalTask(input: CreateClinicalTaskInput) {
  return http<{
    id: string;
    title: string;
    status: string;
  }>("/clinical/tasks", {
    method: "POST",
    body: input,
  });
}
