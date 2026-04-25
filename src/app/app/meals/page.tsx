"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPatientAppMealLog } from "@/modules/patient-app/api/patient-app";
import {
  describeMealAdherence,
  formatPatientAppDateTime,
} from "@/modules/patient-app/formatters";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

const adherenceOptions = [
  { value: 5, label: "Excelente" },
  { value: 4, label: "Boa" },
  { value: 3, label: "Ok" },
  { value: 2, label: "Baixa" },
  { value: 1, label: "Ruim" },
];

function MealsLogContent() {
  const [mealType, setMealType] = useState("Cafe da manha");
  const [description, setDescription] = useState("");
  const [adherenceRating, setAdherenceRating] = useState("4");
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();
  const mutation = usePatientAppLogMutation(createPatientAppMealLog);

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  const recentLogs = data?.logs.meals ?? [];
  const nutritionPlan = data?.nutritionPlan ?? null;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-600">
              Plano nutricional vigente
            </p>
            <h1 className="text-lg font-semibold text-slate-950">
              {nutritionPlan?.currentVersion?.title ?? nutritionPlan?.name ?? "Plano ainda nao estruturado"}
            </h1>
            <p className="text-sm text-slate-500">
              {nutritionPlan?.currentVersion?.summary ??
                nutritionPlan?.summary ??
                "Assim que a equipe estruturar o plano, as metas diarias vao aparecer aqui."}
            </p>
          </div>
          {nutritionPlan?.currentVersion ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Versao {nutritionPlan.currentVersion.versionNumber}
            </div>
          ) : null}
        </div>

        {nutritionPlan?.targets.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {nutritionPlan.targets.slice(0, 4).map((targetItem) => (
              <div key={targetItem.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-slate-950">{targetItem.label}</p>
                    <p className="mt-1 text-xs text-slate-500">{formatTargetGoal(targetItem)}</p>
                  </div>
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    {formatTargetType(targetItem.type)}
                  </span>
                </div>
                {targetItem.guidance ? (
                  <p className="mt-3 text-sm text-slate-600">{targetItem.guidance}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}

        {nutritionPlan?.currentVersion?.guidance ? (
          <p className="mt-4 text-sm text-slate-600">{nutritionPlan.currentVersion.guidance}</p>
        ) : null}
      </Card>

      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Registrar refeicao</h1>
        <div className="mt-4 grid gap-3">
          <Input
            placeholder="Tipo de refeicao"
            value={mealType}
            onChange={(event) => setMealType(event.target.value)}
          />
          <textarea
            className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:ring-2"
            placeholder="Descricao curta"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <select
            className="h-11 rounded-2xl border border-border bg-transparent px-3 text-sm"
            value={adherenceRating}
            onChange={(event) => setAdherenceRating(event.target.value)}
          >
            {adherenceOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                mealType,
                description,
                adherenceRating: Number(adherenceRating) || undefined,
              })
            }
          >
            {mutation.isPending ? "Salvando..." : "Salvar refeicao"}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Ultimas refeicoes</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Carregando registros...</p> : null}
        {isError ? (
          <p className="mt-3 text-sm text-red-600">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
        ) : null}
        {!isLoading && !isError && recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhuma refeicao registrada ainda.</p>
        ) : null}
        <div className="mt-3 grid gap-3">
          {recentLogs.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{item.mealType ?? "Refeicao"}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPatientAppDateTime(item.loggedAt)}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {describeMealAdherence(item.adherenceRating)}
                </span>
              </div>
              {item.description ? <p className="mt-3 text-sm text-slate-600">{item.description}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function MealsLogPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando registros...</p>
        </Card>
      }
    >
      <MealsLogContent />
    </Suspense>
  );
}

function formatTargetGoal(target: {
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

function formatTargetType(value: string) {
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
