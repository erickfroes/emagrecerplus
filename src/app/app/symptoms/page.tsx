"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function SymptomsLogPage() {
  const addSymptomLog = usePatientAppStore((state) => state.addSymptomLog);
  const [symptomType, setSymptomType] = useState("Fome");
  const [severity, setSeverity] = useState("Leve");
  const [description, setDescription] = useState("");

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-950">Registrar sintomas</h1>
      <div className="mt-4 grid gap-3">
        <Input placeholder="Tipo de sintoma" value={symptomType} onChange={(event) => setSymptomType(event.target.value)} />
        <Input placeholder="Severidade" value={severity} onChange={(event) => setSeverity(event.target.value)} />
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:ring-2 focus-visible:ring-slate-900/10"
          placeholder="Descricao"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button
          onClick={() =>
            addSymptomLog({
              symptomType,
              severity,
              description,
            })
          }
        >
          Salvar sintoma
        </Button>
      </div>
    </Card>
  );
}
