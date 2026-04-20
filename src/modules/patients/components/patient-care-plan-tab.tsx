import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientCarePlanItem } from "@/types/api";

export function PatientCarePlanTab({ items }: { items: PatientCarePlanItem[] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Plano de cuidado</h2>
      <div className="space-y-3">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
              <div>
                <p className="text-sm font-medium text-slate-950">{item.title}</p>
                <p className="mt-1 text-xs text-slate-500">Prazo: {item.dueDate}</p>
              </div>
              <Badge tone={item.status === "Atrasado" ? "danger" : "default"}>{item.status}</Badge>
            </div>
          ))
        ) : (
          <p className="text-sm text-slate-500">Nenhum item de plano de cuidado criado.</p>
        )}
      </div>
    </Card>
  );
}
