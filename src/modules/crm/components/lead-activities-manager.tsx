"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDateTime } from "@/lib/utils";
import { useCreateLeadActivity } from "@/modules/crm/hooks/use-create-lead-activity";
import { useLeadActivities } from "@/modules/crm/hooks/use-lead-activities";
import { useUpdateLeadActivity } from "@/modules/crm/hooks/use-update-lead-activity";
import type { LeadActivityItem } from "@/types/api";

const activityTypeOptions = [
  { value: "TASK", label: "Tarefa" },
  { value: "CALL", label: "Ligacao" },
  { value: "MESSAGE", label: "Mensagem" },
  { value: "EMAIL", label: "Email" },
  { value: "MEETING", label: "Reuniao" },
  { value: "NOTE", label: "Observacao" },
] as const;

export function LeadActivitiesManager({
  leadId,
  canWrite,
}: {
  leadId: string;
  canWrite: boolean;
}) {
  const { data, isLoading, isError } = useLeadActivities(leadId);
  const createMutation = useCreateLeadActivity();
  const updateMutation = useUpdateLeadActivity();
  const [activityType, setActivityType] = useState("TASK");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState("TASK");
  const [editingDescription, setEditingDescription] = useState("");
  const [editingDueAt, setEditingDueAt] = useState("");

  useEffect(() => {
    setActivityType("TASK");
    setDescription("");
    setDueAt("");
    setEditingId(null);
    setEditingType("TASK");
    setEditingDescription("");
    setEditingDueAt("");
  }, [leadId]);

  async function handleCreate() {
    if (!description.trim()) {
      return;
    }

    await createMutation.mutateAsync({
      leadId,
      activityType,
      description: description.trim(),
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
    });

    setActivityType("TASK");
    setDescription("");
    setDueAt("");
  }

  function startEditing(activity: LeadActivityItem) {
    setEditingId(activity.id);
    setEditingType(activity.activityType);
    setEditingDescription(activity.description);
    setEditingDueAt(toDatetimeLocalValue(activity.dueAt));
  }

  function cancelEditing() {
    setEditingId(null);
    setEditingType("TASK");
    setEditingDescription("");
    setEditingDueAt("");
  }

  async function handleSave(activityId: string) {
    await updateMutation.mutateAsync({
      leadId,
      activityId,
      activityType: editingType,
      description: editingDescription.trim(),
      dueAt: editingDueAt ? new Date(editingDueAt).toISOString() : "",
    });

    cancelEditing();
  }

  async function handleToggleCompleted(activity: LeadActivityItem) {
    await updateMutation.mutateAsync({
      leadId,
      activityId: activity.id,
      completed: !Boolean(activity.completedAt),
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-100 p-4">
        <p className="text-sm font-medium text-slate-950">Nova atividade comercial</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <select
            className="field-base"
            value={activityType}
            onChange={(event) => setActivityType(event.target.value)}
            disabled={!canWrite}
          >
            {activityTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
            disabled={!canWrite}
          />
        </div>
        <textarea
          className="mt-3 min-h-24 w-full rounded-2xl border border-border px-3 py-2 text-sm text-slate-700 outline-none"
          placeholder="Descreva a atividade que o time comercial precisa executar."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          disabled={!canWrite}
        />
        {!canWrite ? (
          <p className="mt-2 text-xs text-slate-500">
            Sua sessao pode acompanhar as atividades, mas nao criar nem editar registros comerciais.
          </p>
        ) : null}
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            type="button"
            onClick={handleCreate}
            disabled={!canWrite || createMutation.isPending || !description.trim()}
          >
            {createMutation.isPending ? "Salvando..." : "Adicionar atividade"}
          </Button>
        </div>
      </div>

      {isLoading ? <p className="text-sm text-slate-500">Carregando atividades...</p> : null}
      {isError ? <p className="text-sm text-red-600">Erro ao carregar atividades do lead.</p> : null}

      <div className="space-y-3">
        {data?.items.map((activity) => {
          const isEditing = editingId === activity.id;

          return (
            <div key={activity.id} className="rounded-2xl border border-slate-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{activity.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Responsavel: {activity.assignedTo}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Criada em {formatShortDateTime(activity.createdAt)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Prazo: {activity.dueAt ? formatShortDateTime(activity.dueAt) : "Sem prazo"}
                  </p>
                </div>
                <Badge tone={activity.completedAt ? "success" : "warning"}>
                  {activity.completedAt ? "Concluida" : "Aberta"}
                </Badge>
              </div>

              {isEditing ? (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 md:grid-cols-2">
                    <select
                      className="field-base"
                      value={editingType}
                      onChange={(event) => setEditingType(event.target.value)}
                      disabled={!canWrite}
                    >
                      {activityTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <Input
                      type="datetime-local"
                      value={editingDueAt}
                      onChange={(event) => setEditingDueAt(event.target.value)}
                      disabled={!canWrite}
                    />
                  </div>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-border px-3 py-2 text-sm text-slate-700 outline-none"
                    value={editingDescription}
                    onChange={(event) => setEditingDescription(event.target.value)}
                    disabled={!canWrite}
                  />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" type="button" variant="secondary" onClick={cancelEditing}>
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      onClick={() => handleSave(activity.id)}
                      disabled={!canWrite || updateMutation.isPending || !editingDescription.trim()}
                    >
                      {updateMutation.isPending ? "Salvando..." : "Salvar edicao"}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-3 text-sm text-slate-600">{activity.description}</p>
                  <div className="mt-3 flex flex-wrap justify-end gap-2">
                    <Button
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => startEditing(activity)}
                      disabled={!canWrite}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => handleToggleCompleted(activity)}
                      disabled={!canWrite || updateMutation.isPending}
                    >
                      {activity.completedAt ? "Reabrir" : "Concluir"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}

        {!isLoading && !data?.items.length ? (
          <p className="text-sm text-slate-500">Nenhuma atividade comercial registrada ainda.</p>
        ) : null}
      </div>
    </div>
  );
}

function toDatetimeLocalValue(value: string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}
