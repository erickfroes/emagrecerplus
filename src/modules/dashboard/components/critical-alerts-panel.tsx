import { Card } from "@/components/ui/card";

export function CriticalAlertsPanel({
  items,
}: {
  items: Array<{ id: string; title: string; description: string }>;
}) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Pendências críticas</h2>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.id} className="rounded-2xl border border-red-100 bg-red-50 p-3">
            <p className="text-sm font-medium text-red-800">{item.title}</p>
            <p className="mt-1 text-xs text-red-700">{item.description}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
