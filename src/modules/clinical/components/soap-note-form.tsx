"use client";

import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/forms/form-field";
import { usePermissions } from "@/hooks/use-permissions";
import { useAutosaveEncounterSection } from "@/modules/clinical/hooks/use-autosave-encounter-section";
import { useSaveSoapNote } from "@/modules/clinical/hooks/use-save-soap-note";
import { soapNoteSchema, type SoapNoteFormValues } from "@/modules/clinical/schemas/soap-note.schema";

type Note = {
  id: string;
  noteType?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  signedAt?: string | null;
};

type SoapDraftInitialValues = {
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
};

const EMPTY_SOAP_NOTE_VALUES: SoapNoteFormValues = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

export function SoapNoteForm({
  encounterId,
  initialValues,
  notes,
}: {
  encounterId: string;
  initialValues?: SoapDraftInitialValues | null;
  notes: Note[];
}) {
  const { can } = usePermissions();
  const mutation = useSaveSoapNote(encounterId);
  const autosaveMutation = useAutosaveEncounterSection(encounterId);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [autosaveState, setAutosaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canWrite = can("clinical:write");
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveRevisionRef = useRef(0);
  const skipAutosaveRef = useRef(true);
  const lastPersistedSnapshotRef = useRef(serializeSoapNoteValues(EMPTY_SOAP_NOTE_VALUES));

  const form = useForm<SoapNoteFormValues>({
    resolver: zodResolver(soapNoteSchema),
    defaultValues: normalizeSoapNoteValues(initialValues),
  });
  const watchedValues = useWatch({
    control: form.control,
    defaultValue: EMPTY_SOAP_NOTE_VALUES,
  });

  useEffect(() => {
    const normalizedValues = normalizeSoapNoteValues(initialValues);
    form.reset(normalizedValues);
    lastPersistedSnapshotRef.current = serializeSoapNoteValues(normalizedValues);
    skipAutosaveRef.current = true;
    setAutosaveState("idle");
  }, [form, initialValues]);

  const subjective = watchedValues.subjective ?? "";
  const objective = watchedValues.objective ?? "";
  const assessment = watchedValues.assessment ?? "";
  const plan = watchedValues.plan ?? "";

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    const values = normalizeSoapNoteValues({
      subjective,
      objective,
      assessment,
      plan,
    });
    const snapshot = serializeSoapNoteValues(values);

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
          section: "soap_draft",
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
  }, [assessment, autosaveMutation, canWrite, objective, plan, subjective]);

  async function onSubmit(values: SoapNoteFormValues) {
    if (!canWrite) {
      return;
    }

    autosaveRevisionRef.current += 1;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    await mutation.mutateAsync(values);
    form.reset(EMPTY_SOAP_NOTE_VALUES);
    lastPersistedSnapshotRef.current = serializeSoapNoteValues(EMPTY_SOAP_NOTE_VALUES);
    skipAutosaveRef.current = true;
    setAutosaveState("idle");
    setSuccessMessage("Evolucao SOAP registrada com sucesso.");
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Nova evolucao SOAP</h2>
        <p className="mt-1 text-sm text-slate-500">
          Registre uma nova evolucao e acompanhe o historico abaixo.
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="S - Subjetivo" error={form.formState.errors.subjective?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("subjective")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField label="O - Objetivo" error={form.formState.errors.objective?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("objective")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField label="A - Avaliacao" error={form.formState.errors.assessment?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("assessment")}
            disabled={!canWrite}
          />
        </FormField>

        <FormField label="P - Plano" error={form.formState.errors.plan?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("plan")}
            disabled={!canWrite}
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {!canWrite ? (
              <p className="text-slate-500">Evolucao em modo somente leitura para sua sessao.</p>
            ) : null}
            {mutation.isError ? <p className="text-red-600">Erro ao salvar evolucao SOAP.</p> : null}
            {autosaveState === "saving" ? (
              <p className="text-slate-500">Salvando rascunho SOAP automaticamente...</p>
            ) : null}
            {autosaveState === "saved" ? (
              <p className="text-slate-500">Rascunho SOAP salvo automaticamente.</p>
            ) : null}
            {autosaveState === "error" ? (
              <p className="text-red-600">Erro ao salvar rascunho SOAP.</p>
            ) : null}
            {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
          </div>

          <Button type="submit" disabled={!canWrite || mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Registrar evolucao"}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Historico de evolucoes</h3>

        <div className="mt-4 space-y-4">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma evolucao registrada ainda.</p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="rounded-2xl border border-border bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    {note.noteType ?? "SOAP"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {note.signedAt ? new Date(note.signedAt).toLocaleString("pt-BR") : "-"}
                  </p>
                </div>

                <div className="mt-3 space-y-2 text-sm text-slate-700">
                  <p><strong>S:</strong> {note.subjective ?? "-"}</p>
                  <p><strong>O:</strong> {note.objective ?? "-"}</p>
                  <p><strong>A:</strong> {note.assessment ?? "-"}</p>
                  <p><strong>P:</strong> {note.plan ?? "-"}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Card>
  );
}

function normalizeSoapNoteValues(values?: SoapDraftInitialValues | null): SoapNoteFormValues {
  return {
    subjective: values?.subjective ?? "",
    objective: values?.objective ?? "",
    assessment: values?.assessment ?? "",
    plan: values?.plan ?? "",
  };
}

function serializeSoapNoteValues(values: SoapNoteFormValues) {
  return JSON.stringify(values);
}
