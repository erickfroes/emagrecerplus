"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { usePermissions } from "@/hooks/use-permissions";
import { LeadActivitiesManager } from "@/modules/crm/components/lead-activities-manager";
import { LeadActivitiesTimeline } from "@/modules/crm/components/lead-activities-timeline";
import { useConvertLead } from "@/modules/crm/hooks/use-convert-lead";
import { useMoveLeadStage } from "@/modules/crm/hooks/use-move-lead-stage";
import type { LeadListItem } from "@/types/api";

export function LeadDrawer({
  availableStages,
  lead,
  open,
  onOpenChange,
}: {
  availableStages: Array<{ code: string; title: string }>;
  lead: LeadListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { can } = usePermissions();
  const moveStageMutation = useMoveLeadStage();
  const convertLeadMutation = useConvertLead();
  const [selectedStageCode, setSelectedStageCode] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  useEffect(() => {
    if (!lead) {
      setSelectedStageCode("");
      setActionMessage(null);
      return;
    }

    const currentStage = availableStages.find((stage) => stage.title === lead.stage);
    setSelectedStageCode(currentStage?.code ?? availableStages[0]?.code ?? "");
    setActionMessage(null);
  }, [availableStages, lead]);

  if (!lead) {
    return null;
  }

  const currentLead = lead;
  const canWrite = can("crm:write");
  const currentStageCode =
    availableStages.find((stage) => stage.title === currentLead.stage)?.code ?? "";

  async function handleMoveStage() {
    if (!selectedStageCode || selectedStageCode === currentStageCode) {
      return;
    }

    await moveStageMutation.mutateAsync({
      id: currentLead.id,
      stageCode: selectedStageCode,
    });

    setActionMessage("Etapa atualizada com sucesso.");
    onOpenChange(false);
  }

  async function handleConvertLead() {
    const result = await convertLeadMutation.mutateAsync(currentLead.id);
    setActionMessage(
      result.reusedExistingPatient
        ? "Lead vinculado a um paciente existente."
        : "Lead convertido em paciente."
    );
    onOpenChange(false);
    router.push(`/patients/${result.patientId}`);
  }

  return (
    <Drawer
      title={lead.name}
      description="Resumo do lead e atividades recentes."
      open={open}
      onOpenChange={onOpenChange}
      footer={
        <>
          <Button
            type="button"
            variant="secondary"
            onClick={handleMoveStage}
            disabled={!canWrite || moveStageMutation.isPending || !selectedStageCode}
          >
            {moveStageMutation.isPending ? "Atualizando..." : "Atualizar etapa"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={handleConvertLead}
            disabled={!canWrite || convertLeadMutation.isPending}
          >
            {convertLeadMutation.isPending ? "Convertendo..." : "Converter em paciente"}
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Etapa</p>
          <div className="mt-2">
            <Badge>{lead.stage}</Badge>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Contato</p>
          <p className="mt-1 font-medium text-slate-950">{lead.phone ?? "-"}</p>
          <p className="mt-1 text-sm text-slate-500">{lead.email ?? "-"}</p>
          <p className="mt-2 text-sm text-slate-500">Origem: {lead.source ?? "-"}</p>
          <p className="text-sm text-slate-500">Responsavel: {lead.owner}</p>
        </div>

        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="text-sm text-slate-500">Mover etapa</p>
          <select
            className="field-base mt-3"
            value={selectedStageCode}
            onChange={(event) => setSelectedStageCode(event.target.value)}
            disabled={!canWrite}
          >
            {availableStages.map((stage) => (
              <option key={stage.code} value={stage.code}>
                {stage.title}
              </option>
            ))}
          </select>
          {!canWrite ? (
            <p className="mt-2 text-xs text-slate-500">
              Sua sessao pode visualizar o lead, mas nao alterar etapa nem converter.
            </p>
          ) : null}

          {moveStageMutation.isError ? (
            <p className="mt-2 text-xs text-red-600">Erro ao atualizar etapa do lead.</p>
          ) : null}
          {convertLeadMutation.isError ? (
            <p className="mt-2 text-xs text-red-600">Erro ao converter lead em paciente.</p>
          ) : null}
          {actionMessage ? (
            <p className="mt-2 text-xs text-emerald-700">{actionMessage}</p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="mb-3 text-sm font-medium text-slate-950">Linha do tempo</p>
          <LeadActivitiesTimeline activities={lead.timeline} />
        </div>

        <div className="rounded-2xl border border-slate-100 p-4">
          <p className="mb-3 text-sm font-medium text-slate-950">Atividades comerciais</p>
          <LeadActivitiesManager leadId={lead.id} canWrite={canWrite} />
        </div>
      </div>
    </Drawer>
  );
}
