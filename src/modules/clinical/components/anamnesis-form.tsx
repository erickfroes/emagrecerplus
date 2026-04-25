"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { useAutosaveEncounterSection } from "@/modules/clinical/hooks/use-autosave-encounter-section";
import { useSaveAnamnesis } from "@/modules/clinical/hooks/use-save-anamnesis";
import { anamnesisSchema, type AnamnesisFormValues } from "@/modules/clinical/schemas/anamnesis.schema";

const EMPTY_ANAMNESIS_VALUES: AnamnesisFormValues = {
  chiefComplaint: "",
  historyOfPresentIllness: "",
  pastMedicalHistory: "",
  lifestyleHistory: "",
  notes: "",
};

export function AnamnesisForm({
  encounterId,
  initialValues,
}: {
  encounterId: string;
  initialValues?: Partial<AnamnesisFormValues> | null;
}) {
  const { can } = usePermissions();
  const mutation = useSaveAnamnesis(encounterId);
  const autosaveMutation = useAutosaveEncounterSection(encounterId);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canWrite = can("clinical:write");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRevisionRef = useRef(0);
  const skipAutosaveRef = useRef(true);
  const lastPersistedSnapshotRef = useRef(serializeAnamnesisValues(EMPTY_ANAMNESIS_VALUES));

  const form = useForm<AnamnesisFormValues>({
    resolver: zodResolver(anamnesisSchema),
    defaultValues: normalizeAnamnesisValues(initialValues),
  });
  const watchedValues = useWatch({
    control: form.control,
    defaultValue: EMPTY_ANAMNESIS_VALUES,
  });

  useEffect(() => {
    const normalizedValues = normalizeAnamnesisValues(initialValues);
    form.reset(normalizedValues);
    lastPersistedSnapshotRef.current = serializeAnamnesisValues(normalizedValues);
    skipAutosaveRef.current = true;
    setAutosaveState("idle");
  }, [form, initialValues]);

  const chiefComplaint = watchedValues.chiefComplaint ?? "";
  const historyOfPresentIllness = watchedValues.historyOfPresentIllness ?? "";
  const pastMedicalHistory = watchedValues.pastMedicalHistory ?? "";
  const lifestyleHistory = watchedValues.lifestyleHistory ?? "";
  const notes = watchedValues.notes ?? "";

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    const values = normalizeAnamnesisValues({
      chiefComplaint,
      historyOfPresentIllness,
      pastMedicalHistory,
      lifestyleHistory,
      notes,
    });
    const snapshot = serializeAnamnesisValues(values);

    if (skipAutosaveRef.current) {
      skipAutosaveRef.current = false;
      return;
    }

    if (snapshot === lastPersistedSnapshotRef.current) {
      return;
    }

    setSuccessMessage(null);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      const revision = autosaveRevisionRef.current + 1;
      autosaveRevisionRef.current = revision;
      setAutosaveState("saving");

      void autosaveMutation
        .mutateAsync({
          section: "anamnesis",
          savedAt: new Date().toISOString(),
          ...values,
        })
        .then(() => {
          if (autosaveRevisionRef.current !== revision) {
            return;
          }

          lastPersistedSnapshotRef.current = snapshot;
          setAutosaveState("saved");
        })
        .catch(() => {
          if (autosaveRevisionRef.current !== revision) {
            return;
          }

          setAutosaveState("error");
        });
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }
    };
  }, [
    autosaveMutation,
    canWrite,
    chiefComplaint,
    historyOfPresentIllness,
    lifestyleHistory,
    notes,
    pastMedicalHistory,
  ]);

  async function onSubmit(values: AnamnesisFormValues) {
    if (!canWrite) {
      return;
    }

    autosaveRevisionRef.current += 1;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    await mutation.mutateAsync(values);
    lastPersistedSnapshotRef.current = serializeAnamnesisValues(values);
    skipAutosaveRef.current = true;
    setAutosaveState("idle");
    setSuccessMessage("Anamnese salva com sucesso.");
  }

  return (
    <Card>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Anamnese</h2>
          <p className="mt-1 text-sm text-slate-500">
            Edite e salve os principais dados clinicos do atendimento.
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="Queixa principal" error={form.formState.errors.chiefComplaint?.message}>
          <Input {...form.register("chiefComplaint")} disabled={!canWrite} />
        </FormField>

        <FormField
          label="Historia da doenca atual"
          error={form.formState.errors.historyOfPresentIllness?.message}
        >
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("historyOfPresentIllness")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField
          label="Antecedentes clinicos"
          error={form.formState.errors.pastMedicalHistory?.message}
        >
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("pastMedicalHistory")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField label="Estilo de vida" error={form.formState.errors.lifestyleHistory?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("lifestyleHistory")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField label="Observacoes clinicas" error={form.formState.errors.notes?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("notes")}
            disabled={!canWrite}
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {!canWrite ? (
              <p className="text-slate-500">Anamnese em modo somente leitura para sua sessao.</p>
            ) : null}
            {mutation.isError ? <p className="text-red-600">Erro ao salvar anamnese.</p> : null}
            {autosaveState === "saving" ? (
              <p className="text-slate-500">Salvando rascunho automaticamente...</p>
            ) : null}
            {autosaveState === "saved" ? (
              <p className="text-slate-500">Rascunho salvo automaticamente.</p>
            ) : null}
            {autosaveState === "error" ? (
              <p className="text-red-600">Erro ao salvar rascunho automatico.</p>
            ) : null}
            {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
          </div>

          <Button type="submit" disabled={!canWrite || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar anamnese"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function normalizeAnamnesisValues(values?: Partial<AnamnesisFormValues> | null): AnamnesisFormValues {
  return {
    chiefComplaint: values?.chiefComplaint ?? "",
    historyOfPresentIllness: values?.historyOfPresentIllness ?? "",
    pastMedicalHistory: values?.pastMedicalHistory ?? "",
    lifestyleHistory: values?.lifestyleHistory ?? "",
    notes: values?.notes ?? "",
  };
}

function serializeAnamnesisValues(values: AnamnesisFormValues) {
  return JSON.stringify(values);
}
