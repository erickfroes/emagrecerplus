"use client";

import { useParams } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { PatientAgendaTab } from "@/modules/patients/components/patient-agenda-tab";
import { PatientCarePlanTab } from "@/modules/patients/components/patient-care-plan-tab";
import { PatientHabitsTab } from "@/modules/patients/components/patient-habits-tab";
import { PatientHeader } from "@/modules/patients/components/patient-header";
import { PatientSummaryTab } from "@/modules/patients/components/patient-summary-tab";
import { PatientTabs } from "@/modules/patients/components/patient-tabs";
import { PatientTasksTab } from "@/modules/patients/components/patient-tasks-tab";
import { PatientTimeline } from "@/modules/patients/components/patient-timeline";
import { usePatientDetails } from "@/modules/patients/hooks/use-patient-details";

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;
  const { data, isLoading, isError } = usePatientDetails(patientId);

  return (
    <div className="space-y-6">
      <PageHeader title="Paciente" description="Visao 360 do cadastro, agenda e acompanhamento." />

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-80" />
        </div>
      ) : null}

      {isError ? <p className="text-sm text-red-600">Erro ao carregar paciente.</p> : null}

      {data ? (
        <>
          <PatientHeader
            age={data.age}
            email={data.email ?? "-"}
            flags={data.flags}
            name={data.name}
            phone={data.phone ?? "-"}
            tags={data.tags}
          />

          <PatientTabs
            items={[
              {
                id: "summary",
                label: "Resumo",
                content: <PatientSummaryTab summary={data.summary} />,
              },
              {
                id: "agenda",
                label: "Agenda",
                content: <PatientAgendaTab agenda={data.agenda} />,
              },
              {
                id: "timeline",
                label: "Prontuario",
                content: <PatientTimeline items={data.timeline} />,
              },
              {
                id: "care-plan",
                label: "Plano de cuidado",
                content: <PatientCarePlanTab items={data.carePlan} />,
              },
              {
                id: "tasks",
                label: "Tarefas",
                content: <PatientTasksTab tasks={data.tasks} />,
              },
              {
                id: "habits",
                label: "Habitos",
                content: <PatientHabitsTab habits={data.habits} />,
              },
            ]}
          />
        </>
      ) : null}
    </div>
  );
}
