"use client";

import { useDeferredValue, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ClinicalTasksFilters } from "@/modules/clinical/components/clinical-tasks-filters";
import { ClinicalTasksTable } from "@/modules/clinical/components/clinical-tasks-table";
import { useClinicalTasks } from "@/modules/clinical/hooks/use-clinical-tasks";

export default function ClinicalTasksPage() {
  const [search, setSearch] = useState("");
  const [patient, setPatient] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search);
  const deferredPatient = useDeferredValue(patient);
  const { data, isLoading, isError } = useClinicalTasks({
    search: deferredSearch,
    patient: deferredPatient,
    priority,
    status,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Tarefas clinicas"
        description="Central de pendencias assistenciais e operacionais."
      />

      <ClinicalTasksFilters
        search={search}
        patient={patient}
        priority={priority}
        status={status}
        onSearchChange={setSearch}
        onPatientChange={setPatient}
        onPriorityChange={setPriority}
        onStatusChange={setStatus}
      />

      {isLoading ? <p className="text-sm text-slate-500">Carregando tarefas...</p> : null}
      {isError ? <p className="text-sm text-red-600">Erro ao carregar tarefas.</p> : null}
      {data ? <ClinicalTasksTable items={data.items} /> : null}
    </div>
  );
}
