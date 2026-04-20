import { z } from "zod";

export const leadFormSchema = z.object({
  fullName: z.string().min(3, "Informe o nome do lead."),
  phone: z.string().optional(),
  email: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  source: z.string().optional(),
  campaign: z.string().optional(),
  interestType: z.string().optional(),
});

export type LeadFormValues = z.infer<typeof leadFormSchema>;