import { Card } from "@/components/ui/card";
import type { EncounterDetail } from "@/modules/clinical/types";

export function PrescriptionRecordForm({ items }: { items: EncounterDetail["prescriptions"] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Prescricao registrada</h2>
      <div className="space-y-2 text-sm text-slate-600">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-slate-100 px-3 py-2">
              <p className="font-medium text-slate-950">{item.type}</p>
              <p className="text-xs text-slate-500">{item.summary}</p>
            </div>
          ))
        ) : (
          <p>Nenhuma prescricao registrada ate o momento.</p>
        )}
      </div>
    </Card>
  );
}
