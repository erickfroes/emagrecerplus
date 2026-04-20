import { Card } from "@/components/ui/card";

export function WeeklyConsistencyCard({
  waterCount,
  mealCount,
  workoutCount,
  sleepCount,
  symptomCount,
}: {
  waterCount: number;
  mealCount: number;
  workoutCount: number;
  sleepCount: number;
  symptomCount: number;
}) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-950">Resumo da semana</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Agua</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{waterCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Refeicoes</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{mealCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Treinos</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{workoutCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 px-3 py-3">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Sono</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{sleepCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-100 px-3 py-3 sm:col-span-2">
          <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Sintomas registrados</p>
          <p className="mt-2 text-2xl font-semibold text-slate-950">{symptomCount}</p>
        </div>
      </div>
    </Card>
  );
}
