"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AppModal } from "@/components/modals/app-modal";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { leadFormSchema, type LeadFormValues } from "../schemas/lead-form.schema";
import { useCreateLead } from "../hooks/use-create-lead";

export function CreateLeadModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const mutation = useCreateLead();

  const form = useForm<LeadFormValues>({
    resolver: zodResolver(leadFormSchema),
    defaultValues: {
      fullName: "",
      phone: "",
      email: "",
      source: "",
      campaign: "",
      interestType: "",
    },
  });

  async function onSubmit(values: LeadFormValues) {
    await mutation.mutateAsync({
      ...values,
      email: values.email || undefined,
    });
    form.reset();
    onClose();
  }

  return (
    <AppModal open={open} onClose={onClose} title="Novo lead">
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="Nome" error={form.formState.errors.fullName?.message}>
          <Input {...form.register("fullName")} />
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="Telefone" error={form.formState.errors.phone?.message}>
            <Input {...form.register("phone")} />
          </FormField>

          <FormField label="E-mail" error={form.formState.errors.email?.message}>
            <Input {...form.register("email")} />
          </FormField>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Origem" error={form.formState.errors.source?.message}>
            <Input {...form.register("source")} />
          </FormField>

          <FormField label="Campanha" error={form.formState.errors.campaign?.message}>
            <Input {...form.register("campaign")} />
          </FormField>

          <FormField label="Interesse" error={form.formState.errors.interestType?.message}>
            <Input {...form.register("interestType")} />
          </FormField>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Criar lead"}
          </Button>
        </div>
      </form>
    </AppModal>
  );
}