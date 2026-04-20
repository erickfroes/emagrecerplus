"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppModal } from "@/components/modals/app-modal";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { appointmentFormSchema, type AppointmentFormValues } from "../schemas/appointment-form.schema";
import { useCreateAppointment } from "../hooks/use-create-appointment";

export function CreateAppointmentModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCreateAppointment();

  const form = useForm<AppointmentFormValues>({
    resolver: zodResolver(appointmentFormSchema),
    defaultValues: {
      patientId: "",
      appointmentTypeId: "",
      professionalId: "",
      startsAt: "",
      endsAt: "",
      notes: "",
    },
  });

  async function onSubmit(values: AppointmentFormValues) {
    await mutation.mutateAsync({
      ...values,
      professionalId: values.professionalId || undefined,
      notes: values.notes || undefined,
    });
    form.reset();
    onClose();
  }

  return (
    <AppModal open={open} onClose={onClose} title="Novo agendamento">
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="ID do paciente" error={form.formState.errors.patientId?.message}>
          <Input {...form.register("patientId")} />
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Tipo de atendimento" error={form.formState.errors.appointmentTypeId?.message}>
            <Input {...form.register("appointmentTypeId")} />
          </FormField>

          <FormField label="Profissional" error={form.formState.errors.professionalId?.message}>
            <Input {...form.register("professionalId")} />
          </FormField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Início" error={form.formState.errors.startsAt?.message}>
            <Input type="datetime-local" {...form.register("startsAt")} />
          </FormField>

          <FormField label="Fim" error={form.formState.errors.endsAt?.message}>
            <Input type="datetime-local" {...form.register("endsAt")} />
          </FormField>
        </div>

        <FormField label="Observações" error={form.formState.errors.notes?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("notes")}
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Criar agendamento"}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}