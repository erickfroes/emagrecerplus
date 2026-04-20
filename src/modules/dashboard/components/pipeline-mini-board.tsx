import { Card } from "@/components/ui/card";
import type { DashboardSummaryResponse } from "@/types/api";

export function PipelineMiniBoard({
  items,
}: {
  items: DashboardSummaryResponse["pipeline"];
}) {
  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-950">Funil resumido</h2>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {items.map((item) => (
          <div key={item.code} className="rounded-2xl border border-slate-100 px-3 py-4">
            <p className="text-xs uppercase tracking-[0.12em] text-slate-400">{item.title}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{item.count}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
