import { cn } from "@/lib/utils";
import type { EncounterStep } from "@/modules/clinical/types";

export function EncounterStepper({ steps }: { steps: EncounterStep[] }) {
  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 md:grid-cols-4">
      {steps.map((step) => (
        <div
          key={step.id}
          className={cn(
            "rounded-2xl border px-4 py-3 text-sm",
            step.done
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-50 text-slate-500"
          )}
        >
          {step.label}
        </div>
      ))}
    </div>
  );
}
