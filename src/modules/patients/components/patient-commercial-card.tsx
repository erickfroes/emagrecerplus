"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { usePermissions } from "@/hooks/use-permissions";
import { env } from "@/lib/env";
import { useCommercialCatalog } from "@/modules/crm/hooks/use-commercial-catalog";
import { useCreatePatientEnrollment } from "@/modules/patients/hooks/use-create-patient-enrollment";
import type { PatientCommercialContext } from "@/types/api";

function formatStatusLabel(value?: string | null) {
  if (!value) {
    return "-";
  }

  return value.replaceAll("_", " ");
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatCurrency(value?: number | string | null, currencyCode?: string | null) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyCode ?? "BRL",
  }).format(parsed);
}

function renewalRiskTone(value?: string | null): "default" | "success" | "warning" | "danger" {
  switch (value) {
    case "high":
    case "expired":
      return "danger";
    case "medium":
      return "warning";
    case "none":
      return "success";
    default:
      return "default";
  }
}

function renewalRiskLabel(value?: string | null) {
  switch (value) {
    case "high":
      return "Renovacao critica";
    case "medium":
      return "Renovacao proxima";
    case "expired":
      return "Vencido";
    case "none":
      return "Vigencia estavel";
    default:
      return "Sem vigencia";
  }
}

