"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function WorkoutsLogPage() {
  const addWorkoutLog = usePatientAppStore((state) => state.addWorkoutLog);
  const [workoutType, setWorkoutType] = useState("Musculacao");
  const [durationMinutes, setDurationMinutes] = useState("45");
  const [intensity, setIntensity] = useState("Moderada");

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-950">Registrar treino</h1>
      <div className="mt-4 grid gap-3">
        <Input placeholder="Tipo de treino" value={workoutType} onChange={(event) => setWorkoutType(event.target.value)} />
        <Input placeholder="Duracao em minutos" value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} />
        <Input placeholder="Intensidade" value={intensity} onChange={(event) => setIntensity(event.target.value)} />
        <Button
          onClick={() =>
            addWorkoutLog({
              workoutType,
              durationMinutes: Number(durationMinutes) || 0,
              intensity,
              completed: true,
            })
          }
        >
          Salvar treino
        </Button>
      </div>
    </Card>
  );
}
