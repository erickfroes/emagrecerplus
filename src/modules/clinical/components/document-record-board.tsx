"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import type { EncounterDocumentAccessLinksResponse } from "@/modules/clinical/api/get-document-access-links";
import { useCreateDocumentRecord } from "@/modules/clinical/hooks/use-create-document-record";
import { useDocumentAccessLinks } from "@/modules/clinical/hooks/use-document-access-links";
import { useCreateDocumentPrintableArtifact } from "@/modules/clinical/hooks/use-create-document-printable-artifact";
import { useCreateDocumentSignatureRequest } from "@/modules/clinical/hooks/use-create-document-signature-request";
import { useDocumentTemplates } from "@/modules/clinical/hooks/use-document-templates";
import type { EncounterDocumentRecord } from "@/modules/clinical/types";

const DOCUMENT_TYPE_OPTIONS = [
  { value: "report", label: "Relatorio" },
  { value: "consent", label: "Consentimento" },
  { value: "prescription", label: "Prescricao" },
  { value: "orientation", label: "Orientacao" },
  { value: "exam_request", label: "Solicitacao de exame" },
  { value: "certificate", label: "Atestado" },
  { value: "custom", label: "Personalizado" },
];

export function DocumentRecordBoard({
  encounterId,
  items,
}: {
  encounterId: string;
  items: EncounterDocumentRecord[];
}) {
  const { can } = usePermissions();
  const canWrite = can("clinical:write");
  const mutation = useCreateDocumentRecord(encounterId);
  const accessLinksMutation = useDocumentAccessLinks();
  const printableArtifactMutation = useCreateDocumentPrintableArtifact(encounterId);
  const signatureRequestMutation = useCreateDocumentSignatureRequest(encounterId);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [accessLinksByDocumentId, setAccessLinksByDocumentId] = useState<
    Record<string, EncounterDocumentAccessLinksResponse>
  >({});
  const [documentType, setDocumentType] = useState(DOCUMENT_TYPE_OPTIONS[0]?.value ?? "report");
  const [templateId, setTemplateId] = useState("");
  const [templateVersionId, setTemplateVersionId] = useState("");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => toLocalDateTimeValue(new Date()));
  const [artifactKind, setArtifactKind] = useState("preview");
  const [signerType, setSignerType] = useState("patient");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [providerCode, setProviderCode] = useState("mock");
  const [signatureExpiresAt, setSignatureExpiresAt] = useState(() =>
    toLocalDateTimeValue(addDays(new Date(), 7))
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const templates = useDocumentTemplates(documentType === "custom" ? null : documentType);
  const templateItems = templates.data ?? [];
  const selectedDocument = items.find((item) => item.id === selectedDocumentId) ?? items[0] ?? null;
  const selectedDocumentAccessLinks = selectedDocument
    ? accessLinksByDocumentId[selectedDocument.id] ?? null
    : null;
  const selectedTemplate = templateItems.find((template) => template.id === templateId) ?? null;

  useEffect(() => {
    if (!items.length) {
      setSelectedDocumentId(null);
      return;
    }

    if (!selectedDocumentId || !items.some((item) => item.id === selectedDocumentId)) {
      setSelectedDocumentId(items[0].id);
    }
  }, [items, selectedDocumentId]);

  useEffect(() => {
    if (!templateItems.length) {
      setTemplateId("");
      setTemplateVersionId("");
      return;
    }

    const stillAvailable = templateItems.some((template) => template.id === templateId);
    const nextTemplate = stillAvailable ? selectedTemplate : templateItems[0];

    if (nextTemplate && nextTemplate.id !== templateId) {
      setTemplateId(nextTemplate.id);
    }

    setTemplateVersionId(nextTemplate?.currentVersion?.id ?? "");
    if (nextTemplate && !title.trim()) {
      setTitle(nextTemplate.title);
    }
  }, [templateId, templateItems, selectedTemplate, title]);

  useEffect(() => {
    const nextTemplate = templateItems.find((template) => template.id === templateId);
    if (nextTemplate?.currentVersion?.id) {
      setTemplateVersionId(nextTemplate.currentVersion.id);
    }
  }, [templateId, templateItems]);

  async function handleCreateDocument() {
    if (!canWrite) {
      return;
    }

    const normalizedTitle = title.trim() || selectedTemplate?.title.trim() || "";
    if (!normalizedTitle) {
      setErrorMessage("Defina um titulo para o documento.");
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const created = await mutation.mutateAsync({
        documentType,
        templateId: templateId || undefined,
        title: normalizedTitle,
        summary: summary.trim() || undefined,
        issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
        content: {
          templateVersionId: templateVersionId || null,
          summary: summary.trim() || null,
        },
      });

      setSelectedDocumentId(created.id);
      setIssuedAt(toLocalDateTimeValue(new Date()));
      setSummary("");
      setTitle(selectedTemplate?.title ?? normalizedTitle);
      setSuccessMessage("Documento criado com sucesso.");
    } catch {
      setErrorMessage("Erro ao criar documento.");
    }
  }

  async function handleCreatePrintableArtifact() {
    if (!canWrite || !selectedDocument) {
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updated = await printableArtifactMutation.mutateAsync({
        documentId: selectedDocument.id,
        input: {
          artifactKind,
        },
      });

      setSelectedDocumentId(updated.id);
      setAccessLinksByDocumentId((current) => {
        const next = { ...current };
        delete next[updated.id];
        return next;
      });
      setSuccessMessage("Artefato imprimivel gerado com sucesso.");
    } catch {
      setErrorMessage("Erro ao gerar artefato imprimivel.");
    }
  }

  async function handleRequestSignature() {
    if (!canWrite || !selectedDocument) {
      return;
    }

    const trimmedSignerName = signerName.trim();
    const trimmedSignerEmail = signerEmail.trim();
    const expiresAt = signatureExpiresAt ? new Date(signatureExpiresAt) : null;

    if (signatureExpiresAt && expiresAt && Number.isNaN(expiresAt.getTime())) {
      setErrorMessage("A data de expiracao da assinatura e invalida.");
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const updated = await signatureRequestMutation.mutateAsync({
        documentId: selectedDocument.id,
        input: {
          signerType,
          signerName: trimmedSignerName || undefined,
          signerEmail: trimmedSignerEmail || undefined,
          providerCode: providerCode.trim() || undefined,
          expiresAt: expiresAt?.toISOString(),
        },
      });

      setSelectedDocumentId(updated.id);
      setSuccessMessage("Solicitacao de assinatura registrada com sucesso.");
    } catch {
      setErrorMessage("Erro ao solicitar assinatura.");
    }
  }

  async function resolveSelectedDocumentAccessLinks() {
    if (!selectedDocument) {
      return null;
    }

    setErrorMessage(null);

    try {
      const payload = await accessLinksMutation.mutateAsync(selectedDocument.id);
      setAccessLinksByDocumentId((current) => ({
        ...current,
        [selectedDocument.id]: payload,
      }));
      return payload;
    } catch {
      setSuccessMessage(null);
      setErrorMessage("Erro ao preparar links seguros do documento.");
      return null;
    }
  }

  async function getFreshSelectedDocumentAccessLinks() {
    if (selectedDocumentAccessLinks && !isAccessLinksExpired(selectedDocumentAccessLinks)) {
      return selectedDocumentAccessLinks;
    }

    return resolveSelectedDocumentAccessLinks();
  }

  async function handleOpenCurrentVersion(mode: "open" | "download") {
    const payload = await getFreshSelectedDocumentAccessLinks();
    const link = payload?.currentVersion;

    if (!link) {
      setSuccessMessage(null);
      setErrorMessage("Nenhum artefato atual disponivel para acesso seguro.");
      return;
    }

    openDocumentAccessLink(mode === "download" ? link.downloadUrl : link.openUrl);
  }

  async function handleOpenArtifactLink(artifactId: string, mode: "open" | "download") {
    const artifact =
      selectedDocument?.printableArtifacts?.find((item) => item.id === artifactId) ?? null;

    if (mode === "open" && !canOpenArtifactInline(artifact?.artifactKind, artifact?.renderStatus)) {
      setSuccessMessage(null);
      setErrorMessage("Este artefato esta disponivel apenas para download seguro.");
      return;
    }

    const payload = await getFreshSelectedDocumentAccessLinks();
    const link = payload?.artifacts.find((item) => item.id === artifactId) ?? null;

    if (!link) {
      setSuccessMessage(null);
      setErrorMessage("Nenhum link seguro foi encontrado para este artefato.");
      return;
    }

    openDocumentAccessLink(mode === "download" ? link.downloadUrl : link.openUrl);
  }

  return (
    <Card className="overflow-hidden border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-emerald-50/40">
      <div className="flex flex-col gap-2 border-b border-slate-200/70 px-5 py-5">
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-slate-950">Documentos do atendimento</h2>
          <p className="text-sm text-slate-500">
            Visao leve de lista, detalhe e emissao dedicada no mesmo encounter.
          </p>
        </div>
        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
          {items.length} documento(s) neste atendimento
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-5 p-5">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900">Lista e detalhe</p>
            <p className="text-sm text-slate-500">
              Selecione um documento para revisar estado, assinatura e versao atual.
            </p>
          </div>

          <div className="space-y-3">
            {items.length ? (
              items.map((document) => {
                const isSelected = document.id === selectedDocument?.id;

                return (
                  <button
                    key={document.id}
                    type="button"
                    onClick={() => setSelectedDocumentId(document.id)}
                    className={[
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      isSelected
                        ? "border-emerald-200 bg-emerald-50/80 shadow-sm"
                        : "border-slate-200 bg-white/80 hover:border-slate-300 hover:bg-white",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-slate-950">{document.title}</p>
                        <p className="text-xs uppercase tracking-wide text-slate-500">
                          {formatDocumentType(document.documentType)}
                          {document.documentNumber ? ` • ${document.documentNumber}` : ""}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
                        {formatDocumentStatus(document.status)}
                      </span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{document.issuedAt ? `Emitido em ${formatDateTime(document.issuedAt)}` : "Sem emissao"}</span>
                      {document.template ? <span>Modelo {document.template.title}</span> : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="rounded-2xl border border-dashed border-slate-200 bg-white/80 px-4 py-5 text-sm text-slate-500">
                Nenhum documento emitido para este atendimento ainda.
              </p>
            )}
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-950">Detalhe do documento</p>
                <p className="text-sm text-slate-500">
                  Contexto resumido para apoiar emissao, assinatura e follow-up.
                </p>
              </div>
              {selectedDocument ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                  {formatDocumentStatus(selectedDocument.status)}
                </span>
              ) : null}
            </div>

            {selectedDocument ? (
              <div className="mt-4 space-y-4 text-sm text-slate-600">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Titulo" value={selectedDocument.title} />
                  <Field label="Tipo" value={formatDocumentType(selectedDocument.documentType)} />
                  <Field label="Numero" value={selectedDocument.documentNumber ?? "Sem numero"} />
                  <Field label="Emitido em" value={selectedDocument.issuedAt ? formatDateTime(selectedDocument.issuedAt) : "Sem emissao"} />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Template"
                    value={selectedDocument.template ? selectedDocument.template.title : "Sem template vinculado"}
                  />
                  <Field
                    label="Versao"
                    value={
                      selectedDocument.currentVersion?.versionNumber
                        ? `Versao ${selectedDocument.currentVersion.versionNumber}`
                        : "Sem versao publicada"
                    }
                  />
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {selectedDocument.summary ?? "Nenhum resumo estruturado para este documento."}
                  </p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="Assinatura" value={selectedDocument.signedAt ? formatDateTime(selectedDocument.signedAt) : "Nao assinado"} />
                  <Field
                    label="Artefatos"
                    value={
                      selectedDocument.printableArtifacts?.length
                        ? `${selectedDocument.printableArtifacts.length} artefato(s)`
                        : "Sem artefato imprimivel"
                    }
                  />
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Download seguro
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        Gera signed URLs temporarias para abrir ou baixar o artefato sem expor o bucket privado.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void resolveSelectedDocumentAccessLinks()}
                      disabled={!selectedDocument || accessLinksMutation.isPending}
                    >
                      {accessLinksMutation.isPending ? "Preparando..." : "Preparar links"}
                    </Button>
                  </div>

                  <div className="mt-4 space-y-3">
                    <AccessLinkRow
                      title="Versao atual do documento"
                      description={
                        selectedDocumentAccessLinks?.currentVersion
                          ? isAccessLinksExpired(selectedDocumentAccessLinks)
                            ? "Link expirado; abrir ou baixar vai preparar um novo acesso seguro."
                            : `Link valido ate ${formatDateTime(selectedDocumentAccessLinks.currentVersion.expiresAt)}`
                          : "Gere os links para abrir a versao atual com expiracao curta."
                      }
                      status={selectedDocument.currentVersion?.status ?? selectedDocument.status}
                      onOpen={
                        selectedDocument.currentVersion || selectedDocumentAccessLinks?.currentVersion
                          ? () => void handleOpenCurrentVersion("open")
                          : undefined
                      }
                      onDownload={
                        selectedDocument.currentVersion || selectedDocumentAccessLinks?.currentVersion
                          ? () => void handleOpenCurrentVersion("download")
                          : undefined
                      }
                    />

                    {selectedDocument.printableArtifacts?.length ? (
                      selectedDocument.printableArtifacts.map((artifact) => {
                        const accessLink =
                          selectedDocumentAccessLinks?.artifacts.find((item) => item.id === artifact.id) ??
                          null;

                        return (
                          <AccessLinkRow
                            key={artifact.id}
                            title={formatArtifactKindLabel(artifact.artifactKind)}
                            description={
                              accessLink
                                ? selectedDocumentAccessLinks && isAccessLinksExpired(selectedDocumentAccessLinks)
                                  ? "Link expirado; abrir ou baixar vai preparar um novo acesso seguro."
                                  : `Link valido ate ${formatDateTime(accessLink.expiresAt)}`
                                : artifact.renderedAt
                                  ? `Renderizado em ${formatDateTime(artifact.renderedAt)}`
                                  : "Gere os links para abrir este artefato."
                            }
                            status={artifact.renderStatus}
                            onOpen={
                              canOpenArtifactInline(artifact.artifactKind, artifact.renderStatus) &&
                              (artifact.storageObjectPath || accessLink)
                                ? () => void handleOpenArtifactLink(artifact.id, "open")
                                : undefined
                            }
                            onDownload={
                              canDownloadArtifact(artifact.renderStatus) &&
                              (artifact.storageObjectPath || accessLink)
                                ? () => void handleOpenArtifactLink(artifact.id, "download")
                                : undefined
                            }
                          />
                        );
                      })
                    ) : (
                      <p className="text-sm text-slate-500">
                        Gere um preview, HTML, PDF ou pacote de impressao para liberar o acesso seguro.
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assinaturas</p>
                  <div className="mt-2 space-y-2">
                    {selectedDocument.signatureRequests?.length ? (
                      selectedDocument.signatureRequests.map((request) => (
                        <div key={request.id} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-medium text-slate-900">
                              {formatSignerType(request.signerType)}
                            </p>
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              {formatSignatureStatus(request.requestStatus)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            Solicitado em {request.requestedAt ? formatDateTime(request.requestedAt) : "sem data"}
                            {request.completedAt ? ` • concluido em ${formatDateTime(request.completedAt)}` : ""}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            <span className="rounded-full bg-white px-2 py-1 font-medium uppercase tracking-wide text-slate-600">
                              {request.providerCode ?? "mock"}
                            </span>
                            {request.externalRequestId ? (
                              <span>Envelope {request.externalRequestId}</span>
                            ) : null}
                            {request.latestDispatch ? (
                              <span>
                                Dispatch {formatDispatchStatus(request.latestDispatch.dispatchStatus)}
                                {request.latestDispatch.completedAt
                                  ? ` em ${formatDateTime(request.latestDispatch.completedAt)}`
                                  : ""}
                              </span>
                            ) : (
                              <span>Sem tentativa de dispatch registrada</span>
                            )}
                            {request.latestDispatch?.errorMessage ? (
                              <span className="text-rose-600">{request.latestDispatch.errorMessage}</span>
                            ) : null}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">Nenhuma assinatura solicitada ainda.</p>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Artefato imprimivel</p>
                    <div className="mt-3 space-y-3">
                      <label className="grid gap-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-900">Formato</span>
                        <select
                          className="field-base"
                          value={artifactKind}
                          onChange={(event) => setArtifactKind(event.target.value)}
                          disabled={!canWrite || printableArtifactMutation.isPending || !selectedDocument}
                        >
                          <option value="preview">Preview</option>
                          <option value="html">HTML</option>
                          <option value="pdf">PDF</option>
                          <option value="print_package">Pacote de impressao</option>
                        </select>
                      </label>
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => void handleCreatePrintableArtifact()}
                        disabled={
                          !canWrite ||
                          printableArtifactMutation.isPending ||
                          !selectedDocument
                        }
                      >
                        {printableArtifactMutation.isPending ? "Gerando..." : "Gerar artefato"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assinatura</p>
                    <div className="mt-3 space-y-3">
                      <label className="grid gap-2 text-xs text-slate-600">
                        <span className="font-medium text-slate-900">Perfil</span>
                        <select
                          className="field-base"
                          value={signerType}
                          onChange={(event) => setSignerType(event.target.value)}
                          disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                        >
                          <option value="patient">Paciente</option>
                          <option value="professional">Profissional</option>
                          <option value="guardian">Responsavel</option>
                          <option value="witness">Testemunha</option>
                          <option value="other">Outro</option>
                        </select>
                      </label>
                      <Input
                        value={signerName}
                        onChange={(event) => setSignerName(event.target.value)}
                        placeholder="Nome do signatario (opcional)"
                        disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                      />
                      <Input
                        type="email"
                        value={signerEmail}
                        onChange={(event) => setSignerEmail(event.target.value)}
                        placeholder="Email do signatario (opcional)"
                        disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                      />
                      <Input
                        value={providerCode}
                        onChange={(event) => setProviderCode(event.target.value)}
                        placeholder="codigo do provedor"
                        disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                      />
                      <Input
                        type="datetime-local"
                        value={signatureExpiresAt}
                        onChange={(event) => setSignatureExpiresAt(event.target.value)}
                        disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        className="w-full"
                        onClick={() => void handleRequestSignature()}
                        disabled={!canWrite || signatureRequestMutation.isPending || !selectedDocument}
                      >
                        {signatureRequestMutation.isPending ? "Solicitando..." : "Solicitar assinatura"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Selecione um documento para ver o detalhe operacional.
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-slate-200/80 bg-white/90 p-5 xl:border-l xl:border-t-0">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-950">Nova emissao documental</p>
            <p className="text-sm text-slate-500">
              Escolha um tipo, um template e crie a primeira versao do documento no atendimento.
            </p>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">Tipo do documento</span>
              <select
                className="field-base"
                value={documentType}
                onChange={(event) => {
                  setDocumentType(event.target.value);
                  setTemplateId("");
                  setTemplateVersionId("");
                }}
                disabled={!canWrite || mutation.isPending}
              >
                {DOCUMENT_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">Modelo</span>
              <select
                className="field-base"
                value={templateId}
                onChange={(event) => {
                  const nextTemplate = templateItems.find((template) => template.id === event.target.value) ?? null;
                  setTemplateId(event.target.value);
                  setTemplateVersionId(nextTemplate?.currentVersion?.id ?? "");
                  if (nextTemplate && !title.trim()) {
                    setTitle(nextTemplate.title);
                  }
                  if (nextTemplate?.currentVersion?.summary && !summary.trim()) {
                    setSummary(nextTemplate.currentVersion.summary);
                  }
                }}
                disabled={!canWrite || mutation.isPending || templates.isLoading || !templateItems.length}
              >
                {!templateItems.length ? <option value="">Sem modelos para este tipo</option> : null}
                {templateItems.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.title}
                    {template.currentVersion?.versionNumber ? ` v${template.currentVersion.versionNumber}` : ""}
                  </option>
                ))}
              </select>
              {templates.isLoading ? <span className="text-xs text-slate-500">Carregando modelos...</span> : null}
            </label>

            <div className="grid gap-4">
              <label className="grid gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">Titulo</span>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="Ex.: Relatorio de evolucao do paciente"
                  disabled={!canWrite || mutation.isPending}
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-600">
                <span className="font-medium text-slate-900">Emitido em</span>
                <Input
                  type="datetime-local"
                  value={issuedAt}
                  onChange={(event) => setIssuedAt(event.target.value)}
                  disabled={!canWrite || mutation.isPending}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">Resumo</span>
              <textarea
                className="min-h-28 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Resumo curto do documento e do contexto clinico."
                disabled={!canWrite || mutation.isPending}
              />
            </label>

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              Inspirado no fluxo do SlimCare: lista operacional, detalhe contextual e criacao guiada a partir de modelos.
            </div>

            <div className="flex flex-col gap-2 text-sm">
              {!canWrite ? (
                <p className="text-slate-500">Sua sessao esta em modo somente leitura para documentos.</p>
              ) : null}
              {templates.isError ? <p className="text-red-600">Erro ao carregar modelos de documento.</p> : null}
              {mutation.isError ? <p className="text-red-600">Erro ao criar documento.</p> : null}
              {errorMessage ? <p className="text-red-600">{errorMessage}</p> : null}
              {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
            </div>

            <Button
              type="button"
              onClick={() => void handleCreateDocument()}
              disabled={!canWrite || mutation.isPending || templates.isLoading}
            >
              {mutation.isPending ? "Criando..." : "Criar documento"}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function AccessLinkRow({
  title,
  description,
  status,
  onOpen,
  onDownload,
}: {
  title: string;
  description: string;
  status: string;
  onOpen?: (() => void) | undefined;
  onDownload?: (() => void) | undefined;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-600">
            {status}
          </span>
          {onOpen ? (
            <Button type="button" variant="secondary" size="sm" onClick={onOpen}>
              Abrir
            </Button>
          ) : null}
          {onDownload ? (
            <Button type="button" variant="secondary" size="sm" onClick={onDownload}>
              Baixar
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function toLocalDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDocumentType(value: string) {
  switch (value) {
    case "report":
      return "Relatorio";
    case "consent":
      return "Consentimento";
    case "prescription":
      return "Prescricao";
    case "orientation":
      return "Orientacao";
    case "exam_request":
      return "Solicitacao de exame";
    case "certificate":
      return "Atestado";
    default:
      return "Personalizado";
  }
}

function formatDocumentStatus(value: string) {
  switch (value) {
    case "issued":
      return "Emitido";
    case "signed":
      return "Assinado";
    case "revoked":
      return "Revogado";
    case "archived":
      return "Arquivado";
    default:
      return "Rascunho";
  }
}

function formatSignatureStatus(value: string) {
  switch (value) {
    case "sent":
      return "Enviada";
    case "viewed":
      return "Visualizada";
    case "signed":
      return "Assinada";
    case "declined":
      return "Recusada";
    case "expired":
      return "Expirada";
    case "cancelled":
      return "Cancelada";
    default:
      return "Pendente";
  }
}

function formatDispatchStatus(value: string) {
  switch (value) {
    case "sent":
      return "enviado";
    case "failed":
      return "falhou";
    case "skipped":
      return "registrado localmente";
    default:
      return "pendente";
  }
}

function formatSignerType(value: string) {
  switch (value) {
    case "patient":
      return "Paciente";
    case "professional":
      return "Profissional";
    case "guardian":
      return "Responsavel";
    case "witness":
      return "Testemunha";
    default:
      return "Outro signatario";
  }
}

function formatArtifactKindLabel(value: string) {
  switch (value) {
    case "preview":
      return "Preview HTML";
    case "html":
      return "Documento HTML";
    case "pdf":
      return "PDF";
    case "print_package":
      return "Pacote de impressao";
    default:
      return "Artefato documental";
  }
}

function canDownloadArtifact(renderStatus: string | null | undefined) {
  return !renderStatus || renderStatus === "rendered";
}

function canOpenArtifactInline(
  artifactKind: string | null | undefined,
  renderStatus: string | null | undefined,
) {
  if (!canDownloadArtifact(renderStatus)) {
    return false;
  }

  return artifactKind !== "print_package";
}

function isAccessLinksExpired(payload: EncounterDocumentAccessLinksResponse) {
  const expiresAt = Date.parse(payload.expiresAt);
  if (Number.isNaN(expiresAt)) {
    return true;
  }

  return Date.now() + 30_000 >= expiresAt;
}

function openDocumentAccessLink(url: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}
