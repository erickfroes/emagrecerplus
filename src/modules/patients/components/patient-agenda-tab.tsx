import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientDetailsResponse } from "@/types/api";

export function PatientAgendaTab({
  agenda,
}: {
  agenda: PatientDetailsResponse["agenda"];
}) {
  return (
    <Card>
      <h2 className="mb-3 text-base font-semibold text-slate-950">Agenda</h2>
      <div className="space-y-3">
        {agenda.length ? (
          agenda.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-950">{item.dateTime}</p>
                <p className="text-xs text-slate-500">
                  {item.type} · {item.professional}
                </p>
              </div>
              <Badge tone={item.status === "Confirmado" ? "success" : "default"}>{item.status}</Badge>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhum compromisso agendado no momento.</p>
        )}
      </div>
    </Card>
  );
}
