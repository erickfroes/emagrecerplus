"use client";

import Link from "next/link";
import { Copy, Download, ExternalLink, Eye, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/table";
import type { ClinicalDocumentListItem } from "@/modules/clinical/api/list-documents";
import {
  formatArtifactKind,
  formatDate,
  formatDocumentStatus,
  formatDocumentType,
  formatSignatureStatus,
  getDocumentStatusTone,
  getSignatureStatusTone,
} from "@/modules/clinical/lib/document-display";

export type DocumentCenterActionMode = "open" | "download" | "copy";

export type DocumentCenterPendingAction = {
  documentId: string;
  mode: DocumentCenterActionMode;
} | null;

export function DocumentCenterTable({
  items,
  pendingAction,
  onOpen,
  onDownload,
  onCopy,
}: {
  items: ClinicalDocumentListItem[];
  pendingAction: DocumentCenterPendingAction;
  onOpen: (document: ClinicalDocumentListItem) => void;
  onDownload: (document: ClinicalDocumentListItem) => void;
  onCopy: (document: ClinicalDocumentListItem) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <div className="overflow-x-auto">
        <Table>
          <TableHead>
            <TableRow>
              <TableHeaderCell className="min-w-[280px]">Documento</TableHeaderCell>
              <TableHeaderCell className="min-w-[180px]">Paciente</TableHeaderCell>
              <TableHeaderCell>Tipo</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Assinatura</TableHeaderCell>
              <TableHeaderCell>Artefatos</TableHeaderCell>
              <TableHeaderCell>Emissao</TableHeaderCell>
              <TableHeaderCell className="min-w-[340px]">Acoes</TableHeaderCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((document) => {
              const canAccess = hasDocumentAccessTarget(document);

              return (
                <TableRow key={document.id}>
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 rounded-2xl bg-slate-100 p-2 text-slate-600">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <Link
                          href={`/clinical/documents/${encodeURIComponent(document.id)}`}
                          className="font-medium text-slate-950 transition hover:text-brand"
                        >
                          {document.title}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {document.documentNumber ? `Numero ${document.documentNumber}` : "Sem numero"}
                          {document.summary ? ` / ${document.summary}` : ""}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {document.patient?.name ?? "Paciente indisponivel"}
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatDocumentType(document.documentType)}
                  </TableCell>
                  <TableCell>
                    <Badge tone={getDocumentStatusTone(document.status)}>
                      {formatDocumentStatus(document.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <SignatureBadge document={document} />
                  </TableCell>
                  <TableCell className="text-slate-600">
                    <ArtifactSummary document={document} />
                  </TableCell>
                  <TableCell className="text-slate-600">
                    {formatDate(document.issuedAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/clinical/documents/${encodeURIComponent(document.id)}`}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-medium text-foreground transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
                        title="Ver detalhe operacional"
                      >
                        <Eye className="h-4 w-4" />
                        Detalhe
                      </Link>
                      <ActionButton
                        label="Abrir"
                        title="Abrir documento com signed URL temporaria"
                        mode="open"
                        documentId={document.id}
                        pendingAction={pendingAction}
                        disabled={!canAccess}
                        onClick={() => onOpen(document)}
                      />
                      <ActionButton
                        label="Baixar"
                        title="Baixar documento com signed URL temporaria"
                        mode="download"
                        documentId={document.id}
                        pendingAction={pendingAction}
                        disabled={!canAccess}
                        onClick={() => onDownload(document)}
                      />
                      <ActionButton
                        label="Copiar"
                        title="Copiar signed URL temporaria"
                        mode="copy"
                        documentId={document.id}
                        pendingAction={pendingAction}
                        disabled={!canAccess}
                        onClick={() => onCopy(document)}
                      />
                    </div>
                    {!canAccess ? (
                      <p className="mt-2 text-xs text-slate-500">
                        Sem artefato armazenado para acesso seguro.
                      </p>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

function ActionButton({
  label,
  title,
  mode,
  documentId,
  pendingAction,
  disabled,
  onClick,
}: {
  label: string;
  title: string;
  mode: DocumentCenterActionMode;
  documentId: string;
  pendingAction: DocumentCenterPendingAction;
  disabled?: boolean;
  onClick: () => void;
}) {
  const isPending = pendingAction?.documentId === documentId && pendingAction.mode === mode;
  const Icon = mode === "open" ? ExternalLink : mode === "download" ? Download : Copy;

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      title={title}
      disabled={disabled || Boolean(pendingAction)}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
      {isPending ? "Preparando" : label}
    </Button>
  );
}

function SignatureBadge({ document }: { document: ClinicalDocumentListItem }) {
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

function ArtifactSummary({ document }: { document: ClinicalDocumentListItem }) {
  const storedArtifacts = document.printableArtifacts.filter((artifact) => artifact.hasStorageObject);
  const parts = [
    document.currentVersion?.hasStorageObject ? "Versao atual" : null,
    ...storedArtifacts.slice(0, 2).map((artifact) => formatArtifactKind(artifact.artifactKind)),
  ].filter(Boolean);

  if (!parts.length) {
    return "Nenhum";
  }

  const hiddenCount = Math.max(storedArtifacts.length - 2, 0);
  return hiddenCount > 0 ? `${parts.join(", ")} +${hiddenCount}` : parts.join(", ");
}

function hasDocumentAccessTarget(document: ClinicalDocumentListItem) {
  return Boolean(
    document.currentVersion?.hasStorageObject ||
      document.printableArtifacts.some((artifact) => artifact.hasStorageObject),
  );
}
