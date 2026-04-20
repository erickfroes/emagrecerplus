"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppModal } from "@/components/modals/app-modal";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { patientFormSchema, type PatientFormValues } from "../schemas/patient-form.schema";
import { useCreatePatient } from "../hooks/use-create-patient";

export function CreatePatientModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCreatePatient();

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientFormSchema),
    defaultValues: {
      fullName: "",
      cpf: "",
      birthDate: "",
      primaryPhone: "",
      primaryEmail: "",
      goalsSummary: "",
      lifestyleSummary: "",
    },
  });

  async function onSubmit(values: PatientFormValues) {
    await mutation.mutateAsync({
      ...values,
      primaryEmail: values.primaryEmail || undefined,
    });
    form.reset();
    onClose();
  }

  return (
    <AppModal open={open} onClose={onClose} title="Novo paciente">
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="Nome completo" error={form.formState.errors.fullName?.message}>
          <Input {...form.register("fullName")} />
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="CPF" error={form.formState.errors.cpf?.message}>
            <Input {...form.register("cpf")} />
          </FormField>

          <FormField label="Data de nascimento" error={form.formState.errors.birthDate?.message}>
            <Input type="date" {...form.register("birthDate")} />
          </FormField>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Telefone" error={form.formState.errors.primaryPhone?.message}>
            <Input {...form.register("primaryPhone")} />
          </FormField>

          <FormField label="E-mail" error={form.formState.errors.primaryEmail?.message}>
            <Input {...form.register("primaryEmail")} />
          </FormField>
        </div>

        <FormField label="Objetivo principal" error={form.formState.errors.goalsSummary?.message}>
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
            {...form.register("goalsSummary")}
          />
        </FormField>

        <FormField label="Resumo de estilo de vida" error={form.formState.errors.lifestyleSummary?.message}>
          <textarea
            className="min-h-24 w-full rounded-xl border border-slate-200 p-3 text-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
            {...form.register("lifestyleSummary")}
          />
        </FormField>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Criar paciente"}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}