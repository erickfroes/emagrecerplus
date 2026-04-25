import type { EncounterDocumentAccessLinksResponse } from "@/modules/clinical/api/get-document-access-links";

export function selectPreferredAccessLink(payload: EncounterDocumentAccessLinksResponse) {
  return (
    payload.currentVersion ??
    payload.artifacts.find((artifact) => artifact.artifactKind === "pdf") ??
    payload.artifacts[0] ??
    null
  );
}

export function openDocumentAccessLink(url: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyToClipboard(value: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Clipboard indisponivel.");
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand("copy");
    if (!copied) {
      throw new Error("Clipboard indisponivel.");
    }
  } finally {
    document.body.removeChild(textArea);
  }
}
