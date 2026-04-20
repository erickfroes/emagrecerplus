"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CrmKanbanBoard } from "@/modules/crm/components/crm-kanban-board";
import { CreateLeadModal } from "@/modules/crm/components/create-lead-modal";
import { useLeadsKanban } from "@/modules/crm/hooks/use-leads-kanban";

export default function CrmPage() {
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const { data, isLoading, isError } = useLeadsKanban();

  return (
    <div className="space-y-4">
      <PageHeader
        title="CRM"
        description="Gerencie leads, atividades e conversoes."
        actions={
          <Button onClick={() => setIsCreateLeadOpen(true)}>
            Novo lead
          </Button>
        }
      />

      <CreateLeadModal
        open={isCreateLeadOpen}
        onClose={() => setIsCreateLeadOpen(false)}
      />

      {isLoading ? <Skeleton className="h-80" /> : null}
      {isError ? <p className="text-sm text-red-600">Erro ao carregar funil.</p> : null}
      {data ? <CrmKanbanBoard data={data} /> : null}
    </div>
  );
}