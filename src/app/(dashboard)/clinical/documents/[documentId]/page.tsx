"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Copy,
  Download,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Link2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
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
import { usePermissions } from "@/hooks/use-permissions";
import { HttpError } from "@/lib/http";
import type { ClinicalDocumentDetail } from "@/modules/clinical/api/get-document-detail";
import {
  copyToClipboard,
  openDocumentAccessLink,
  selectPreferredAccessLink,
} from "@/modules/clinical/lib/document-access";
import {
  formatArtifactKind,
  formatDateTime,
  formatDocumentStatus,
  formatDocumentType,
  formatSignatureStatus,
  getDocumentStatusTone,
  getSignatureStatusTone,
} from "@/modules/clinical/lib/document-display";
import { useClinicalDocumentDetail } from "@/modules/clinical/hooks/use-clinical-document-detail";
import { useDocumentAccessLinks } from "@/modules/clinical/hooks/use-document-access-links";
import { useState, type ReactNode } from "react";

type AccessMode = "open" | "download" | "copy";
type BadgeTone = "default" | "success" | "warning" | "danger";

type ActionMessage = {
  tone: "success" | "error";
  text: string;
} | null;

export default function ClinicalDocumentDetailPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = decodeURIComponent(params.documentId);
  const { can } = usePermissions();
  const canViewDocuments = can("clinical:view");
  const documentQuery = useClinicalDocumentDetail(documentId, {
    enabled: canViewDocuments,
  });
  const accessLinksMutation = useDocumentAccessLinks();
  const [pendingAction, setPendingAction] = useState<AccessMode | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);

  async function handleAccessDocument(mode: AccessMode) {
    setPendingAction(mode);
    setActionMessage(null);

    try {
      const payload = await accessLinksMutation.mutateAsync(documentId);
      const link = selectPreferredAccessLink(payload);

      if (!link) {
        setActionMessage({
          tone: "error",
          text: "Nenhum link seguro foi retornado para este documento.",
        });
        return;
      }

      if (mode === "copy") {
        await copyToClipboard(link.openUrl);
        setActionMessage({
          tone: "success",
          text: `Signed URL temporaria copiada. Expira em ${formatDateTime(payload.expiresAt)}.`,
        });
        void documentQuery.refetch();
        return;
      }

      openDocumentAccessLink(mode === "download" ? link.downloadUrl : link.openUrl);
      setActionMessage({
        tone: "success",
        text:
          mode === "download"
            ? "Download seguro preparado em uma nova aba."
            : "Documento seguro aberto em uma nova aba.",
      });
      void documentQuery.refetch();
    } catch (error) {
      setActionMessage({
        tone: "error",
        text: isAuthorizationError(error)
          ? "Sua sessao nao tem permissao para preparar links deste documento."
          : "Nao foi possivel preparar o acesso seguro do documento.",
      });
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={documentQuery.data?.title ?? "Detalhe do documento"}
        description="Resumo operacional, artefatos, assinatura e auditoria de acesso."
        actions={
          <Link
            href="/clinical/documents"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Link>
        }
      />

      {!canViewDocuments ? (
        <EmptyState
          title="Acesso restrito"
          description="Sua sessao nao possui permissao para visualizar documentos clinicos."
        />
      ) : null}

      {canViewDocuments && documentQuery.isLoading ? <DocumentDetailLoading /> : null}

      {canViewDocuments && documentQuery.isError ? (
        <DocumentDetailError
          error={documentQuery.error}
          onRetry={() => void documentQuery.refetch()}
        />
      ) : null}

      {canViewDocuments && !documentQuery.isLoading && !documentQuery.isError && !documentQuery.data ? (
        <EmptyState
          title="Documento nao encontrado"
          description="O broker nao retornou este documento para a sessao ou unidade atual."
        />
      ) : null}

      {documentQuery.data ? (
        <>
          {actionMessage ? (
            <Card
              className={
                actionMessage.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800"
                  : "border-red-200 bg-red-50 p-4 text-sm text-red-700"
              }
            >
              {actionMessage.text}
            </Card>
          ) : null}

          <DocumentSummary
            document={documentQuery.data}
            pendingAction={pendingAction}
            onOpen={() => void handleAccessDocument("open")}
            onDownload={() => void handleAccessDocument("download")}
            onCopy={() => void handleAccessDocument("copy")}
          />

          <div className="grid gap-4 xl:grid-cols-2">
            <ArtifactsPanel document={documentQuery.data} />
            <SignaturePanel document={documentQuery.data} />
          </div>

          <OperationalEventsPanel document={documentQuery.data} />
          <AccessAuditPanel document={documentQuery.data} />
        </>
      ) : null}
    </div>
  );
}

