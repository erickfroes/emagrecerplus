"use client";

import { Suspense } from "react";
import { Card } from "@/components/ui/card";
import { PatientAppAccessCard } from "@/modules/patient-app/components/patient-app-access-card";
import { PatientAppRecentActivityCard } from "@/modules/patient-app/components/patient-app-recent-activity-card";
import { PatientAppTargetCard } from "@/modules/patient-app/components/patient-app-target-card";
import { PatientHomeHeader } from "@/modules/patient-app/components/patient-home-header";
import { QuickHabitActions } from "@/modules/patient-app/components/quick-habit-actions";
import { UpcomingAppointmentCard } from "@/modules/patient-app/components/upcoming-appointment-card";
import { WeeklyConsistencyCard } from "@/modules/patient-app/components/weekly-consistency-card";
import {
  describePatientCheckInMood,
  formatPatientAppDateTime,
} from "@/modules/patient-app/formatters";
import { usePatientAppCockpit } from "@/modules/patient-app/hooks/use-patient-app-cockpit";

function PatientAppHomeContent() {
  const { data, isLoading, isError, error, target } = usePatientAppCockpit();

  if (target.requiresPreviewPatient) {
    return <PatientAppTargetCard />;
  }

  if (isLoading) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Carregando cockpit do paciente...</p>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <h1 className="text-lg font-semibold text-slate-950">Nao foi possivel carregar o cockpit</h1>
        <p className="mt-2 text-sm text-red-600">
          {error instanceof Error ? error.message : "Erro inesperado."}
        </p>
      </Card>
    );
  }

  const patientName = data?.patient.name ?? "Paciente";
  const nextAppointment = data?.nextAppointment;
  const weeklyCounts = data?.weeklyCounts;
  const todayCheckIn = data?.todayCheckIn ?? null;
  const recentActivity = data?.recentActivity ?? [];
  const commercialContext = data?.commercialContext ?? null;
  const accessState = data?.accessState ?? null;

  return (
    <div className="space-y-6">
      <PatientHomeHeader patientName={patientName} />

      <UpcomingAppointmentCard
        dateLabel={nextAppointment ? formatPatientAppDateTime(nextAppointment.startsAt) : "Sem agendamento futuro"}
        professional={nextAppointment?.professional ?? "Equipe clinica"}
        type={nextAppointment?.type ?? "Aguardando definicao"}
      />

      <PatientAppAccessCard commercialContext={commercialContext} accessState={accessState} />

      {data?.patient.mainGoal ? (
        <Card>
          <p className="text-sm text-slate-500">Foco atual do plano</p>
          <p className="mt-2 text-base font-medium text-slate-950">{data.patient.mainGoal}</p>
        </Card>
      ) : null}

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Check-in de hoje</p>
            <p className="mt-2 text-base font-medium text-slate-950">
              {todayCheckIn ? describePatientCheckInMood(todayCheckIn.mood) : "Pendente"}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
            {todayCheckIn ? "Concluido" : "Aguardando"}
          </span>
        </div>
        <p className="mt-3 text-sm text-slate-500">
          {todayCheckIn
            ? `Atualizado em ${formatPatientAppDateTime(todayCheckIn.loggedAt)}.`
            : "Preencha o check-in para orientar melhor o acompanhamento da equipe."}
        </p>
      </Card>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950">Atalhos rapidos</h2>
        <QuickHabitActions
          accessState={accessState}
          todayCheckIn={todayCheckIn}
          todayHydrationMl={data?.todayHydrationMl ?? 0}
        />
      </section>

      <WeeklyConsistencyCard
        checkinCount={weeklyCounts?.checkinCount ?? 0}
        mealCount={weeklyCounts?.mealCount ?? 0}
        sleepCount={weeklyCounts?.sleepCount ?? 0}
        symptomCount={weeklyCounts?.symptomCount ?? 0}
        waterCount={weeklyCounts?.waterCount ?? 0}
        workoutCount={weeklyCounts?.workoutCount ?? 0}
      />

      <PatientAppRecentActivityCard items={recentActivity} />
    </div>
  );
}

export default function PatientAppHomePage() {
  return (
    <Suspense
      fallback={
        <Card>
          <p className="text-sm text-slate-500">Carregando cockpit do paciente...</p>
        </Card>
      }
    >
      <PatientAppHomeContent />
    </Suspense>
  );
}
