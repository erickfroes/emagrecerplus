import { z } from "zod";

export const patientFormSchema = z.object({
  fullName: z.string().min(3, "Informe o nome completo."),
  cpf: z.string().optional(),
  birthDate: z.string().optional(),
  primaryPhone: z.string().optional(),
  primaryEmail: z.string().email("E-mail inválido.").optional().or(z.literal("")),
  goalsSummary: z.string().optional(),
  lifestyleSummary: z.string().optional(),
});

export type PatientFormValues = z.infer<typeof patientFormSchema>;