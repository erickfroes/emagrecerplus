"use client";

import { useState } from "react";
import { PatientAppQuickActionModal } from "@/modules/patient-app/components/patient-app-quick-action-modal";
import type { DailyCheckIn, PatientAppAccessState } from "@/modules/patient-app/types";
import type { PatientAppQuickActionId } from "./patient-app-quick-action-modal";

type ActionCard = {
  id: PatientAppQuickActionId;
  label: string;
  helper: string;
};

export function QuickHabitActions({
  accessState,
  todayCheckIn,
  todayHydrationMl,
}: {
  accessState?: PatientAppAccessState | null;
  todayCheckIn: DailyCheckIn | null;
  todayHydrationMl: number;
}) {
  const [activeAction, setActiveAction] = useState<PatientAppQuickActionId | null>(null);
  const habitLogsFeature = accessState?.features.habitLogs;
  const habitLogsEnabled = habitLogsFeature?.enabled ?? true;
  const unavailableReason = habitLogsFeature?.reason ?? "Indisponivel no momento.";

  const actions: ActionCard[] = [
    {
      id: "daily-checkin",
      label: "Check-in",
      helper: habitLogsEnabled
        ? todayCheckIn
          ? "Check-in de hoje concluido"
          : "Registrar como voce esta hoje"
        : unavailableReason,
    },
    {
      id: "water",
      label: "Agua",
      helper: habitLogsEnabled
        ? todayHydrationMl > 0
          ? `${todayHydrationMl} ml registrados hoje`
          : "Registrar hidratacao"
        : unavailableReason,
    },
    {
      id: "meal",
      label: "Refeicoes",
      helper: habitLogsEnabled ? "Registrar alimentacao" : unavailableReason,
    },
    {
      id: "workout",
      label: "Treino",
      helper: habitLogsEnabled ? "Marcar atividade" : unavailableReason,
    },
    {
      id: "sleep",
      label: "Sono",
      helper: habitLogsEnabled ? "Registrar descanso" : unavailableReason,
    },
    {
      id: "symptom",
      label: "Sintomas",
      helper: habitLogsEnabled ? "Informar percepcoes" : unavailableReason,
    },
  ];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => {
              if (habitLogsEnabled) {
                setActiveAction(action.id);
              }
            }}
            disabled={!habitLogsEnabled}
            className="rounded-3xl border border-border bg-surface px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            <p className="text-base font-semibold text-slate-950">{action.label}</p>
            <p className="mt-2 text-sm text-slate-500">{action.helper}</p>
          </button>
        ))}
      </div>

      <PatientAppQuickActionModal
        action={activeAction}
        open={activeAction !== null}
        onOpenChange={(open) => {
          if (!open) {
            setActiveAction(null);
          }
        }}
      />
    </>
  );
}
