"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPatientAppWorkoutLog } from "@/modules/patient-app/api/patient-app";
import { formatPatientAppDateTime } from "@/modules/patient-app/formatters";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

function WorkoutsLogContent() {
  const [workoutType, setWorkoutType] = useState("Musculacao");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [intensity, setIntensity] = useState("Moderada");
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();
  const mutation = usePatientAppLogMutation(createPatientAppWorkoutLog);

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  const recentLogs = data?.logs.workouts ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Registrar treino</h1>
        <div className="mt-4 grid gap-3">
          <Input
            placeholder="Tipo de treino"
            value={workoutType}
            onChange={(event) => setWorkoutType(event.target.value)}
          />
          <Input
            placeholder="Duracao em minutos"
            type="number"
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(event.target.value)}
          />
          <Input
            placeholder="Intensidade"
            value={intensity}
            onChange={(event) => setIntensity(event.target.value)}
          />
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                workoutType,
                durationMinutes: Number(durationMinutes) || undefined,
                intensity,
                completed: true,
              })
            }
          >
            {mutation.isPending ? "Salvando..." : "Salvar treino"}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Ultimos treinos</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Carregando registros...</p> : null}
        {isError ? (
          <p className="mt-3 text-sm text-red-600">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
        ) : null}
        {!isLoading && !isError && recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum treino registrado ainda.</p>
        ) : null}
        <div className="mt-3 grid gap-3">
          {recentLogs.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{item.workoutType ?? "Treino"}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPatientAppDateTime(item.loggedAt)}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {item.durationMinutes ? `${item.durationMinutes} min` : "Sem duracao"}
                </span>
              </div>
              {item.intensity ? <p className="mt-3 text-sm text-slate-600">{item.intensity}</p> : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function WorkoutsLogPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando registros...</p>
        </Card>
      }
    >
      <WorkoutsLogContent />
    </Suspense>
  );
}
