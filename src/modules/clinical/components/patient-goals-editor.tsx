import { Card } from "@/components/ui/card";
import type { EncounterDetail } from "@/modules/clinical/types";

export function PatientGoalsEditor({ items }: { items: EncounterDetail["goals"] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Metas do paciente</h2>
      <div className="space-y-2 text-sm text-slate-600">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 px-3 py-2">
            <p className="font-medium text-slate-950">{item.title}</p>
            <p className="text-xs text-slate-500">
              {item.type} · Alvo: {item.targetValue} · Prazo: {item.dueDate}
            </p>
          </div>
        ))}
      </div>
    </Card>
  );
}