function DocumentSummary({
  document,
  pendingAction,
  onOpen,
  onDownload,
  onCopy,
}: {
  document: ClinicalDocumentDetail;
  pendingAction: AccessMode | null;
  onOpen: () => void;
  onDownload: () => void;
  onCopy: () => void;
}) {
  const canAccess = hasDocumentAccessTarget(document);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="space-y-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm text-slate-500">{formatDocumentType(document.documentType)}</p>
              <h2 className="text-xl font-semibold text-slate-950">{document.title}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {document.documentNumber ? `Numero ${document.documentNumber}` : "Sem numero"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={getDocumentStatusTone(document.status)}>
              {formatDocumentStatus(document.status)}
            </Badge>
            <SignatureBadge document={document} />
          </div>
        </div>

        <dl className="grid gap-4 md:grid-cols-3">
          <DetailItem label="Emissao" value={formatDateTime(document.issuedAt)} />
          <DetailItem label="Expiracao" value={formatDateTime(document.expiresAt)} />
          <DetailItem label="Assinado em" value={formatDateTime(document.signedAt)} />
          <DetailItem
            label="Versao"
            value={document.currentVersion ? `v${document.currentVersion.versionNumber}` : "Sem versao"}
          />
          <DetailItem
            label="Autor"
            value={document.author?.name ?? document.professional?.name ?? "Nao informado"}
          />
          <DetailItem
            label="Template"
            value={document.template?.title ?? "Sem template vinculado"}
          />
        </dl>

        {document.summary ? <p className="text-sm text-slate-600">{document.summary}</p> : null}
      </Card>

      <Card className="space-y-5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Vinculos operacionais</p>
          <p className="text-sm text-slate-500">Paciente, atendimento e prescricao associados.</p>
        </div>

        <div className="space-y-3 text-sm">
          <LinkedValue
            label="Paciente"
            value={document.patient?.name ?? "Paciente indisponivel"}
            href={document.patient?.id ? `/patients/${encodeURIComponent(document.patient.id)}` : null}
          />
          <LinkedValue
            label="Atendimento"
            value={document.encounter ? formatEncounterLabel(document.encounter) : "Sem atendimento vinculado"}
            href={document.encounter?.id ? `/clinical/encounters/${encodeURIComponent(document.encounter.id)}` : null}
          />
          <LinkedValue
            label="Prescricao"
            value={
              document.prescriptions[0]
                ? `${formatPrescriptionType(document.prescriptions[0].prescriptionType)} - ${formatDateTime(
                    document.prescriptions[0].issuedAt,
                  )}`
                : "Sem prescricao estruturada vinculada"
            }
            href={null}
          />
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <DocumentActionButton
            icon={<ExternalLink className="h-4 w-4" />}
            label={pendingAction === "open" ? "Preparando" : "Abrir"}
            disabled={!canAccess || Boolean(pendingAction)}
            onClick={onOpen}
          />
          <DocumentActionButton
            icon={<Download className="h-4 w-4" />}
            label={pendingAction === "download" ? "Preparando" : "Baixar"}
            disabled={!canAccess || Boolean(pendingAction)}
            onClick={onDownload}
          />
          <DocumentActionButton
            icon={<Copy className="h-4 w-4" />}
            label={pendingAction === "copy" ? "Copiando" : "Copiar URL"}
            disabled={!canAccess || Boolean(pendingAction)}
            onClick={onCopy}
          />
        </div>
        {!canAccess ? (
          <p className="text-xs text-slate-500">Sem artefato armazenado para acesso seguro.</p>
        ) : null}
      </Card>
    </div>
  );
}

