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
            step.state === "completed" || step.done
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : step.state === "in_progress"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : step.state === "locked"
                  ? "border-slate-300 bg-slate-100 text-slate-400"
                  : "border-slate-200 bg-slate-50 text-slate-500"
          )}
        >
          <p className="font-medium">{step.label}</p>
          {step.summary ? <p className="mt-1 text-xs opacity-80">{step.summary}</p> : null}
        </div>
      ))}
    </div>
  );
}
