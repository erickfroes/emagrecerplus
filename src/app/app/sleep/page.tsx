"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function SleepLogPage() {
  const addSleepLog = usePatientAppStore((state) => state.addSleepLog);
  const [hours, setHours] = useState("7.5");
  const [quality, setQuality] = useState("Boa");

  return (
    <Card>
      <h1 className="text-lg font-semibold text-slate-950">Registrar sono</h1>
      <div className="mt-4 grid gap-3">
        <Input placeholder="Horas dormidas" value={hours} onChange={(event) => setHours(event.target.value)} />
        <Input placeholder="Qualidade do sono" value={quality} onChange={(event) => setQuality(event.target.value)} />
        <Button
          onClick={() =>
            addSleepLog({
              hours: Number(hours) || 0,
              quality,
            })
          }
        >
          Salvar sono
        </Button>
      </div>
    </Card>
  );
}
