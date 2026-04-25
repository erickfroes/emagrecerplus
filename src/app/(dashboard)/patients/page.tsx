"use client";

import { useDeferredValue, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePermissions } from "@/hooks/use-permissions";
import { PatientsFilters } from "@/modules/patients/components/patients-filters";
import { PatientsTable } from "@/modules/patients/components/patients-table";
import { usePatients } from "@/modules/patients/hooks/use-patients";
import { CreatePatientModal } from "@/modules/patients/components/create-patient-modal";

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [flag, setFlag] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const deferredTag = useDeferredValue(tag);
  const deferredFlag = useDeferredValue(flag);
  const { can } = usePermissions();
  const { data, isLoading, isError } = usePatients({
    search: deferredSearch,
    status,
    tag: deferredTag,
    flag: deferredFlag,
  });

  return (
    <div>
      <PageHeader
        title="Pacientes"
        description="Gerencie cadastro, acompanhamento e acesso rápido à ficha."
        actions={
          can("patients:write") ? (
            <Button onClick={() => setModalOpen(true)}>Novo paciente</Button>
          ) : null
        }
      />
      <div className="space-y-4">
        <PatientsFilters
          search={search}
          status={status}
          tag={tag}
          flag={flag}
          onSearchChange={setSearch}
          onStatusChange={setStatus}
          onTagChange={setTag}
          onFlagChange={setFlag}
        />
        {isLoading ? <p className="text-sm text-slate-500">Carregando pacientes...</p> : null}
        {isError ? <p className="text-sm text-red-600">Erro ao carregar pacientes.</p> : null}
        {data && data.items.length === 0 ? (
          <EmptyState
            title="Nenhum paciente encontrado"
            description="Ajuste os filtros ou cadastre um novo paciente para iniciar o acompanhamento."
            action={
              can("patients:write") ? (
                <Button onClick={() => setModalOpen(true)}>Cadastrar paciente</Button>
              ) : undefined
            }
          />
        ) : null}
        {data && data.items.length > 0 ? (
          <PatientsTable
            rows={data.items.map((item) => ({
              id: item.id,
              name: item.name,
              phone: item.phone ?? "-",
              email: item.email ?? "-",
              status: item.status,
              tags: item.tags,
              nextAppointment: item.nextAppointment ?? null,
              flags: item.flags ?? [],
              lastConsultation: item.lastConsultation ?? null,
            }))}
          />
        ) : null}
      </div>

      <CreatePatientModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
