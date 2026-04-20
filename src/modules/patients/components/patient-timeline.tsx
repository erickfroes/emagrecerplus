import { Card } from "@/components/ui/card";
import type { PatientTimelineItem } from "@/types/api";

export function PatientTimeline({ items }: { items: PatientTimelineItem[] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Prontuario</h2>
      <div className="space-y-4">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="relative border-l border-slate-200 pl-4">
              <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-slate-950" />
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{item.dateLabel}</p>
              <p className="mt-2 text-sm font-medium text-slate-950">{item.title}</p>
              <p className="mt-1 text-sm text-slate-500">{item.description}</p>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhum registro clinico disponivel.</p>
        )}
      </div>
    </Card>
  );
}
