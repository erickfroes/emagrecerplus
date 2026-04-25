"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPatientAppWaterLog } from "@/modules/patient-app/api/patient-app";
import { formatPatientAppDateTime } from "@/modules/patient-app/formatters";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

function WaterLogContent() {
  const [manualAmount, setManualAmount] = useState("250");
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();
  const mutation = usePatientAppLogMutation(createPatientAppWaterLog);

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  const totalToday = data?.todayHydrationMl ?? 0;
  const recentLogs = data?.logs.hydration ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <p className="text-sm text-slate-500">Total do dia</p>
        <p className="mt-2 text-3xl font-semibold text-slate-950">{totalToday} ml</p>
      </Card>

      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Registrar agua</h1>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {[200, 300, 500].map((amount) => (
            <Button
              key={amount}
              onClick={() => mutation.mutate({ amountMl: amount })}
              variant="secondary"
              disabled={mutation.isPending}
            >
              + {amount} ml
            </Button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <Input value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} />
          <Button
            onClick={() => mutation.mutate({ amountMl: Number(manualAmount) || 0 })}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Salvando..." : "Adicionar"}
          </Button>
        </div>

        {mutation.isError ? (
          <p className="mt-3 text-sm text-red-600">
            {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
          </p>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Ultimos registros</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Carregando registros...</p> : null}
        {isError ? (
          <p className="mt-3 text-sm text-red-600">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
        ) : null}
        {!isLoading && !isError && recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhuma hidratacao registrada ainda.</p>
        ) : null}
        <div className="mt-3 grid gap-3">
          {recentLogs.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <p className="text-sm font-medium text-slate-950">{item.amountMl} ml</p>
              <p className="mt-1 text-xs text-slate-500">{formatPatientAppDateTime(item.loggedAt)}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export default function WaterLogPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando registros...</p>
        </Card>
      }
    >
      <WaterLogContent />
    </Suspense>
  );
}
