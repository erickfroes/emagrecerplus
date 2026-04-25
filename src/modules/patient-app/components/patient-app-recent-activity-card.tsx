import { Card } from "@/components/ui/card";
import {
  describePatientCheckInMood,
  formatPatientAppActivityTitle,
  formatPatientAppDateTime,
} from "@/modules/patient-app/formatters";
import type { PatientAppRecentActivity } from "@/modules/patient-app/types";

function resolveDescription(activity: PatientAppRecentActivity) {
  const mood = typeof activity.payload.mood === "string" ? activity.payload.mood : null;

  if (activity.eventType === "patient_app.daily_checkin.logged" && mood) {
    return `Humor do dia: ${describePatientCheckInMood(mood)}.`;
  }

  return activity.description ?? "Sem detalhes adicionais.";
}

export function PatientAppRecentActivityCard({
  items,
}: {
  items: PatientAppRecentActivity[];
}) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">Linha do dia</h2>
          <p className="mt-1 text-sm text-slate-500">As ultimas atualizacoes refletidas no backend.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {items.length} eventos
        </span>
      </div>

      {items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Sem atualizacoes recentes por enquanto.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-950">
                    {formatPatientAppActivityTitle(item.title)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPatientAppDateTime(item.eventAt)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">
                  {item.eventType.replaceAll("_", " ")}
                </span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{resolveDescription(item)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
