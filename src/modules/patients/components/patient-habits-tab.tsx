import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientHabitCard } from "@/types/api";

export function PatientHabitsTab({ habits }: { habits: PatientHabitCard[] }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Habitos</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {habits.map((item) => (
          <div key={item.id} className="rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{item.label}</p>
              <Badge tone={item.trend === "down" ? "danger" : item.trend === "up" ? "success" : "default"}>
                {item.trend}
              </Badge>
            </div>
            <p className="mt-3 text-2xl font-semibold text-slate-950">{item.value}</p>
            <p className="mt-2 text-xs text-slate-500">{item.helper}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
