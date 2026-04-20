import { z } from "zod";

export const anamnesisSchema = z.object({
  chiefComplaint: z.string().min(3, "Informe a queixa principal."),
  historyOfPresentIllness: z.string().min(3, "Informe a história da doença atual."),
  pastMedicalHistory: z.string().min(3, "Informe os antecedentes clínicos."),
  lifestyleHistory: z.string().min(3, "Descreva o estilo de vida."),
  notes: z.string().min(3, "Adicione observações clínicas."),
});

export type AnamnesisFormValues = z.infer<typeof anamnesisSchema>;