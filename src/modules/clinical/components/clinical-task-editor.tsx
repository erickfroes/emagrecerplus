"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { ClinicalTaskPriorityBadge } from "@/modules/clinical/components/clinical-task-priority-badge";
import { ClinicalTaskStatusBadge } from "@/modules/clinical/components/clinical-task-status-badge";
import { useCreateClinicalTask } from "@/modules/clinical/hooks/use-create-clinical-task";
import type { EncounterDetailsResponse } from "@/types/api";

function mapPriorityLabel(priority: string) {
  switch (priority) {
    case "HIGH":
    case "URGENT":
      return "Alta";
    case "LOW":
      return "Baixa";
    default:
      return "Media";
  }
}

function mapStatusLabel(status: string) {
  switch (status) {
    case "IN_PROGRESS":
      return "Em andamento";
    case "DONE":
      return "Concluida";
    case "CANCELLED":
      return "Cancelada";
    default:
      return "Aberta";
  }
}

function formatDueDate(value: string | null) {
  if (!value) {
    return "Sem prazo";
  }

  return new Date(value).toLocaleString("pt-BR");
}

export function ClinicalTaskEditor({
  encounterId,
  patientId,
  items,
}: {
  encounterId: string;
  patientId: string;
  items: EncounterDetailsResponse["tasks"];
}) {
  const { can } = usePermissions();
  const mutation = useCreateClinicalTask(encounterId);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH" | "URGENT">("MEDIUM");
  const [dueAt, setDueAt] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const canWrite = can("clinical:write");

  async function handleCreateTask() {
    if (!title.trim() || !canWrite) {
      return;
    }

    await mutation.mutateAsync({
      patientId,
      encounterId,
      title: title.trim(),
      priority,
      dueAt: dueAt || undefined,
    });

    setTitle("");
    setPriority("MEDIUM");
    setDueAt("");
    setSuccessMessage("Tarefa clinica criada com sucesso.");
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Tarefas clinicas</h2>

      <div className="mb-4 grid gap-3 md:grid-cols-[1.7fr_0.9fr_1fr_auto]">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ex.: revisar adesao e retorno laboratorial"
          disabled={!canWrite}
        />
        <select
          className="field-base"
          value={priority}
          onChange={(event) =>
            setPriority(event.target.value as "LOW" | "MEDIUM" | "HIGH" | "URGENT")
          }
          disabled={!canWrite}
        >
          <option value="LOW">Baixa</option>
          <option value="MEDIUM">Media</option>
          <option value="HIGH">Alta</option>
          <option value="URGENT">Urgente</option>
        </select>
        <Input
          type="datetime-local"
          value={dueAt}
          onChange={(event) => setDueAt(event.target.value)}
          disabled={!canWrite}
        />
        <Button
          type="button"
          onClick={handleCreateTask}
          disabled={!canWrite || mutation.isPending || !title.trim()}
        >
          {mutation.isPending ? "Criando..." : "Nova tarefa"}
        </Button>
      </div>

      {!canWrite ? (
        <p className="mb-4 text-sm text-slate-500">
          Sua sessao pode acompanhar as tarefas deste atendimento, mas nao criar novas pendencias.
        </p>
      ) : null}
      {mutation.isError ? <p className="mb-4 text-sm text-red-600">Erro ao criar tarefa clinica.</p> : null}
      {successMessage ? <p className="mb-4 text-sm text-emerald-700">{successMessage}</p> : null}

      <div className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-2"
          >
            <div>
              <p className="font-medium text-slate-950">{item.title}</p>
              <p className="text-xs text-slate-500">
                Status: {mapStatusLabel(item.status)} - Vencimento: {formatDueDate(item.dueAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ClinicalTaskStatusBadge status={mapStatusLabel(item.status)} />
              <ClinicalTaskPriorityBadge priority={mapPriorityLabel(item.priority)} />
            </div>
          </div>
        ))}

        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            Nenhuma tarefa clinica registrada para este atendimento ainda.
          </p>
        ) : null}
      </div>
    </Card>
  );
}
