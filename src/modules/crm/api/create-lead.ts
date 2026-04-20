import { http } from "@/lib/http";

export type CreateLeadInput = {
  fullName: string;
  phone?: string;
  email?: string;
  source?: string;
  campaign?: string;
  interestType?: string;
};

export async function createLead(input: CreateLeadInput) {
  return http<{ id: string; name: string; status: string }>("/leads", {
    method: "POST",
    body: input,
  });
}