"use client";

import { useParams } from "next/navigation";
import { EncounterHeader } from "@/modules/clinical/components/encounter-header";
import { AnamnesisForm } from "@/modules/clinical/components/anamnesis-form";
import { ClinicalTaskEditor } from "@/modules/clinical/components/clinical-task-editor";
import { SoapNoteForm } from "@/modules/clinical/components/soap-note-form";
import { useEncounter } from "@/modules/clinical/hooks/use-encounter";

export default function EncounterDetailPage() {
  const params = useParams<{ id: string }>();
  const encounterId = params.id;
  const { data, isLoading, isError } = useEncounter(encounterId);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Carregando atendimento...</p>;
  }

  if (isError || !data) {
    return <p className="text-sm text-red-600">Erro ao carregar atendimento.</p>;
  }

  return (
    <div className="space-y-6">
      <EncounterHeader
        patientName={data.patient.name}
        appointmentType={data.appointment?.type ?? data.encounterType}
        professionalName={data.professional.name}
        status={data.status}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <AnamnesisForm
          encounterId={encounterId}
          initialValues={{
            chiefComplaint: data.anamnesis?.chiefComplaint ?? "",
            historyOfPresentIllness: data.anamnesis?.historyOfPresentIllness ?? "",
            pastMedicalHistory: data.anamnesis?.pastMedicalHistory ?? "",
            lifestyleHistory: data.anamnesis?.lifestyleHistory ?? "",
            notes: data.anamnesis?.notes ?? "",
          }}
        />

        <SoapNoteForm encounterId={encounterId} notes={data.notes} />
      </div>

      <ClinicalTaskEditor encounterId={encounterId} patientId={data.patient.id} items={data.tasks} />
    </div>
  );
}