export function PatientCommercialCard({
  patientId,
  commercialContext,
}: {
  patientId: string;
  commercialContext?: PatientCommercialContext | null;
}) {
  const { can } = usePermissions();
  const canEnroll = env.authMode === "real" && can("crm:write");
  const [open, setOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [selectedPackageId, setSelectedPackageId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const createEnrollmentMutation = useCreatePatientEnrollment(patientId);
  const catalogQuery = useCommercialCatalog();
  const catalog = catalogQuery.data;

  const availablePrograms = catalog?.programs ?? [];
  const packageIdSetForProgram = useMemo(() => {
    if (!selectedProgramId || !catalog) {
      return new Set<string>();
    }

    return new Set(
      catalog.programPackages
        .filter((item) => item.programId === selectedProgramId)
        .map((item) => item.packageId)
    );
  }, [catalog, selectedProgramId]);

  const availablePackages = useMemo(() => {
    if (!catalog) {
      return [];
    }

    if (!selectedProgramId) {
      return catalog.packages;
    }

    return catalog.packages.filter((item) => packageIdSetForProgram.has(item.id));
  }, [catalog, packageIdSetForProgram, selectedProgramId]);

  useEffect(() => {
    if (!open || !catalog) {
      return;
    }

    const firstProgramId = selectedProgramId || availablePrograms[0]?.id || "";
    const firstPackageId =
      availablePackages.find((item) => item.id === selectedPackageId)?.id ??
      availablePackages[0]?.id ??
      "";

    if (!selectedProgramId && firstProgramId) {
      setSelectedProgramId(firstProgramId);
    }

    if (firstPackageId !== selectedPackageId) {
      setSelectedPackageId(firstPackageId);
    }
  }, [availablePackages, availablePrograms, catalog, open, selectedPackageId, selectedProgramId]);

  const currentProgram = availablePrograms.find((item) => item.id === selectedProgramId) ?? null;
  const currentPackage = availablePackages.find((item) => item.id === selectedPackageId) ?? null;
  const hasCommercialContext = commercialContext?.hasCommercialContext === true;

  async function handleSubmit() {
    if (!selectedProgramId || !selectedPackageId) {
      setFormError("Selecione um programa e um pacote para concluir a matricula.");
      return;
    }

    setFormError(null);

    try {
      await createEnrollmentMutation.mutateAsync({
        programId: selectedProgramId,
        packageId: selectedPackageId,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        notes: notes.trim() || undefined,
        source: "patient_360",
        metadata: {
          origin: "patient_summary_card",
        },
      });

      setOpen(false);
      setNotes("");
      setStartDate("");
      setEndDate("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Nao foi possivel criar a matricula.");
    }
  }

  return (
    <>
      <Card className="border border-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-slate-950">Comercial</h2>
              <Badge tone={renewalRiskTone(commercialContext?.vigency?.renewalRisk)}>
                {renewalRiskLabel(commercialContext?.vigency?.renewalRisk)}
              </Badge>
            </div>

            {!hasCommercialContext ? (
              <p className="mt-3 text-sm text-slate-600">
                Este paciente ainda nao tem matricula ativa nem beneficios comerciais materializados
                no runtime.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2 text-sm text-slate-600">
                  <p>
                    Programa:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.program?.name ?? "-"}
                    </span>
                  </p>
                  <p>
                    Pacote:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.package?.name ?? "-"}
                    </span>
                  </p>
                  <p>
                    Status da matricula:{" "}
                    <span className="font-medium text-slate-950">
                      {formatStatusLabel(commercialContext?.enrollment?.status)}
                    </span>
                  </p>
                  <p>
                    Inicio:{" "}
                    <span className="font-medium text-slate-950">
                      {formatDate(commercialContext?.vigency?.startDate)}
                    </span>
                  </p>
                  <p>
                    Fim:{" "}
                    <span className="font-medium text-slate-950">
                      {formatDate(commercialContext?.vigency?.endDate)}
                    </span>
                  </p>
                </div>

                <div className="space-y-2 text-sm text-slate-600">
                  <p>
                    Tier:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.benefits?.tier ?? commercialContext?.package?.tier ?? "-"}
                    </span>
                  </p>
                  <p>
                    Comunidade:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.benefits?.allowsCommunity ? "Liberada" : "Nao liberada"}
                    </span>
                  </p>
                  <p>
                    Chat prioritario:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.benefits?.chatPriority ? "Sim" : "Nao"}
                    </span>
                  </p>
                  <p>
                    Pendencias:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.financialSummary?.pendingCount ?? 0}
                    </span>
                  </p>
                  <p>
                    Valor pendente:{" "}
                    <span className="font-medium text-slate-950">
                      {formatCurrency(
                        commercialContext?.financialSummary?.pendingAmount,
                        commercialContext?.financialSummary?.currencyCode ??
                          commercialContext?.package?.currencyCode
                      )}
                    </span>
                  </p>
                  <p>
                    Valor vencido:{" "}
                    <span className="font-medium text-slate-950">
                      {formatCurrency(
                        commercialContext?.financialSummary?.overdueAmount,
                        commercialContext?.financialSummary?.currencyCode ??
                          commercialContext?.package?.currencyCode
                      )}
                    </span>
                  </p>
                  <p>
                    Proximo vencimento:{" "}
                    <span className="font-medium text-slate-950">
                      {formatDate(commercialContext?.financialSummary?.nextDueDate)}
                    </span>
                  </p>
                  <p>
                    Pode upgrade:{" "}
                    <span className="font-medium text-slate-950">
                      {commercialContext?.eligibility?.canRequestUpgrade ? "Sim" : "Nao"}
                    </span>
                  </p>
                </div>
              </div>
            )}
          </div>

          {canEnroll ? (
            <Button type="button" onClick={() => setOpen(true)}>
              {hasCommercialContext ? "Atualizar matricula" : "Matricular paciente"}
            </Button>
          ) : null}
        </div>

        {hasCommercialContext && commercialContext?.entitlements?.length ? (
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {commercialContext.entitlements.map((item) => (
              <div key={item.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-slate-950">{item.title}</p>
                  <Badge tone={item.active ? "success" : "default"}>
                    {item.balanceRemaining}/{item.balanceTotal}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {item.serviceName ?? item.code} • vence em {formatDate(item.endsAt)}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {hasCommercialContext && commercialContext?.lead ? (
          <div className="mt-5 rounded-2xl border border-slate-100 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-950">Origem comercial</p>
            <p className="mt-1">
              Lead {commercialContext.lead.leadName ?? commercialContext.lead.leadId} na etapa{" "}
              {commercialContext.lead.stageName ?? "-"}.
            </p>
          </div>
        ) : null}
      </Card>

      <Modal
        title="Matricular paciente"
        description="Vincule o paciente a um programa e pacote do catalogo runtime."
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={
                createEnrollmentMutation.isPending ||
                catalogQuery.isLoading ||
                !selectedProgramId ||
                !selectedPackageId
              }
            >
              {createEnrollmentMutation.isPending ? "Salvando..." : "Confirmar matricula"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="programId">
              Programa
            </label>
            <select
              id="programId"
              className="field-base"
              value={selectedProgramId}
              onChange={(event) => {
                setSelectedProgramId(event.target.value);
                setSelectedPackageId("");
              }}
              disabled={catalogQuery.isLoading || !availablePrograms.length}
            >
              <option value="">Selecione um programa</option>
              {availablePrograms.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="packageId">
              Pacote
            </label>
            <select
              id="packageId"
              className="field-base"
              value={selectedPackageId}
              onChange={(event) => setSelectedPackageId(event.target.value)}
              disabled={catalogQuery.isLoading || !availablePackages.length}
            >
              <option value="">Selecione um pacote</option>
              {availablePackages.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} • {formatCurrency(item.price, item.currencyCode)}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900" htmlFor="startDate">
                Inicio
              </label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-900" htmlFor="endDate">
                Fim
              </label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          {currentProgram || currentPackage ? (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
              <p className="font-medium text-slate-950">Resumo da selecao</p>
              <p className="mt-2">Programa: {currentProgram?.name ?? "-"}</p>
              <p>Pacote: {currentPackage?.name ?? "-"}</p>
              <p>Valor: {formatCurrency(currentPackage?.price, currentPackage?.currencyCode)}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-900" htmlFor="notes">
              Observacoes
            </label>
            <textarea
              id="notes"
              className="field-base min-h-28"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Contexto da matricula, upgrade, campanha ou observacoes internas."
            />
          </div>

          {catalogQuery.isError ? (
            <p className="text-sm text-red-600">Nao foi possivel carregar o catalogo comercial.</p>
          ) : null}
          {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        </div>
      </Modal>
    </>
  );
}
