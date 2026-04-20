import { Card } from "@/components/ui/card";
import { formatShortDateTime } from "@/lib/utils";
import type { PatientDetailsResponse } from "@/types/api";

function formatFlag(flag: string) {
  return flag.replaceAll("_", " ");
}

function formatDate(value?: string | null) {
  return value ? formatShortDateTime(value) : "-";
}

export function PatientSummaryTab({
  summary,
}: {
  summary: PatientDetailsResponse["summary"];
}) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Resumo</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 text-sm text-slate-600">
          <p>Meta principal: {summary.mainGoal ?? "-"}</p>
          <p>Ultima consulta: {formatDate(summary.lastConsultation)}</p>
          <p>Proxima consulta: {formatDate(summary.nextConsultation)}</p>
        </div>
        <div className="space-y-2 text-sm text-slate-600">
          <p>
            Flags ativas:{" "}
            {summary.activeFlags.length ? summary.activeFlags.map(formatFlag).join(", ") : "Nenhuma"}
          </p>
          <p>Tarefas em aberto: {summary.openTasks}</p>
          <p>Aderencia: {summary.adherence}</p>
        </div>
      </div>
    </Card>
  );
}