function ArtifactsPanel({ document }: { document: ClinicalDocumentDetail }) {
  const artifacts = document.printableArtifacts;
  const latestArtifact = artifacts[0] ?? null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Artefato imprimivel</p>
          <p className="text-sm text-slate-500">
            {latestArtifact
              ? `${formatArtifactKind(latestArtifact.artifactKind)} mais recente`
              : "Sem artefato gerado"}
          </p>
        </div>
        {latestArtifact ? (
          <Badge tone={getArtifactStatusTone(latestArtifact.renderStatus)}>
            {formatArtifactStatus(latestArtifact.renderStatus)}
          </Badge>
        ) : null}
      </div>

      {document.currentVersion ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm">
          <div className="flex items-center gap-2 text-slate-900">
            <FileCheck2 className="h-4 w-4" />
            <span className="font-medium">Versao atual v{document.currentVersion.versionNumber}</span>
          </div>
          <p className="mt-2 text-slate-600">
            {document.currentVersion.hasStorageObject ? "Objeto armazenado" : "Sem objeto armazenado"}
            {document.currentVersion.checksum ? ` / checksum ${document.currentVersion.checksum}` : ""}
          </p>
        </div>
      ) : (
        <EmptyPanelState text="Sem versao atual registrada para este documento." />
      )}

      {artifacts.length ? (
        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <div
              key={artifact.id}
              className="flex flex-col gap-2 rounded-2xl border border-slate-100 p-3 text-sm md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium text-slate-900">{formatArtifactKind(artifact.artifactKind)}</p>
                <p className="text-slate-500">
                  {artifact.hasStorageObject ? "Armazenado" : "Sem storage"} / {formatDateTime(artifact.renderedAt)}
                </p>
                {artifact.failureReason ? (
                  <p className="mt-1 text-xs text-red-600">{artifact.failureReason}</p>
                ) : null}
              </div>
              <Badge tone={getArtifactStatusTone(artifact.renderStatus)}>
                {formatArtifactStatus(artifact.renderStatus)}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanelState text="Nenhum artefato imprimivel foi registrado." />
      )}
    </Card>
  );
}

