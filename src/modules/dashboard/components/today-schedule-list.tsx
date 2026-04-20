import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { DashboardAppointment } from "@/modules/dashboard/types";

export function TodayScheduleList({ items }: { items: DashboardAppointment[] }) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950">Agenda do dia</h2>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
            <div>
              <p className="text-sm font-medium text-slate-950">
                {item.time} · {item.patient}
              </p>
              <p className="text-xs text-slate-500">
                {item.type} · {item.professional}
              </p>
            </div>
            <Badge
              tone={
                item.status === "completed"
                  ? "success"
                  : item.status === "no_show"
                    ? "danger"
                    : item.status === "confirmed"
                      ? "default"
                      : "warning"
              }
            >
              {item.status}
            </Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
