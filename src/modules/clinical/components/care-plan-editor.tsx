import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { EncounterDetail } from "@/modules/clinical/types";

export function CarePlanEditor({ items }: { items: EncounterDetail["carePlan"] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Plano de cuidado</h2>
      <div className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 px-3 py-2">
            <div>
              <p className="font-medium text-slate-950">{item.title}</p>
              <p className="text-xs text-slate-500">Prazo: {item.dueDate}</p>
            </div>
            <Badge>{item.status}</Badge>
          </div>
        ))}
      </div>
    </Card>
  );
}
