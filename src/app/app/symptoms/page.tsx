"use client";

import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { createPatientAppSymptomLog } from "@/modules/patient-app/api/patient-app";
import {
  describeSymptomSeverity,
  formatPatientAppDateTime,
} from "@/modules/patient-app/formatters";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";
import { usePatientAppLogMutation } from "@/modules/patient-app/hooks/use-patient-app-log-mutation";

function SymptomsLogContent() {
  const [symptomType, setSymptomType] = useState("Fome");
  const [severityScore, setSeverityScore] = useState("3");
  const [description, setDescription] = useState("");
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();
  const mutation = usePatientAppLogMutation(createPatientAppSymptomLog);

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  const recentLogs = data?.logs.symptoms ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Registrar sintomas</h1>
        <div className="mt-4 grid gap-3">
          <Input
            placeholder="Tipo de sintoma"
            value={symptomType}
            onChange={(event) => setSymptomType(event.target.value)}
          />
          <Input
            min={0}
            max={10}
            placeholder="Gravidade de 0 a 10"
            type="number"
            value={severityScore}
            onChange={(event) => setSeverityScore(event.target.value)}
          />
          <textarea
            className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
            placeholder="Descricao"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <Button
            disabled={mutation.isPending}
            onClick={() =>
              mutation.mutate({
                symptomType,
                severityScore: Number(severityScore),
                description,
              })
            }
          >
            {mutation.isPending ? "Salvando..." : "Salvar sintoma"}
          </Button>
          {mutation.isError ? (
            <p className="text-sm text-red-600">
              {mutation.error instanceof Error ? mutation.error.message : "Nao foi possivel salvar."}
            </p>
          ) : null}
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-semibold text-slate-950">Ultimos sintomas</h2>
        {isLoading ? <p className="mt-3 text-sm text-slate-500">Carregando registros...</p> : null}
        {isError ? (
          <p className="mt-3 text-sm text-red-600">
            {error instanceof Error ? error.message : "Erro inesperado."}
          </p>
        ) : null}
        {!isLoading && !isError && recentLogs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Nenhum sintoma registrado ainda.</p>
        ) : null}
        <div className="mt-3 grid gap-3">
          {recentLogs.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">{item.symptomType}</p>
                  <p className="mt-1 text-xs text-slate-500">{formatPatientAppDateTime(item.loggedAt)}</p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {describeSymptomSeverity(item.severityScore)}
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

export default function SymptomsLogPage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando registros...</p>
        </Card>
      }
    >
      <SymptomsLogContent />
    </Suspense>
  );
}
