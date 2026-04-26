import type { Badge } from "@/components/ui/badge";

type BadgeTone = Parameters<typeof Badge>[0]["tone"];

export const documentTypeOptions = [
  { value: "report", label: "Relatorio" },
  { value: "consent", label: "Consentimento" },
  { value: "prescription", label: "Prescricao" },
  { value: "orientation", label: "Orientacao" },
  { value: "exam_request", label: "Solicitacao de exame" },
  { value: "certificate", label: "Atestado" },
  { value: "custom", label: "Personalizado" },
];

export const documentStatusOptions = [
  { value: "draft", label: "Rascunho" },
  { value: "issued", label: "Emitido" },
  { value: "signed", label: "Assinado" },
  { value: "revoked", label: "Revogado" },
  { value: "archived", label: "Arquivado" },
];

export const signatureStatusOptions = [
  { value: "pending", label: "Pendente" },
  { value: "sent", label: "Enviada" },
  { value: "viewed", label: "Visualizada" },
  { value: "signed", label: "Assinada" },
  { value: "declined", label: "Recusada" },
  { value: "expired", label: "Expirada" },
  { value: "cancelled", label: "Cancelada" },
];

export function formatDocumentType(value: string) {
  return documentTypeOptions.find((option) => option.value === value)?.label ?? "Personalizado";
}

export function formatDocumentStatus(value: string) {
  return documentStatusOptions.find((option) => option.value === value)?.label ?? value;
}

export function getDocumentStatusTone(value: string): BadgeTone {
  switch (value) {
    case "signed":
      return "success";
    case "issued":
      return "warning";
    case "revoked":
      return "danger";
    default:
      return "default";
  }
}

export function formatSignatureStatus(value: string) {
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

export function getSignatureStatusTone(value: string): BadgeTone {
  switch (value) {
    case "signed":
      return "success";
    case "declined":
    case "expired":
    case "cancelled":
      return "danger";
    case "sent":
    case "viewed":
      return "warning";
    default:
      return "default";
  }
}

export function formatEvidenceStatus(value: string) {
  switch (value) {
    case "complete":
      return "Completa";
    case "failed":
      return "Erro";
    case "superseded":
      return "Substituida";
    case "missing":
      return "Sem evidencia";
    default:
      return "Parcial";
  }
}

export function getEvidenceStatusTone(value: string): BadgeTone {
  switch (value) {
    case "complete":
      return "success";
    case "failed":
      return "danger";
    case "partial":
      return "warning";
    default:
      return "default";
  }
}

export function formatVerificationStatus(value: string) {
  switch (value) {
    case "verified":
      return "Verificada";
    case "pending":
      return "Pendente";
    case "failed":
      return "Falhou";
    default:
      return "Nao exigida";
  }
}

export function formatArtifactKind(value: string) {
  switch (value) {
    case "preview":
      return "Preview";
    case "html":
      return "HTML";
    case "pdf":
      return "PDF";
    case "print_package":
      return "Pacote";
    default:
      return "Artefato";
  }
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Data invalida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

export function formatDate(value: string | null | undefined) {
  if (!value) {
    return "Sem data";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Data invalida";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(parsed);
}
