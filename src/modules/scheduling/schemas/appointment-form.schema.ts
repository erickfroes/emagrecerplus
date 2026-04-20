import { z } from "zod";

export const appointmentFormSchema = z.object({
  patientId: z.string().min(1, "Selecione o paciente."),
  appointmentTypeId: z.string().min(1, "Selecione o tipo."),
  professionalId: z.string().optional(),
  startsAt: z.string().min(1, "Informe o início."),
  endsAt: z.string().min(1, "Informe o fim."),
  notes: z.string().optional(),
});

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;