import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PatientAppAccessFeature, PatientAppAccessState } from "@/modules/patient-app/types";
import type { PatientCommercialContext } from "@/types/api";

function accessStatusTone(
  value?: PatientAppAccessState["status"]
): "default" | "success" | "warning" | "danger" {
  switch (value) {
    case "enabled":
      return "success";
    case "attention":
      return "warning";
    case "restricted":
      return "danger";
    default:
      return "default";
  }
}

function accessStatusLabel(value?: PatientAppAccessState["status"]) {
  switch (value) {
    case "enabled":
      return "Plano ativo";
    case "attention":
      return "Requer atencao";
    case "restricted":
      return "Beneficios restritos";
    default:
      return "Sem definicao";
  }
}

function financialStatusTone(
  value?: PatientAppAccessState["financialStatus"]
): "default" | "success" | "warning" | "danger" {
  switch (value) {
    case "clear":
      return "success";
    case "pending":
      return "warning";
    case "overdue":
      return "danger";
    default:
      return "default";
  }
}

function financialStatusLabel(value?: PatientAppAccessState["financialStatus"]) {
  switch (value) {
    case "clear":
      return "Financeiro em dia";
    case "pending":
      return "Pagamento pendente";
    case "overdue":
      return "Pagamento vencido";
    default:
      return "Sem financeiro";
  }
}

function renewalRiskTone(
  value?: PatientAppAccessState["renewalRisk"]
): "default" | "success" | "warning" | "danger" {
  switch (value) {
    case "none":
      return "success";
    case "medium":
      return "warning";
    case "high":
    case "expired":
      return "danger";
    default:
      return "default";
  }
}

function renewalRiskLabel(value?: PatientAppAccessState["renewalRisk"]) {
  switch (value) {
    case "none":
      return "Vigencia estavel";
    case "medium":
      return "Renovacao proxima";
    case "high":
      return "Renovacao critica";
    case "expired":
      return "Vigencia expirada";
    default:
      return "Sem vigencia";
  }
}

function featureTone(feature?: PatientAppAccessFeature): "default" | "success" | "warning" {
  if (!feature) {
    return "default";
  }

  return feature.enabled ? "success" : "warning";
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

function formatCurrency(value?: number | null, currencyCode?: string | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "-";
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: currencyCode ?? "BRL",
  }).format(value);
}

function financeSummaryLabel(commercialContext?: PatientCommercialContext | null) {
  const summary = commercialContext?.financialSummary;
  if (!summary) {
    return "Sem dados financeiros";
  }

  if ((summary.overdueCount ?? 0) > 0) {
    return `${summary.overdueCount} titulo(s) vencido(s)`;
  }

  if ((summary.pendingCount ?? 0) > 0) {
    return `${summary.pendingCount} titulo(s) pendente(s)`;
  }

  return "Sem pendencias abertas";
}

function featureDescription(feature?: PatientAppAccessFeature) {
  if (!feature) {
    return "Sem definicao para esta etapa.";
  }

  if (feature.enabled) {
    return "Liberado no estado atual do plano.";
  }

  return feature.reason ?? "Indisponivel no momento.";
}

export function PatientAppAccessCard({
  commercialContext,
  accessState,
}: {
  commercialContext?: PatientCommercialContext | null;
  accessState?: PatientAppAccessState | null;
}) {
  const hasCommercialContext = commercialContext?.hasCommercialContext === true;
  const packageName = commercialContext?.package?.name ?? "Plano em liberacao";
  const programName = commercialContext?.program?.name ?? "Acompanhamento";
  const tierLabel = commercialContext?.benefits?.tier ?? commercialContext?.package?.tier ?? "standard";
  const message =
    accessState?.alertMessage ??
    accessState?.blockerReason ??
    (hasCommercialContext
      ? "Seu acesso esta alinhado ao plano ativo e aos beneficios contratados."
      : "O plano ainda esta sendo preparado. Seus registros diarios permanecem disponiveis.");

  const features = [
    {
      key: "community",
      label: "Comunidade",
      feature: accessState?.features.community,
    },
    {
      key: "priority-chat",
      label: "Chat prioritario",
      feature: accessState?.features.priorityChat,
    },
    {
      key: "schedule-return",
      label: "Retorno",
      feature: accessState?.features.scheduleReturn,
    },
    {
      key: "upgrade-request",
      label: "Upgrade",
      feature: accessState?.features.upgradeRequest,
    },
  ] as const;

  return (
    <Card className="border border-slate-200">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-500">Seu plano</p>
            <Badge tone={accessStatusTone(accessState?.status)}>
              {accessStatusLabel(accessState?.status)}
            </Badge>
            <Badge tone={financialStatusTone(accessState?.financialStatus)}>
              {financialStatusLabel(accessState?.financialStatus)}
            </Badge>
            <Badge tone={renewalRiskTone(accessState?.renewalRisk)}>
              {renewalRiskLabel(accessState?.renewalRisk)}
            </Badge>
          </div>

          <h2 className="mt-3 text-xl font-semibold text-slate-950">{packageName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {programName} · suporte {accessState?.supportLevel === "priority" ? "prioritario" : "padrao"}
          </p>
          <p className="mt-3 max-w-2xl text-sm text-slate-600">{message}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[320px]">
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Tier</p>
            <p className="mt-2 text-base font-semibold text-slate-950">{tierLabel}</p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Vigencia</p>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {formatDate(commercialContext?.vigency?.endDate)}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Financeiro</p>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {financeSummaryLabel(commercialContext)}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              {formatCurrency(
                commercialContext?.financialSummary?.overdueAmount ??
                  commercialContext?.financialSummary?.pendingAmount ??
                  0,
                commercialContext?.financialSummary?.currencyCode ??
                  commercialContext?.package?.currencyCode
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Proximo vencimento
            </p>
            <p className="mt-2 text-base font-semibold text-slate-950">
              {formatDate(commercialContext?.financialSummary?.nextDueDate)}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {features.map((item) => (
          <div key={item.key} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-950">{item.label}</p>
              <Badge tone={featureTone(item.feature)}>
                {item.feature?.enabled ? "Liberado" : "Bloqueado"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-slate-500">{featureDescription(item.feature)}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
