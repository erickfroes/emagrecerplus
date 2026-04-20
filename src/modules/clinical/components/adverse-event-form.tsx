import { Card } from "@/components/ui/card";
import type { EncounterDetail } from "@/modules/clinical/types";

export function AdverseEventForm({ items }: { items: EncounterDetail["adverseEvents"] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Eventos adversos</h2>
      <div className="space-y-2 text-sm text-slate-600">
        {items.length ? (
          items.map((item) => (
            <div key={item.id} className="rounded-2xl border border-red-100 bg-red-50 px-3 py-2 text-red-700">
              <p className="font-medium">{item.type}</p>
              <p className="text-xs">
                Severidade: {item.severity} · Status: {item.status}
              </p>
              <p className="mt-1 text-xs">{item.description}</p>
            </div>
          ))
        ) : (
          <p>Nenhum evento adverso registrado.</p>
        )}
      </div>
    </Card>
  );
}
