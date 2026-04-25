"use client";

import { Suspense, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPatientAppSleepLog } from "@/modules/patient-app/api/patient-app";
import {
  describeSleepQuality,
  formatHours,
  formatPatientAppDate,
} from "@/modules/patient-app/formatters";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

function SleepLogContent() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [sleepDate, setSleepDate] = useState(today);
  const [hours, setHours] = useState("7.5");
  const [qualityScore, setQualityScore] = useState("7");
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();
  const mutation = usePatientAppLogMutation(createPatientAppSleepLog);

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  const recentLogs = data?.logs.sleep ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Registrar sono</h1>
        <div className="mt-4 grid gap-3">
          <Input type="date" value={sleepDate} onChange={(event) => setSleepDate(event.target.value)} />
          <Input
            placeholder="Horas dormidas"
            step="0.1"
            type="number"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
          />
          <Input
            min={1}
            max={10}
            placeholder="Qualidade de 1 a 10"
            type="number"
            value={qualityScore}
            onChange={(event) => setQualityScore(event.target.value)}
          />
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                sleepDate,
                hours: Number(hours) || undefined,
                qualityScore: Number(qualityScore) || undefined,
              })
            }
          >
            {mutation.isPending ? "Salvando..." : "Salvar sono"}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Ultimos registros de sono</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Carregando registros...</p> : null}
        {isError ? (
          <p className="mt-3 text-sm text-red-600">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
        ) : null}
        {!isLoading && !isError && recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum sono registrado ainda.</p>
        ) : null}
        <div className="mt-3 grid gap-3">
          {recentLogs.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{formatPatientAppDate(item.sleepDate)}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatHours(item.hours)}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {describeSleepQuality(item.qualityScore)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function SleepLogPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando registros...</p>
        </Card>
      }
    >
      <SleepLogContent />
    </Suspense>
  );
}
