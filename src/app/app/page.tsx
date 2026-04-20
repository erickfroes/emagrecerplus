"use client";

import { PatientHomeHeader } from "@/modules/patient-app/components/patient-home-header";
import { QuickHabitActions } from "@/modules/patient-app/components/quick-habit-actions";
import { UpcomingAppointmentCard } from "@/modules/patient-app/components/upcoming-appointment-card";
import { WeeklyConsistencyCard } from "@/modules/patient-app/components/weekly-consistency-card";
import { usePatientAppStore } from "@/modules/patient-app/state/patient-app-store";

export default function PatientAppHomePage() {
  const patientName = usePatientAppStore((state) => state.patientName);
  const nextAppointment = usePatientAppStore((state) => state.nextAppointment);
  const waterCount = usePatientAppStore((state) => state.waterLogs.length);
  const mealCount = usePatientAppStore((state) => state.mealLogs.length);
  const workoutCount = usePatientAppStore((state) => state.workoutLogs.length);
  const sleepCount = usePatientAppStore((state) => state.sleepLogs.length);
  const symptomCount = usePatientAppStore((state) => state.symptomLogs.length);

  return (
    <div className="space-y-6">
      <PatientHomeHeader patientName={patientName} />

      <UpcomingAppointmentCard
        dateLabel={nextAppointment.dateLabel}
        professional={nextAppointment.professional}
        type={nextAppointment.type}
      />

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-950">Atalhos rapidos</h2>
        <QuickHabitActions />
      </section>

      <WeeklyConsistencyCard
        mealCount={mealCount}
        sleepCount={sleepCount}
        symptomCount={symptomCount}
        waterCount={waterCount}
        workoutCount={workoutCount}
      />
    </div>
  );
}
