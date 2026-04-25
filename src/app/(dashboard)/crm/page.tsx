"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { usePermissions } from "@/hooks/use-permissions";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmKanbanBoard } from "@/modules/crm/components/crm-kanban-board";
import { CreateLeadModal } from "@/modules/crm/components/create-lead-modal";
import { useLeadsKanban } from "@/modules/crm/hooks/use-leads-kanban";

export default function CrmPage() {
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const router = useRouter();
  const { can } = usePermissions();
  const { data, isLoading, isError } = useLeadsKanban();

  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM"
        description="Gerencie leads, atividades e conversoes."
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push("/crm/catalog")}>
              Catalogo
            </Button>
            {can("crm:write") ? (
              <Button onClick={() => setIsCreateLeadOpen(true)}>
                Novo lead
              </Button>
            ) : null}
          </>
        }
      />

      <CreateLeadModal
        open={isCreateLeadOpen}
        onClose={() => setIsCreateLeadOpen(false)}
      />

      {isLoading ? <Skeleton className="h-80" /> : null}
      {isError ? <p className="text-sm text-red-600">Erro ao carregar funil.</p> : null}
      {data && data.columns.every((column) => column.items.length === 0) ? (
        <EmptyState
          title="Funil sem leads"
          description="Cadastre o primeiro lead desta unidade para iniciar o acompanhamento comercial."
          action={
            can("crm:write") ? (
              <Button onClick={() => setIsCreateLeadOpen(true)}>Novo lead</Button>
            ) : undefined
          }
        />
      ) : null}
      {data && data.columns.some((column) => column.items.length > 0) ? (
        <CrmKanbanBoard data={data} />
      ) : null}
    </div>
  );
}
