"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function MealsLogPage() {
  const addMealLog = usePatientAppStore((state) => state.addMealLog);
  const [mealType, setMealType] = useState("Cafe da manha");
  const [description, setDescription] = useState("");
  const [adherence, setAdherence] = useState("Boa");

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-950">Registrar refeicao</h1>
      <div className="mt-4 grid gap-3">
        <Input placeholder="Tipo de refeicao" value={mealType} onChange={(event) => setMealType(event.target.value)} />
        <textarea
          className="min-h-28 w-full rounded-2xl border border-border p-3 text-sm focus-visible:ring-2"
          placeholder="Descricao curta"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Input placeholder="Aderencia percebida" value={adherence} onChange={(event) => setAdherence(event.target.value)} />
        <Button
          onClick={() =>
            addMealLog({
              mealType,
              description,
              adherence,
            })
          }
        >
          Salvar refeicao
        </Button>
      </div>
    </Card>
  );
}