function SignaturePanel({ document }: { document: ClinicalDocumentDetail }) {
  const latestRequest = document.signatureRequests[0] ?? null;

  return (
    <Card className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Assinatura</p>
          <p className="text-sm text-slate-500">
            {latestRequest ? latestRequest.providerCode : "Sem solicitacao de assinatura"}
          </p>
        </div>
        {latestRequest ? (
          <Badge tone={getSignatureStatusTone(latestRequest.requestStatus)}>
            {formatSignatureStatus(latestRequest.requestStatus)}
          </Badge>
        ) : null}
      </div>

      {latestRequest ? (
        <dl className="grid gap-4 md:grid-cols-2">
          <DetailItem label="Signatario" value={latestRequest.signerName ?? formatSignerType(latestRequest.signerType)} />
          <DetailItem label="E-mail" value={latestRequest.signerEmail ?? "Nao informado"} />
          <DetailItem label="Solicitada em" value={formatDateTime(latestRequest.requestedAt)} />
          <DetailItem label="Concluida em" value={formatDateTime(latestRequest.completedAt)} />
          <DetailItem label="Envelope" value={latestRequest.externalRequestId ?? "Sem envelope externo"} />
          <DetailItem
            label="Ultimo dispatch"
            value={
              latestRequest.latestDispatch
                ? `${formatDispatchStatus(latestRequest.latestDispatch.dispatchStatus)} em ${formatDateTime(
                    latestRequest.latestDispatch.attemptedAt,
                  )}`
                : "Sem dispatch registrado"
            }
          />
        </dl>
      ) : (
        <EmptyPanelState text="Este documento ainda nao possui solicitacao de assinatura." />
      )}

      {document.signatureEvents.length ? (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          {document.signatureEvents.slice(0, 4).map((event) => (
            <div key={event.id} className="rounded-2xl border border-slate-100 p-3 text-sm">
              <p className="font-medium text-slate-900">{formatSignatureEvent(event.eventType)}</p>
              <p className="text-slate-500">
                {event.source} / {formatDateTime(event.eventAt)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <EmptyPanelState text="Nenhum evento de webhook/assinatura foi registrado." />
      )}
    </Card>
  );
}

function OperationalEventsPanel({ document }: { document: ClinicalDocumentDetail }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-slate-500" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Dispatch e eventos operacionais</p>
          <p className="text-sm text-slate-500">Tentativas de envio e retorno do provider quando existentes.</p>
        </div>
      </div>

      {document.dispatchEvents.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Provider</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Envelope</TableHeaderCell>
                <TableHeaderCell>Tentativa</TableHeaderCell>
                <TableHeaderCell>Erro</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {document.dispatchEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{event.providerCode}</TableCell>
                  <TableCell>
                    <Badge tone={getDispatchStatusTone(event.dispatchStatus)}>
                      {formatDispatchStatus(event.dispatchStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {event.externalRequestId ?? "Sem envelope"}
                  </TableCell>
                  <TableCell className="text-slate-600">{formatDateTime(event.attemptedAt)}</TableCell>
                  <TableCell className="text-slate-600">{event.errorMessage ?? "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyPanelState text="Sem dispatch registrado para este documento." />
      )}
    </Card>
  );
}

function AccessAuditPanel({ document }: { document: ClinicalDocumentDetail }) {
  return (
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <History className="h-4 w-4 text-slate-500" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Auditoria de acesso</p>
          <p className="text-sm text-slate-500">Eventos recentes de abertura e download concedidos pelo broker.</p>
        </div>
      </div>

      {document.accessEvents.length ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeaderCell>Acao</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Alvo</TableHeaderCell>
                <TableHeaderCell>Ator</TableHeaderCell>
                <TableHeaderCell>Expira</TableHeaderCell>
                <TableHeaderCell>Registro</TableHeaderCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {document.accessEvents.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>{formatAccessAction(event.accessAction)}</TableCell>
                  <TableCell>
                    <Badge tone={getAccessStatusTone(event.accessStatus)}>
                      {formatAccessStatus(event.accessStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {event.artifactKind ? formatArtifactKind(event.artifactKind) : "Versao atual"}
                  </TableCell>
                  <TableCell className="text-slate-600">{event.actor?.name ?? "Sistema"}</TableCell>
                  <TableCell className="text-slate-600">{formatDateTime(event.signedUrlExpiresAt)}</TableCell>
                  <TableCell className="text-slate-600">{formatDateTime(event.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <EmptyPanelState text="Nenhum evento de abertura ou download foi registrado ainda." />
      )}
    </Card>
  );
}

function DocumentDetailLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-44 w-full" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

function DocumentDetailError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  const title = isAuthorizationError(error)
    ? "Acesso ao documento restrito"
    : isNotFoundError(error)
      ? "Documento nao encontrado"
      : "Erro ao carregar documento";

  const description = isAuthorizationError(error)
    ? "O broker recusou o detalhe para esta sessao ou unidade."
    : isNotFoundError(error)
      ? "Este documento nao esta disponivel para a unidade atual."
      : "Nao foi possivel consultar o detalhe operacional agora.";

  return (
    <EmptyState
      title={title}
      description={description}
      action={
        <Button type="button" variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      }
    />
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-900">{value}</dd>
    </div>
  );
}

function LinkedValue({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      {href ? (
        <Link href={href} className="mt-1 inline-flex items-center gap-2 font-medium text-slate-900 hover:text-brand">
          {value}
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      ) : (
        <p className="mt-1 font-medium text-slate-900">{value}</p>
      )}
    </div>
  );
}

function DocumentActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant="secondary" size="sm" disabled={disabled} onClick={onClick}>
      {icon}
      {label}
    </Button>
  );
}

function EmptyPanelState({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">{text}</p>;
}

function SignatureBadge({ document }: { document: ClinicalDocumentDetail }) {
  if (document.signedAt) {
    return <Badge tone="success">Assinado</Badge>;
  }

  const latestRequest = document.signatureRequests[0] ?? null;
  if (!latestRequest) {
    return <Badge>Sem assinatura</Badge>;
  }

  return (
    <Badge tone={getSignatureStatusTone(latestRequest.requestStatus)}>
      {formatSignatureStatus(latestRequest.requestStatus)}
    </Badge>
  );
}

function hasDocumentAccessTarget(document: ClinicalDocumentDetail) {
  return Boolean(
    document.currentVersion?.hasStorageObject ||
      document.printableArtifacts.some((artifact) => artifact.hasStorageObject),
  );
}

function isAuthorizationError(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}

function isNotFoundError(error: unknown) {
  return error instanceof HttpError && error.status === 404;
}

function formatEncounterLabel(encounter: NonNullable<ClinicalDocumentDetail["encounter"]>) {
  return `${formatEncounterType(encounter.encounterType)} / ${formatDocumentStatusLike(encounter.status)}`;
}

function formatEncounterType(value: string) {
  switch (value) {
    case "initial_consult":
      return "Consulta inicial";
    case "follow_up":
      return "Retorno";
    case "procedure":
      return "Procedimento";
    case "teleconsult":
      return "Teleconsulta";
    case "review":
      return "Revisao";
    default:
      return "Atendimento";
  }
}

function formatDocumentStatusLike(value: string) {
  switch (value) {
    case "open":
      return "Aberto";
    case "closed":
      return "Fechado";
    case "cancelled":
      return "Cancelado";
    default:
      return value;
  }
}

function formatPrescriptionType(value: string) {
  switch (value) {
    case "prescription":
      return "Prescricao";
    case "orientation":
      return "Orientacao";
    case "supplement_plan":
      return "Suplementacao";
    case "training_guidance":
      return "Treino";
    default:
      return "Prescricao";
  }
}

function formatSignerType(value: string) {
  switch (value) {
    case "professional":
      return "Profissional";
    case "guardian":
      return "Responsavel";
    case "witness":
      return "Testemunha";
    case "other":
      return "Outro";
    default:
      return "Paciente";
  }
}

function formatArtifactStatus(value: string) {
  switch (value) {
    case "rendered":
      return "Renderizado";
    case "failed":
      return "Falhou";
    default:
      return "Pendente";
  }
}

function getArtifactStatusTone(value: string): BadgeTone {
  switch (value) {
    case "rendered":
      return "success";
    case "failed":
      return "danger";
    default:
      return "default";
  }
}

function formatDispatchStatus(value: string) {
  switch (value) {
    case "sent":
      return "Enviado";
    case "failed":
      return "Falhou";
    case "skipped":
      return "Ignorado";
    default:
      return "Pendente";
  }
}

function getDispatchStatusTone(value: string): BadgeTone {
  switch (value) {
    case "sent":
      return "success";
    case "failed":
      return "danger";
    case "skipped":
      return "warning";
    default:
      return "default";
  }
}

function formatSignatureEvent(value: string) {
  switch (value) {
    case "signed":
      return "Documento assinado";
    case "signature_dispatch":
      return "Dispatch registrado";
    default:
      return value;
  }
}

function formatAccessAction(value: string) {
  return value === "download" ? "Download" : "Abertura";
}

function formatAccessStatus(value: string) {
  switch (value) {
    case "denied":
      return "Negado";
    case "storage_error":
      return "Erro storage";
    default:
      return "Concedido";
  }
}

function getAccessStatusTone(value: string): BadgeTone {
  switch (value) {
    case "denied":
    case "storage_error":
      return "danger";
    default:
      return "success";
  }
}
