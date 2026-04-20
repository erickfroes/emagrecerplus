import { z } from "zod";

export const soapNoteSchema = z.object({
  subjective: z.string().min(3, "Preencha o campo subjetivo."),
  objective: z.string().min(3, "Preencha o campo objetivo."),
  assessment: z.string().min(3, "Preencha o campo avaliação."),
  plan: z.string().min(3, "Preencha o campo plano."),
});

export type SoapNoteFormValues = z.infer<typeof soapNoteSchema>;