"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/forms/form-field";
import { soapNoteSchema, type SoapNoteFormValues } from "@/modules/clinical/schemas/soap-note.schema";
import { useSaveSoapNote } from "@/modules/clinical/hooks/use-save-soap-note";

type Note = {
  id: string;
  noteType?: string | null;
  subjective?: string | null;
  objective?: string | null;
  assessment?: string | null;
  plan?: string | null;
  signedAt?: string | null;
};

export function SoapNoteForm({
  encounterId,
  notes,
}: {
  encounterId: string;
  notes: Note[];
}) {
  const mutation = useSaveSoapNote(encounterId);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<SoapNoteFormValues>({
    resolver: zodResolver(soapNoteSchema),
    defaultValues: {
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    },
  });

  async function onSubmit(values: SoapNoteFormValues) {
    await mutation.mutateAsync(values);
    form.reset();
    setSuccessMessage("Evolução SOAP registrada com sucesso.");
  }

  return (
    <Card>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900">Nova evolução SOAP</h2>
        <p className="mt-1 text-sm text-slate-500">Registre uma nova evolução e acompanhe o histórico abaixo.</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField label="S — Subjetivo" error={form.formState.errors.subjective?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("subjective")}
          />
        </FormField>

        <FormField label="O — Objetivo" error={form.formState.errors.objective?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("objective")}
          />
        </FormField>

        <FormField label="A — Avaliação" error={form.formState.errors.assessment?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("assessment")}
          />
        </FormField>

        <FormField label="P — Plano" error={form.formState.errors.plan?.message}>
          <textarea
            className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            {...form.register("plan")}
          />
        </FormField>

        <div className="flex items-center justify-between gap-3">
          <div className="text-sm">
            {mutation.isError ? <p className="text-red-600">Erro ao salvar evolução SOAP.</p> : null}
            {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
          </div>

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Registrar evolução"}
          </Button>
        </div>
      </form>

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold text-slate-900">Histórico de evoluções</h3>

        <div className="mt-4 space-y-4">
          {notes.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma evolução registrada ainda.</p>
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