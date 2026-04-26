"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/use-permissions";
import { HttpError } from "@/lib/http";
import type {
  ClinicalDocumentListItem,
  ClinicalDocumentListParams,
} from "@/modules/clinical/api/list-documents";
import { DocumentCenterFilters } from "@/modules/clinical/components/document-center-filters";
import {
  DocumentCenterTable,
  type DocumentCenterActionMode,
  type DocumentCenterPendingAction,
} from "@/modules/clinical/components/document-center-table";
import {
  copyToClipboard,
  openDocumentAccessLink,
  selectPreferredAccessLink,
} from "@/modules/clinical/lib/document-access";
import { formatDateTime } from "@/modules/clinical/lib/document-display";
import { useClinicalDocuments } from "@/modules/clinical/hooks/use-clinical-documents";
import { useDocumentAccessLinks } from "@/modules/clinical/hooks/use-document-access-links";

const DOCUMENTS_PAGE_SIZE = 25;

type ActionMessage = {
  tone: "success" | "error";
  text: string;
} | null;

export default function ClinicalDocumentsPage() {
  const { can } = usePermissions();
  const canViewDocuments = can("clinical:view");
  const [patientId, setPatientId] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [status, setStatus] = useState("");
  const [signatureStatus, setSignatureStatus] = useState("");
  const [issuedFrom, setIssuedFrom] = useState("");
  const [issuedTo, setIssuedTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [pendingAction, setPendingAction] = useState<DocumentCenterPendingAction>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage>(null);
  const deferredPatientId = useDeferredValue(patientId);
  const accessLinksMutation = useDocumentAccessLinks();

  const filters = useMemo<ClinicalDocumentListParams>(
    () => ({
      patientId: deferredPatientId.trim() || undefined,
      documentType: documentType || undefined,
      status: status || undefined,
      signatureStatus: signatureStatus || undefined,
      issuedFrom: issuedFrom || undefined,
      issuedTo: issuedTo || undefined,
      limit: DOCUMENTS_PAGE_SIZE,
      offset,
    }),
    [deferredPatientId, documentType, issuedFrom, issuedTo, offset, signatureStatus, status],
  );

  const documentsQuery = useClinicalDocuments(filters, {
    enabled: canViewDocuments,
  });

  const hasActiveFilters = Boolean(
    patientId.trim() || documentType || status || signatureStatus || issuedFrom || issuedTo
  );
  const documentsPage = documentsQuery.data ?? null;
  const documents = documentsPage?.items ?? [];
  const hasNextPage = documentsPage
    ? documentsPage.offset + documentsPage.limit < documentsPage.total
    : false;
  const hasPreviousPage = offset > 0;

  function resetOffsetAndRun(callback: () => void) {
    setOffset(0);
    callback();
  }

  async function handleAccessDocument(
    document: ClinicalDocumentListItem,
    mode: DocumentCenterActionMode,
  ) {
    setPendingAction({ documentId: document.id, mode });
    setActionMessage(null);

    try {
      const payload = await accessLinksMutation.mutateAsync(document.id);
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
    <div className="space-y-4">
      <PageHeader
        title="Centro documental"
        description="Localize documentos clinicos e gere acesso temporario auditado sem expor o bucket privado."
        actions={
          <Link
            href="/clinical/documents/ops/health"
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
          >
            <Activity className="h-4 w-4" />
            Saude documental
          </Link>
        }
      />

      {!canViewDocuments ? (
        <EmptyState
          title="Acesso restrito"
          description="Sua sessao nao possui permissao para visualizar documentos clinicos."
        />
      ) : (
        <>
          <DocumentCenterFilters
            patientId={patientId}
            documentType={documentType}
            status={status}
            signatureStatus={signatureStatus}
            issuedFrom={issuedFrom}
            issuedTo={issuedTo}
            hasActiveFilters={hasActiveFilters}
            disabled={documentsQuery.isLoading}
            onPatientIdChange={(value) => resetOffsetAndRun(() => setPatientId(value))}
            onDocumentTypeChange={(value) => resetOffsetAndRun(() => setDocumentType(value))}
            onStatusChange={(value) => resetOffsetAndRun(() => setStatus(value))}
            onSignatureStatusChange={(value) => resetOffsetAndRun(() => setSignatureStatus(value))}
            onIssuedFromChange={(value) => resetOffsetAndRun(() => setIssuedFrom(value))}
            onIssuedToChange={(value) => resetOffsetAndRun(() => setIssuedTo(value))}
            onClear={() =>
              resetOffsetAndRun(() => {
                setPatientId("");
                setDocumentType("");
                setStatus("");
                setSignatureStatus("");
                setIssuedFrom("");
                setIssuedTo("");
              })
            }
          />

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

          {documentsQuery.isLoading ? <DocumentsLoadingState /> : null}

          {documentsQuery.isError ? (
            <DocumentsErrorState
              isAuthorizationError={isAuthorizationError(documentsQuery.error)}
              onRetry={() => void documentsQuery.refetch()}
            />
          ) : null}

          {documentsQuery.data && documents.length === 0 ? (
            <EmptyState
              title={hasActiveFilters ? "Nenhum documento encontrado" : "Nenhum documento acessivel"}
              description={
                hasActiveFilters
                  ? "Ajuste os filtros para localizar documentos liberados pelo broker."
                  : "Quando houver documentos clinicos acessiveis para sua unidade, eles aparecerao aqui."
              }
            />
          ) : null}

          {documentsPage && documents.length > 0 ? (
            <>
              <DocumentCenterTable
                items={documents}
                pendingAction={pendingAction}
                onOpen={(document) => void handleAccessDocument(document, "open")}
                onDownload={(document) => void handleAccessDocument(document, "download")}
                onCopy={(document) => void handleAccessDocument(document, "copy")}
              />
              <div className="flex flex-col gap-3 rounded-3xl border border-border bg-surface px-4 py-3 text-sm text-slate-600 md:flex-row md:items-center md:justify-between">
                <span>
                  Exibindo {documentsPage.offset + 1}-
                  {Math.min(
                    documentsPage.offset + documentsPage.items.length,
                    documentsPage.total,
                  )}{" "}
                  de {documentsPage.total} documento(s)
                  {documentsQuery.isFetching && !documentsQuery.isLoading ? " / atualizando" : ""}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!hasPreviousPage || documentsQuery.isFetching}
                    onClick={() => setOffset(Math.max(0, offset - DOCUMENTS_PAGE_SIZE))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={!hasNextPage || documentsQuery.isFetching}
                    onClick={() => setOffset(offset + DOCUMENTS_PAGE_SIZE)}
                  >
                    Proxima
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function DocumentsLoadingState() {
  return (
    <Card className="space-y-4">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    </Card>
  );
}

function DocumentsErrorState({
  isAuthorizationError,
  onRetry,
}: {
  isAuthorizationError: boolean;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      title={isAuthorizationError ? "Acesso aos documentos restrito" : "Erro ao carregar documentos"}
      description={
        isAuthorizationError
          ? "O broker recusou a listagem para esta sessao ou unidade."
          : "Nao foi possivel consultar o broker documental agora."
      }
      action={
        <Button type="button" variant="secondary" onClick={onRetry}>
          Tentar novamente
        </Button>
      }
    />
  );
}

function isAuthorizationError(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}
