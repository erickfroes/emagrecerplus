"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import { EncounterHeader } from "@/modules/clinical/components/encounter-header";
import { EncounterStepper } from "@/modules/clinical/components/encounter-stepper";
import { AnamnesisForm } from "@/modules/clinical/components/anamnesis-form";
import { ClinicalTaskEditor } from "@/modules/clinical/components/clinical-task-editor";
import { DocumentRecordBoard } from "@/modules/clinical/components/document-record-board";
import { PrescriptionRecordForm } from "@/modules/clinical/components/prescription-record-form";
import { SoapNoteForm } from "@/modules/clinical/components/soap-note-form";
import { useCompleteEncounter } from "@/modules/clinical/hooks/use-complete-encounter";
import { useEncounter } from "@/modules/clinical/hooks/use-encounter";
import { useScheduleReturn } from "@/modules/clinical/hooks/use-schedule-return";

export default function EncounterDetailPage() {
  const params = useParams<{ id: string }>();
  const encounterId = params.id;
  const { can } = usePermissions();
  const { data, isLoading, isError, refetch } = useEncounter(encounterId);
  const completeEncounterMutation = useCompleteEncounter(encounterId);
  const scheduleReturnMutation = useScheduleReturn(encounterId);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [returnStartsAt, setReturnStartsAt] = useState("");
  const [returnNotes, setReturnNotes] = useState("");

  async function handleCompleteEncounter() {
    const result = await completeEncounterMutation.mutateAsync();
    setActionMessage(`Atendimento concluido com status ${result.status}.`);
    await refetch();
  }

  async function handleScheduleReturn() {
    if (!returnStartsAt) {
      setActionMessage("Defina a data e hora do retorno antes de continuar.");
      return;
    }

    const startsAt = new Date(returnStartsAt);
    if (Number.isNaN(startsAt.getTime())) {
      setActionMessage("A data informada para o retorno e invalida.");
      return;
    }

    const result = await scheduleReturnMutation.mutateAsync({
      startsAt: startsAt.toISOString(),
      notes: returnNotes.trim() || undefined,
    });

    setActionMessage(`Retorno agendado para ${formatDateTime(result.startsAt)} com status ${result.status}.`);
    setReturnNotes("");
    await refetch();
  }

  useEffect(() => {
    if (!data || returnStartsAt) {
      return;
    }

    const baseDate = data.appointment?.startsAt ? new Date(data.appointment.startsAt) : new Date();
    const suggestedDate = new Date(baseDate);
    suggestedDate.setDate(suggestedDate.getDate() + 15);

    if (!data.appointment?.startsAt) {
      suggestedDate.setHours(9, 0, 0, 0);
    }

    setReturnStartsAt(toLocalDateTimeValue(suggestedDate));
  }, [data, returnStartsAt]);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Carregando atendimento...</p>;
  }

  if (isError) {
    return (
      <EmptyState
        title="Nao foi possivel abrir o atendimento"
        description="Confira se este registro pertence a unidade ativa e tente novamente."
        action={<Button onClick={() => void refetch()}>Tentar novamente</Button>}
      />
    );
  }

  if (!data) {
    return (
      <EmptyState
        title="Atendimento nao encontrado"
        description="Nao encontramos este registro clinico para a sessao atual."
      />
    );
  }

  const structuredSteps = data.sections.map((section) => ({
    id: section.id,
    label: section.label,
    done: section.completionState === "completed",
    state: section.completionState,
    summary: section.summary ?? undefined,
  }));

  return (
    <div className="space-y-6">
      <EncounterHeader
        patientName={data.patient.name}
        appointmentType={data.appointment?.type ?? data.encounterType}
        professionalName={data.professional.name}
        status={data.status}
        action={
          can("clinical:write") && data.status !== "CLOSED" && data.status !== "CANCELLED" ? (
            <Button
              size="sm"
              type="button"
              onClick={() => void handleCompleteEncounter()}
              disabled={completeEncounterMutation.isPending}
            >
              {completeEncounterMutation.isPending ? "Concluindo..." : "Concluir atendimento"}
            </Button>
          ) : null
        }
      />

      {structuredSteps.length ? <EncounterStepper steps={structuredSteps} /> : null}

      {completeEncounterMutation.isError ? (
        <p className="text-sm text-red-600">Erro ao concluir o atendimento.</p>
      ) : null}
      {scheduleReturnMutation.isError ? (
        <p className="text-sm text-red-600">Erro ao agendar o retorno.</p>
      ) : null}
      {actionMessage ? <p className="text-sm text-emerald-700">{actionMessage}</p> : null}

      {can("schedule:write") && data.status === "CLOSED" ? (
        <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="flex-1 space-y-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Agendar retorno</p>
                <p className="text-sm text-slate-500">
                  Use o fechamento do atendimento para deixar a proxima passagem do paciente na agenda.
                </p>
              </div>
              <Input
                type="datetime-local"
                value={returnStartsAt}
                onChange={(event) => setReturnStartsAt(event.target.value)}
              />
              <Input
                value={returnNotes}
                onChange={(event) => setReturnNotes(event.target.value)}
                placeholder="Observacoes do retorno (opcional)"
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleScheduleReturn()}
              disabled={scheduleReturnMutation.isPending || !returnStartsAt}
            >
              {scheduleReturnMutation.isPending ? "Agendando..." : "Agendar retorno"}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Prontuario estruturado</p>
            <p className="text-sm text-slate-500">
              Resumo longitudinal do paciente para orientar a consulta atual.
            </p>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-600">
            <div>
              <p className="font-medium text-slate-900">Objetivo principal</p>
              <p>{data.medicalRecord?.primaryGoal ?? "Sem objetivo estruturado ainda."}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Risco clinico</p>
              <p>{formatRiskLevel(data.medicalRecord?.riskLevel)}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Resumo de cuidado</p>
              <p>{data.medicalRecord?.careSummary ?? "Sem resumo consolidado neste prontuario."}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">Alertas</p>
              <p>{data.medicalRecord?.alertSummary ?? "Nenhum alerta estruturado ate o momento."}</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Lista de problemas</p>
            <p className="text-sm text-slate-500">
              Estrutura clinica reutilizavel entre consultas e retornos.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {data.problemList.length ? (
              data.problemList.slice(0, 4).map((problem) => (
                <div key={problem.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{problem.problemName}</p>
                  <p className="text-xs text-slate-500">
                    {problem.clinicalStatus}
                    {problem.severity ? ` • ${problem.severity}` : ""}
                  </p>
                  {problem.notes ? <p className="mt-1 text-sm text-slate-600">{problem.notes}</p> : null}
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Nenhum problema estruturado ainda. Os alertas e eventos seguem ajudando a sinalizar o que falta consolidar.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Plano ativo</p>
            <p className="text-sm text-slate-500">
              Itens do plano de cuidado que sustentam a conduta atual.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {data.carePlan.length ? (
              data.carePlan.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">
                    {item.status ?? "Sem status"}
                    {item.dueDate ? ` • ${formatDate(item.dueDate)}` : ""}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-500">
                Nenhum item estruturado de plano de cuidado para este paciente.
              </p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Plano nutricional vigente</p>
            <p className="text-sm text-slate-500">
              Versao ativa do plano alimentar para orientar o atendimento e os registros do paciente.
            </p>
          </div>
          {data.nutritionPlan?.currentVersion ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Versao {data.nutritionPlan.currentVersion.versionNumber}
            </div>
          ) : null}
        </div>

        {data.nutritionPlan ? (
          <div className="mt-4 space-y-4">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Plano</p>
                <p className="mt-2 text-sm font-medium text-slate-950">{data.nutritionPlan.name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {data.nutritionPlan.currentVersion?.summary ??
                    data.nutritionPlan.summary ??
                    "Sem resumo estruturado para a versao atual."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vigencia</p>
                <p className="mt-2 text-sm font-medium text-slate-950">
                  {formatPlanWindow(data.nutritionPlan.startsAt, data.nutritionPlan.endsAt)}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {data.nutritionPlan.currentVersion?.effectiveFrom
                    ? `Versao vigente desde ${formatDate(data.nutritionPlan.currentVersion.effectiveFrom)}.`
                    : "A vigencia desta versao ainda nao foi estruturada."}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Orientacao</p>
                <p className="mt-2 text-sm text-slate-600">
                  {data.nutritionPlan.currentVersion?.guidance ??
                    "Sem guidance estruturado para esta versao."}
                </p>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {data.nutritionPlan.targets.length ? (
                data.nutritionPlan.targets.slice(0, 6).map((targetItem) => (
                  <div key={targetItem.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-slate-950">{targetItem.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{formatNutritionTarget(targetItem)}</p>
                      </div>
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        {formatNutritionTargetType(targetItem.type)}
                      </span>
                    </div>
                    {targetItem.guidance ? (
                      <p className="mt-3 text-sm text-slate-600">{targetItem.guidance}</p>
                    ) : null}
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  Ainda nao existem metas nutricionais estruturadas para esta versao.
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">
            Nenhum plano nutricional vigente foi estruturado para este paciente ate o momento.
          </p>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <AnamnesisForm
          encounterId={encounterId}
          initialValues={{
            chiefComplaint: data.anamnesis?.chiefComplaint ?? "",
            historyOfPresentIllness: data.anamnesis?.historyOfPresentIllness ?? "",
            pastMedicalHistory: data.anamnesis?.pastMedicalHistory ?? "",
            lifestyleHistory: data.anamnesis?.lifestyleHistory ?? "",
            notes: data.anamnesis?.notes ?? "",
          }}
        />

        <SoapNoteForm encounterId={encounterId} initialValues={data.soapDraft} notes={data.notes} />
      </div>

      <PrescriptionRecordForm encounterId={encounterId} items={data.prescriptions} />

      <DocumentRecordBoard encounterId={encounterId} items={data.documents} />

      <ClinicalTaskEditor encounterId={encounterId} patientId={data.patient.id} items={data.tasks} />
    </div>
  );
}

function toLocalDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(new Date(value));
}

function formatRiskLevel(value?: string | null) {
  if (!value) {
    return "Nao classificado";
  }

  switch (value.toLowerCase()) {
    case "critical":
      return "Critico";
    case "high":
      return "Alto";
    case "medium":
      return "Moderado";
    case "low":
      return "Baixo";
    default:
      return value;
  }
}

function formatPlanWindow(startsAt?: string | null, endsAt?: string | null) {
  if (!startsAt && !endsAt) {
    return "Sem janela definida";
  }

  if (startsAt && endsAt) {
    return `${formatDate(startsAt)} ate ${formatDate(endsAt)}`;
  }

  if (startsAt) {
    return `Desde ${formatDate(startsAt)}`;
  }

  return `Ate ${formatDate(endsAt!)}`;
}

function formatNutritionTarget(target: {
  goalValue: number | null;
  unit: string | null;
  period: string;
  mealType: string | null;
}) {
  const value =
    target.goalValue !== null && target.goalValue !== undefined
      ? `${target.goalValue}${target.unit ? ` ${target.unit}` : ""}`
      : "Meta qualitativa";

  const period = target.period === "day" ? "por dia" : target.period === "week" ? "por semana" : target.period;
  const mealType = target.mealType ? ` • ${target.mealType}` : "";

  return `${value} ${period}${mealType}`;
}

function formatNutritionTargetType(value: string) {
  switch (value) {
    case "meal":
      return "Refeicao";
    case "macro":
      return "Macro";
    case "hydration":
      return "Hidratacao";
    case "behavior":
      return "Habito";
    case "supplement":
      return "Suplemento";
    default:
      return "Meta";
  }
}
