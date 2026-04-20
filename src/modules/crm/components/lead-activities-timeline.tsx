import { Badge } from "@/components/ui/badge";

type LeadTimelineItem = {
  id: string;
  kind: "activity" | "stage";
  title: string;
  description: string;
  dateLabel: string;
};

export function LeadActivitiesTimeline({ activities }: { activities: LeadTimelineItem[] }) {
  if (!activities.length) {
    return <p className="text-sm text-slate-500">Sem atividades registradas para este lead.</p>;
  }

  return (
    <div className="space-y-3">
      {activities.map((activity) => (
        <div key={activity.id} className="rounded-2xl border border-slate-100 p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-950">{activity.title}</p>
              <p className="mt-1 text-sm text-slate-600">{activity.description}</p>
            </div>
            <Badge tone={activity.kind === "activity" ? "warning" : "default"}>
              {activity.kind === "activity" ? "Atividade" : "Etapa"}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-slate-500">{activity.dateLabel}</p>
        </div>
      ))}
    </div>
  );
}
