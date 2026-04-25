import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function EncounterHeader({
  patientName,
  appointmentType,
  professionalName,
  status,
  action,
}: {
  patientName: string;
  appointmentType: string;
  professionalName: string;
  status: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-surface p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Atendimento - {patientName}</h1>
          <p className="mt-1 text-sm text-slate-500">{appointmentType} · {professionalName}</p>
        </div>
        <div className="flex flex-col items-start gap-3 lg:items-end">
          <Badge tone={status === "CLOSED" ? "success" : "default"}>{status}</Badge>
          {action}
        </div>
      </div>
    </div>
  );
}
