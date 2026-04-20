"use client";

import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { anamnesisSchema, type AnamnesisFormValues } from "@/modules/clinical/schemas/anamnesis.schema";
import { useSaveAnamnesis } from "@/modules/clinical/hooks/use-save-anamnesis";

export function AnamnesisForm({
  encounterId,
  initialValues,
}: {
  encounterId: string;
  initialValues?: Partial<AnamnesisFormValues> | null;
}) {
  const mutation = useSaveAnamnesis(encounterId);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<AnamnesisFormValues>({
    resolver: zodResolver(anamnesisSchema),
    defaultValues: {
      chiefComplaint: initialValues?.chiefComplaint ?? "",
      historyOfPresentIllness: initialValues?.historyOfPresentIllness ?? "",
      pastMedicalHistory: initialValues?.pastMedicalHistory ?? "",
      lifestyleHistory: initialValues?.lifestyleHistory ?? "",
      notes: initialValues?.notes ?? "",
    },
  });

  useEffect(() => {
    form.reset({
      chiefComplaint: initialValues?.chiefComplaint ?? "",
      historyOfPresentIllness: initialValues?.historyOfPresentIllness ?? "",
      pastMedicalHistory: initialValues?.pastMedicalHistory ?? "",
      lifestyleHistory: initialValues?.lifestyleHistory ?? "",
      notes: initialValues?.notes ?? "",
    });
  }, [form, initialValues]);

  async function onSubmit(values: AnamnesisFormValues) {
    await mutation.mutateAsync(values);
    setSuccessMessage("Anamnese salva com sucesso.");
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Anamnese</h2>
          <p className="mt-1 text-sm text-slate-500">Edite e salve os principais dados clínicos do atendimento.</p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="Queixa principal" error={form.formState.errors.chiefComplaint?.message}>
          <Input {...form.register("chiefComplaint")} />
        </FormField>

        <FormField
          label="História da doença atual"
          error={form.formState.errors.historyOfPresentIllness?.message}
        >
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("historyOfPresentIllness")}
          />
        </FormField>

        <FormField
          label="Antecedentes clínicos"
          error={form.formState.errors.pastMedicalHistory?.message}
        >
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("pastMedicalHistory")}
          />
        </FormField>

        <FormField label="Estilo de vida" error={form.formState.errors.lifestyleHistory?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("lifestyleHistory")}
          />
        </FormField>

        <FormField label="Observações clínicas" error={form.formState.errors.notes?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("notes")}
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {mutation.isError ? <p className="text-red-600">Erro ao salvar anamnese.</p> : null}
            {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar anamnese"}
          </Button>
        </div>
      </form>
    </Card>
  );
}