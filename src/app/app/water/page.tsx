"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function WaterLogPage() {
  const addWaterLog = usePatientAppStore((state) => state.addWaterLog);
  const totalToday = usePatientAppStore((state) =>
    state.waterLogs.reduce((sum, item) => sum + item.amountMl, 0)
  );
  const [manualAmount, setManualAmount] = useState("250");

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
            <Button key={amount} onClick={() => addWaterLog(amount)} variant="secondary">
              + {amount} ml
            </Button>
          ))}
        </div>

        <div className="mt-4 flex gap-3">
          <Input value={manualAmount} onChange={(event) => setManualAmount(event.target.value)} />
          <Button onClick={() => addWaterLog(Number(manualAmount) || 0)}>Adicionar</Button>
        </div>
      </Card>
    </div>
  );
}
