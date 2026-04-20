"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const views = [
  { id: "day", label: "Dia" },
  { id: "week", label: "Semana" },
  { id: "list", label: "Lista" },
] as const;

export function ScheduleToolbar({
  date,
  unit,
  professional,
  status,
  currentView,
  onDateChange,
  onUnitChange,
  onProfessionalChange,
  onStatusChange,
  onTodayClick,
  onViewChange,
}: {
  date: string;
  unit: string;
  professional: string;
  status: string;
  currentView: "day" | "week" | "list";
  onDateChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  onProfessionalChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTodayClick: () => void;
  onViewChange: (view: "day" | "week" | "list") => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface p-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid gap-3 md:grid-cols-4">
          <Input type="date" value={date} onChange={(e) => onDateChange(e.target.value)} />
          <Input
            placeholder="Filtrar por unidade"
            value={unit}
            onChange={(e) => onUnitChange(e.target.value)}
          />
          <Input
            placeholder="Filtrar por profissional"
            value={professional}
            onChange={(e) => onProfessionalChange(e.target.value)}
          />
          <select
            className="field-base"
            value={status}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            <option value="">Todos os status</option>
            <option value="Agendado">Agendado</option>
            <option value="Confirmado">Confirmado</option>
            <option value="Check-in">Check-in</option>
            <option value="Em atendimento">Em atendimento</option>
            <option value="Concluido">Concluido</option>
            <option value="Cancelado">Cancelado</option>
            <option value="No-show">No-show</option>
          </select>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={onTodayClick}>
            Hoje
          </Button>
          {views.map((view) => (
            <button
              key={view.id}
              className={cn(
                "rounded-2xl border px-4 py-2 text-sm font-medium transition",
                currentView === view.id
                  ? "border-slate-950 bg-slate-950 text-white"
                  : "border-border bg-surface text-slate-600 hover:bg-slate-50"
              )}
              onClick={() => onViewChange(view.id)}
              type="button"
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
