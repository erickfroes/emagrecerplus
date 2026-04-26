"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import { HttpError } from "@/lib/http";
import type {
  DocumentOperationalHealthEvent,
  DocumentOperationalHealthStatus,
} from "@/modules/clinical/api/get-document-operational-health";
import { formatDateTime } from "@/modules/clinical/lib/document-display";
import { useDocumentOperationalHealth } from "@/modules/clinical/hooks/use-document-operational-health";

const PERIOD_OPTIONS = [
  { value: "24h", label: "24h", hours: 24 },
  { value: "7d", label: "7 dias", hours: 24 * 7 },
  { value: "30d", label: "30 dias", hours: 24 * 30 },
];

const PROVIDER_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "mock", label: "Mock" },
  { value: "d4sign", label: "D4Sign" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "failure", label: "Falha" },
  { value: "warning", label: "Atenção" },
  { value: "pending", label: "Pendente" },
];

export default function DocumentOperationalHealthPage() {
  const { can } = usePermissions();
  const canViewDocuments = can("clinical:view");
  const [period, setPeriod] = useState("24h");
  const [provider, setProvider] = useState("");
  const [status, setStatus] = useState("");
  const [asOf, setAsOf] = useState(() => new Date());

  const filters = useMemo(() => {
    const selectedPeriod = PERIOD_OPTIONS.find((option) => option.value === period) ?? PERIOD_OPTIONS[0];
    const to = asOf;
    const from = new Date(to.getTime() - selectedPeriod.hours * 60 * 60 * 1000);

    return {
      limit: 25,
      periodFrom: from.toISOString(),
      periodTo: to.toISOString(),
      provider: provider || undefined,
      status: status || undefined,
    };
  }, [asOf, period, provider, status]);

  const healthQuery = useDocumentOperationalHealth(filters, {
    enabled: canViewDocuments,
  });
  const health = healthQuery.data ?? null;
  const recentFailures = health?.recentFailures ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Saude documental"
        description="Falhas de dispatch, webhook, evidencia e pacote no periodo selecionado."
        actions={
          <>
            <Link
              href="/clinical/documents"
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Documentos
            </Link>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAsOf(new Date())}
              disabled={healthQuery.isFetching}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </>
        }
      />

      {!canViewDocuments ? (
        <EmptyState
          title="Acesso restrito"
          description="Sua sessao nao possui permissao para visualizar a saude documental."
        />
      ) : (
        <>
          <HealthFilters
            period={period}
            provider={provider}
            status={status}
            disabled={healthQuery.isFetching}
            onPeriodChange={setPeriod}
            onProviderChange={setProvider}
            onStatusChange={setStatus}
          />

          {healthQuery.isLoading ? <HealthLoadingState /> : null}

          {healthQuery.isError ? (
            <HealthErrorState
              isAuthorizationError={isAuthorizationError(healthQuery.error)}
              onRetry={() => void healthQuery.refetch()}
            />
          ) : null}

          {health ? (
            <>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
                {health.summary.map((item) => (
                  <Card key={item.key} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-600">{item.label}</p>
                      <Badge tone={statusTone(item.status)}>{statusLabel(item.status)}</Badge>
                    </div>
                    <p className="text-3xl font-semibold text-slate-950">{item.count}</p>
                  </Card>
                ))}
              </div>

              <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl bg-slate-100 p-2 text-slate-600">
                    <Activity className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Status geral: {statusLabel(health.overallStatus)}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatDateTime(health.period.from)} ate {formatDateTime(health.period.to)}
                    </p>
                  </div>
                </div>
                <Badge tone={statusTone(health.overallStatus)}>
                  {healthQuery.isFetching ? "Atualizando" : formatDateTime(health.generatedAt)}
                </Badge>
              </Card>

              <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <RecentFailuresPanel items={recentFailures} />
                <LatestWebhookPanel items={health.latestWebhooks} />
              </section>

              <LatestDispatchPanel items={health.latestDispatches} />
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function HealthFilters({
  period,
  provider,
  status,
  disabled,
  onPeriodChange,
  onProviderChange,
  onStatusChange,
}: {
  period: string;
  provider: string;
  status: string;
  disabled?: boolean;
  onPeriodChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 md:grid-cols-3">
      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Periodo
        <select
          className="field-base"
          value={period}
          onChange={(event) => onPeriodChange(event.target.value)}
          disabled={disabled}
        >
          {PERIOD_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Provider
        <select
          className="field-base"
          value={provider}
          onChange={(event) => onProviderChange(event.target.value)}
          disabled={disabled}
        >
          {PROVIDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Status
        <select
          className="field-base"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          disabled={disabled}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function RecentFailuresPanel({ items }: { items: DocumentOperationalHealthEvent[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <PanelHeader title="Falhas recentes" count={items.length} />
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Evento</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Documento</TableHeaderCell>
                <TableHeaderCell>Quando</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={asText(item.id) || `${asText(item.category)}-${index}`}>
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 rounded-2xl bg-red-50 p-2 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="font-medium text-slate-950">
                          {failureTitle(item)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {asText(item.message) || "Sem detalhe adicional"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge tone={statusTone(item.healthStatus)}>
                      {statusLabel(item.healthStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {asText(item.documentId) || "Sem documento"}
                    {asText(item.patientName) ? (
                      <span className="block text-xs text-slate-500">{asText(item.patientName)}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatDateTime(asText(item.occurredAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-500">
          Nenhum dispatch, webhook, evidencia ou pacote entrou em estado operacional critico.
        </div>
      )}
    </Card>
  );
}

function LatestWebhookPanel({ items }: { items: DocumentOperationalHealthEvent[] }) {
  return (
    <Card className="space-y-3">
      <PanelHeader title="Ultimos webhooks" count={items.length} />
      {items.length > 0 ? (
        <div className="space-y-3">
          {items.slice(0, 6).map((item, index) => (
            <div
              key={asText(item.id) || `webhook-${index}`}
              className="rounded-2xl border border-border p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-950">
                  {asText(item.eventType) || "webhook"}
                </p>
                <Badge tone={asBoolean(item.hmacValid) ? "success" : "default"}>
                  {asText(item.source) || asText(item.providerCode) || "provider"}
                </Badge>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {formatDateTime(asText(item.eventAt) || asText(item.createdAt) || asText(item.occurredAt))}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">Sem webhooks no periodo.</p>
      )}
    </Card>
  );
}

function LatestDispatchPanel({ items }: { items: DocumentOperationalHealthEvent[] }) {
  return (
    <Card className="overflow-hidden p-0">
      <PanelHeader title="Ultimos dispatches" count={items.length} />
      {items.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Documento</TableHeaderCell>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Quando</TableHeaderCell>
                <TableHeaderCell>Mensagem</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((item, index) => (
                <TableRow key={asText(item.id) || `dispatch-${index}`}>
                  <TableCell className="text-slate-600">
                    {asText(item.documentId) || "Sem documento"}
                    {asRecord(item.patient) ? (
                      <span className="block text-xs text-slate-500">
                        {asText(asRecord(item.patient)?.name)}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {providerLabel(item)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={dispatchTone(asText(item.dispatchStatus) || asText(item.status))}>
                      {asText(item.dispatchStatus) || asText(item.status) || "sem status"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatDateTime(asText(item.attemptedAt) || asText(item.occurredAt))}
                  </TableCell>
                  <TableCell className="max-w-[260px] text-slate-600">
                    {asText(item.errorMessage) || asText(item.message) || asText(item.providerStatus) || "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="p-5 text-sm text-slate-500">
          Nenhuma tentativa de assinatura foi registrada com os filtros atuais.
        </div>
      )}
    </Card>
  );
}

function PanelHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
      <h2 className="text-sm font-semibold text-slate-950">{title}</h2>
      <Badge>{count}</Badge>
    </div>
  );
}

function HealthLoadingState() {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
      {Array.from({ length: 6 }).map((_, index) => (
        <Card key={index} className="space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-9 w-16" />
        </Card>
      ))}
    </div>
  );
}

function HealthErrorState({
  isAuthorizationError,
  onRetry,
}: {
  isAuthorizationError: boolean;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      title={isAuthorizationError ? "Acesso restrito" : "Erro ao carregar saude documental"}
      description={
        isAuthorizationError
          ? "O broker recusou a consulta operacional para esta sessao ou unidade."
          : "Nao foi possivel consultar o health documental agora."
      }
      action={
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      }
    />
  );
}

function failureTitle(item: DocumentOperationalHealthEvent) {
  const category = asText(item.category);
  const status = asText(item.status);

  if (status === "provider_config_missing") {
    return "Provider sem configuracao";
  }

  if (asText(item.eventType) === "document.signature_webhook_hmac_invalid") {
    return "HMAC invalido";
  }

  if (asText(item.eventType) === "document.signature_webhook_duplicate") {
    return "Webhook duplicado";
  }

  if (category === "package") {
    return "Falha no pacote";
  }

  if (category === "evidence") {
    return "Evidencia pendente";
  }

  return "Falha operacional";
}

function providerLabel(item: DocumentOperationalHealthEvent) {
  const providerCode = asText(item.providerCode) || asText(item.source) || "provider";
  const providerMode = asText(item.providerMode);

  return providerMode ? `${providerCode} / ${providerMode}` : providerCode;
}

function statusTone(status: unknown) {
  switch (status) {
    case "failure":
      return "danger";
    case "pending":
    case "warning":
      return "warning";
    default:
      return "success";
  }
}

function dispatchTone(status: string | null) {
  switch (status) {
    case "failed":
      return "danger";
    case "pending":
    case "skipped":
      return "warning";
    case "sent":
      return "success";
    default:
      return "default";
  }
}

function statusLabel(status: unknown) {
  switch (status) {
    case "failure":
      return "Falha";
    case "pending":
      return "Pendente";
    case "warning":
      return "Atencao";
    default:
      return "OK";
  }
}

function asText(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isAuthorizationError(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}
