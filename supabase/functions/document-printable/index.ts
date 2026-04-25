import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createEdgeServiceClient } from "../_shared/supabase.ts";

type ResolvedLogoAsset = {
  alt: string;
  src: string;
};

type PresentationTheme = {
  accentColor: string;
  accentSoftColor: string;
  accentStrongColor: string;
  borderColor: string;
  brandName: string | null;
  brandTagline: string | null;
  contentVariant: "cards" | "plain";
  footerText: string | null;
  hasCustomPresentation: boolean;
  headerAlign: "left" | "center" | "right";
  headerJustify: "flex-start" | "center" | "flex-end";
  mutedColor: string;
  pageBackground: string;
  pagePadding: string;
  pageWidth: string;
  secondaryAccentColor: string;
  showMeta: boolean;
  showSummary: boolean;
  surfaceColor: string;
  textColor: string;
};

const CONFIG_SECTION_KEYS = new Set([
  "brand",
  "branding",
  "documentbranding",
  "documentlayout",
  "layout",
  "printbranding",
  "printlayout",
  "printablebranding",
  "printablelayout",
]);

const LAYOUT_HINT_KEYS = new Set([
  "align",
  "content",
  "contentstyle",
  "container",
  "containerwidth",
  "footer",
  "header",
  "headeralign",
  "hidemeta",
  "hidesummary",
  "meta",
  "page",
  "pagewidth",
  "padding",
  "sectionstyle",
  "showmeta",
  "showsummary",
  "titlealign",
  "variant",
  "width",
]);

const BRANDING_HINT_KEYS = new Set([
  "accent",
  "accentcolor",
  "brandname",
  "colors",
  "displayname",
  "footer",
  "footertext",
  "logo",
  "logoalt",
  "logopath",
  "logourl",
  "name",
  "palette",
  "primary",
  "primarycolor",
  "secondary",
  "secondarycolor",
  "subtitle",
  "tagline",
  "title",
]);

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "sim", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "nao", "off"].includes(normalized)) {
    return false;
  }

  return null;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTextValue(value: string) {
  return `<span class="text-value">${escapeHtml(value)}</span>`;
}

function renderJsonValue(value: unknown): string {
  if (Array.isArray(value)) {
    const items = value.map((item) => `<li>${renderJsonValue(item)}</li>`).join("");
    return `<ul>${items}</ul>`;
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(
        ([key, entryValue]) =>
          `<div><strong>${escapeHtml(key)}:</strong> ${renderJsonValue(entryValue)}</div>`,
      )
      .join("");
    return `<div class="json-block">${entries}</div>`;
  }

  if (value === null || value === undefined || value === "") {
    return '<span class="muted">Nao informado</span>';
  }

  return renderTextValue(String(value));
}

async function sha256Hex(value: string) {
  return sha256HexBytes(new TextEncoder().encode(value));
}

async function sha256HexBytes(payload: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return Array.from(new Uint8Array(digest))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeArtifactKind(value: string | null) {
  switch (value?.trim().toLowerCase()) {
    case "preview":
      return "preview";
    case "pdf":
      return "pdf";
    case "print_package":
    case "print-package":
      return "print_package";
    case "html":
    default:
      return "html";
  }
}

function slugifyFileName(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "documento";
}

function resolveStorageScope(patientDocument: Record<string, unknown>) {
  const tenantId = asNonEmptyString(patientDocument.tenantId);
  const patientId = asNonEmptyString(patientDocument.patientId);
  const runtimeDocumentId =
    asNonEmptyString(patientDocument.runtimeId) ??
    asNonEmptyString(patientDocument.id);

  if (!tenantId || !patientId || !runtimeDocumentId) {
    return null;
  }

  return {
    patientId,
    runtimeDocumentId,
    tenantId,
  };
}

function pickFirstValue(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): unknown {
  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const key of keys) {
      if (key in source) {
        const value = source[key];
        if (value !== null && value !== undefined && value !== "") {
          return value;
        }
      }
    }
  }

  return null;
}

function pickFirstString(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): string | null {
  const value = pickFirstValue(sources, keys);
  return asNonEmptyString(value);
}

function pickFirstBoolean(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): boolean | null {
  const value = pickFirstValue(sources, keys);
  return asBoolean(value);
}

function pickFirstRecordByKeys(
  sources: Array<Record<string, unknown> | null | undefined>,
  keys: string[],
): Record<string, unknown> | null {
  const value = pickFirstValue(sources, keys);
  return isRecord(value) ? value : null;
}

function hasAnyKeys(source: Record<string, unknown>, hintKeys: Set<string>) {
  return Object.keys(source).some((key) => hintKeys.has(key.toLowerCase()));
}

function looksLikeLayoutConfig(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && hasAnyKeys(value, LAYOUT_HINT_KEYS);
}

function looksLikeBrandingConfig(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && hasAnyKeys(value, BRANDING_HINT_KEYS);
}

function normalizeCssColor(value: unknown) {
  const normalized = asNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  if (
    /^#[0-9a-fA-F]{3,8}$/.test(normalized) ||
    /^rgba?\([\d\s.,%+-]+\)$/i.test(normalized) ||
    /^hsla?\([\d\s.,%+-]+\)$/i.test(normalized) ||
    /^[a-zA-Z]+$/.test(normalized)
  ) {
    return normalized;
  }

  return null;
}

function normalizeCssLength(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return `${value}px`;
  }

  const normalized = asNonEmptyString(value);
  if (!normalized) {
    return null;
  }

  if (/^\d+(\.\d+)?$/.test(normalized)) {
    return `${normalized}px`;
  }

  if (/^\d+(\.\d+)?(px|rem|em|vw|vh|%)$/i.test(normalized)) {
    return normalized;
  }

  return null;
}

function normalizePageWidth(value: unknown) {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  switch (normalized) {
    case "compact":
      return "680px";
    case "wide":
      return "1040px";
    case "standard":
      return "860px";
    default:
      return normalizeCssLength(value);
  }
}

function normalizeHeaderAlign(value: unknown): PresentationTheme["headerAlign"] {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  switch (normalized) {
    case "center":
      return "center";
    case "right":
      return "right";
    default:
      return "left";
  }
}

function normalizeContentVariant(value: unknown): PresentationTheme["contentVariant"] {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  switch (normalized) {
    case "plain":
    case "minimal":
    case "flat":
      return "plain";
    default:
      return "cards";
  }
}

function toRgba(color: string, alpha: number) {
  const hex = color.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return null;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function resolveAccentPalette(value: string | null) {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case "slate":
      return {
        accentColor: "#475569",
        accentSoftColor: "rgba(71, 85, 105, 0.14)",
        accentStrongColor: "#334155",
        secondaryAccentColor: "#64748b",
      };
    case "indigo":
      return {
        accentColor: "#4f46e5",
        accentSoftColor: "rgba(79, 70, 229, 0.14)",
        accentStrongColor: "#4338ca",
        secondaryAccentColor: "#6366f1",
      };
    case "emerald":
    default:
      return {
        accentColor: "#059669",
        accentSoftColor: "rgba(5, 150, 105, 0.14)",
        accentStrongColor: "#047857",
        secondaryAccentColor: "#10b981",
      };
  }
}

function resolveVisibility(options: {
  fallback: boolean;
  hideKeys: string[];
  showKeys: string[];
  sources: Array<Record<string, unknown> | null | undefined>;
}) {
  const explicitShow = pickFirstBoolean(options.sources, options.showKeys);
  if (explicitShow !== null) {
    return explicitShow;
  }

  const explicitHide = pickFirstBoolean(options.sources, options.hideKeys);
  if (explicitHide !== null) {
    return !explicitHide;
  }

  return options.fallback;
}

function normalizeTone(value: unknown): "default" | "muted" | "accent" {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  switch (normalized) {
    case "accent":
    case "highlight":
    case "brand":
      return "accent";
    case "muted":
    case "soft":
    case "subtle":
      return "muted";
    default:
      return "default";
  }
}

function resolveStructuredBlock(
  value: unknown,
  fallbackTitle: string,
): { bodyHtml: string; title: string; tone: "default" | "muted" | "accent" } | null {
  if (!isRecord(value)) {
    return null;
  }

  const title =
    asNonEmptyString(value.title) ??
    asNonEmptyString(value.label) ??
    asNonEmptyString(value.heading) ??
    fallbackTitle;
  const body =
    asNonEmptyString(value.content) ??
    asNonEmptyString(value.body) ??
    asNonEmptyString(value.text) ??
    asNonEmptyString(value.description) ??
    asNonEmptyString(value.summary);

  if (!body) {
    return null;
  }

  return {
    title,
    tone: normalizeTone(value.tone ?? value.variant),
    bodyHtml: `<div class="block-copy">${renderTextValue(body)}</div>`,
  };
}

function renderContentSections(content: Record<string, unknown>) {
  const sections: string[] = [];

  for (const [key, value] of Object.entries(content)) {
    if (CONFIG_SECTION_KEYS.has(key.toLowerCase())) {
      continue;
    }

    if (key === "blocks" && Array.isArray(value)) {
      const resolvedBlocks = value.map((item, index) =>
        resolveStructuredBlock(item, `Bloco ${index + 1}`)
      );
      const structuredBlocks = resolvedBlocks.every(Boolean)
        ? resolvedBlocks.filter(
            (
              item,
            ): item is { bodyHtml: string; title: string; tone: "default" | "muted" | "accent" } =>
              Boolean(item),
          )
        : [];
      const blockSections = structuredBlocks.map(
        (item) => `
          <section class="block tone-${item.tone}">
            <h2>${escapeHtml(item.title)}</h2>
            ${item.bodyHtml}
          </section>
        `,
      );

      if (blockSections.length > 0) {
        sections.push(blockSections.join(""));
        continue;
      }
    }

    const structuredBlock = resolveStructuredBlock(value, key);
    if (structuredBlock) {
      sections.push(`
        <section class="block tone-${structuredBlock.tone}">
          <h2>${escapeHtml(structuredBlock.title)}</h2>
          ${structuredBlock.bodyHtml}
        </section>
      `);
      continue;
    }

    sections.push(`
      <section class="block">
        <h2>${escapeHtml(key)}</h2>
        ${renderJsonValue(value)}
      </section>
    `);
  }

  return sections.join("");
}

function resolveStructuredTextBlock(
  value: unknown,
  fallbackTitle: string,
): { body: string; title: string } | null {
  if (!isRecord(value)) {
    return null;
  }

  const title =
    asNonEmptyString(value.title) ??
    asNonEmptyString(value.label) ??
    asNonEmptyString(value.heading) ??
    fallbackTitle;
  const body =
    asNonEmptyString(value.content) ??
    asNonEmptyString(value.body) ??
    asNonEmptyString(value.text) ??
    asNonEmptyString(value.description) ??
    asNonEmptyString(value.summary);

  return body ? { body, title } : null;
}

function renderPlainTextValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => renderPlainTextValue(item)).filter(Boolean).join("; ");
  }

  if (isRecord(value)) {
    return Object.entries(value)
      .map(([key, entryValue]) => `${key}: ${renderPlainTextValue(entryValue)}`)
      .filter(Boolean)
      .join("\n");
  }

  if (value === null || value === undefined || value === "") {
    return "Nao informado";
  }

  return String(value);
}

function collectPrintableTextSections(content: Record<string, unknown>) {
  const sections: Array<{ body: string; title: string }> = [];

  for (const [key, value] of Object.entries(content)) {
    if (CONFIG_SECTION_KEYS.has(key.toLowerCase())) {
      continue;
    }

    if (key === "blocks" && Array.isArray(value)) {
      for (const [index, item] of value.entries()) {
        const structuredBlock = resolveStructuredTextBlock(item, `Bloco ${index + 1}`);
        if (structuredBlock) {
          sections.push(structuredBlock);
        }
      }
      continue;
    }

    const structuredBlock = resolveStructuredTextBlock(value, key);
    if (structuredBlock) {
      sections.push(structuredBlock);
      continue;
    }

    sections.push({
      body: renderPlainTextValue(value),
      title: key,
    });
  }

  return sections;
}

function normalizePdfText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\x20-\x7e\n\r\t]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapPdfLine(value: string, maxChars: number) {
  const words = normalizePdfText(value).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (`${currentLine} ${word}`.length > maxChars) {
      lines.push(currentLine);
      currentLine = word;
      continue;
    }

    currentLine = `${currentLine} ${word}`;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.length ? lines : [""];
}

function escapePdfString(value: string) {
  return normalizePdfText(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function buildPdfTextLines(params: {
  content: Record<string, unknown>;
  documentId: string;
  documentNumber: unknown;
  documentSummary: string;
  documentTitle: string;
  documentType: unknown;
  issuedAt: unknown;
  renderedAt: string;
  theme: PresentationTheme;
}) {
  const lines: Array<{ size: number; text: string }> = [];
  const maxChars = 90;

  lines.push({ size: 18, text: params.documentTitle });
  if (params.documentSummary) {
    for (const line of wrapPdfLine(params.documentSummary, maxChars)) {
      lines.push({ size: 11, text: line });
    }
  }

  if (params.theme.brandName) {
    lines.push({ size: 10, text: `Instituicao: ${params.theme.brandName}` });
  }

  if (params.theme.showMeta) {
    lines.push({ size: 10, text: `Documento: ${params.documentId}` });
    lines.push({ size: 10, text: `Tipo: ${String(params.documentType ?? "custom")}` });
    lines.push({ size: 10, text: `Numero: ${String(params.documentNumber ?? "Sem numero")}` });
    lines.push({ size: 10, text: `Emitido em: ${String(params.issuedAt ?? params.renderedAt)}` });
    lines.push({ size: 10, text: `Gerado em: ${params.renderedAt}` });
  }

  lines.push({ size: 8, text: "" });

  for (const section of collectPrintableTextSections(params.content)) {
    lines.push({ size: 13, text: section.title });
    for (const line of wrapPdfLine(section.body, maxChars)) {
      lines.push({ size: 10, text: line });
    }
    lines.push({ size: 8, text: "" });
  }

  if (params.theme.footerText) {
    lines.push({ size: 8, text: "" });
    for (const line of wrapPdfLine(params.theme.footerText, maxChars)) {
      lines.push({ size: 9, text: line });
    }
  }

  return lines;
}

function buildPdfDocument(params: {
  content: Record<string, unknown>;
  documentId: string;
  documentNumber: unknown;
  documentSummary: string;
  documentTitle: string;
  documentType: unknown;
  issuedAt: unknown;
  renderedAt: string;
  theme: PresentationTheme;
}) {
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 56;
  const topY = 786;
  const bottomY = 56;
  const textLines = buildPdfTextLines(params);
  const pages: Array<Array<{ size: number; text: string }>> = [[]];
  let cursorY = topY;

  for (const line of textLines) {
    const lineHeight = Math.max(14, line.size + 5);
    if (cursorY - lineHeight < bottomY && pages.at(-1)?.length) {
      pages.push([]);
      cursorY = topY;
    }

    pages.at(-1)!.push(line);
    cursorY -= lineHeight;
  }

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const fontObjectId = 3;
  let nextObjectId = 4;

  for (const pageLines of pages) {
    const pageObjectId = nextObjectId++;
    const contentObjectId = nextObjectId++;
    pageObjectIds.push(pageObjectId);

    let y = topY;
    const stream = pageLines
      .map((line) => {
        const lineHeight = Math.max(14, line.size + 5);
        const operation = `BT /F1 ${line.size} Tf 1 0 0 1 ${marginX} ${y.toFixed(2)} Tm (${escapePdfString(line.text)}) Tj ET`;
        y -= lineHeight;
        return operation;
      })
      .join("\n");

    objects[contentObjectId] = `${contentObjectId} 0 obj
<< /Length ${stream.length} >>
stream
${stream}
endstream
endobj
`;
    objects[pageObjectId] = `${pageObjectId} 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>
endobj
`;
  }

  objects[1] = `1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
`;
  objects[2] = `2 0 obj
<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageObjectIds.length} >>
endobj
`;
  objects[fontObjectId] = `${fontObjectId} 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    const objectSource = objects[objectId];
    if (!objectSource) {
      continue;
    }

    offsets[objectId] = pdf.length;
    pdf += objectSource;
  }

  const xrefOffset = pdf.length;
  pdf += `xref
0 ${objects.length}
0000000000 65535 f 
`;

  for (let objectId = 1; objectId < objects.length; objectId += 1) {
    const offset = offsets[objectId] ?? 0;
    pdf += `${String(offset).padStart(10, "0")} 00000 n 
`;
  }

  pdf += `trailer
<< /Size ${objects.length} /Root 1 0 R >>
startxref
${xrefOffset}
%%EOF`;

  return new TextEncoder().encode(pdf);
}

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  return [value & 0xff, (value >>> 8) & 0xff];
}

function uint32(value: number) {
  return [
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ];
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function buildZipArchive(files: Array<{ bytes: Uint8Array; name: string }>) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const checksum = crc32(file.bytes);
    const localHeader = new Uint8Array([
      ...uint32(0x04034b50),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(file.bytes.length),
      ...uint32(file.bytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...nameBytes,
    ]);
    localParts.push(localHeader, file.bytes);

    const centralHeader = new Uint8Array([
      ...uint32(0x02014b50),
      ...uint16(20),
      ...uint16(20),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(checksum),
      ...uint32(file.bytes.length),
      ...uint32(file.bytes.length),
      ...uint16(nameBytes.length),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint16(0),
      ...uint32(0),
      ...uint32(offset),
      ...nameBytes,
    ]);
    centralParts.push(centralHeader);
    offset += localHeader.length + file.bytes.length;
  }

  const centralDirectory = concatBytes(centralParts);
  const localData = concatBytes(localParts);
  const endOfCentralDirectory = new Uint8Array([
    ...uint32(0x06054b50),
    ...uint16(0),
    ...uint16(0),
    ...uint16(files.length),
    ...uint16(files.length),
    ...uint32(centralDirectory.length),
    ...uint32(localData.length),
    ...uint16(0),
  ]);

  return concatBytes([localData, centralDirectory, endOfCentralDirectory]);
}

function buildManifest(params: {
  artifactKind: string;
  checksum: string;
  documentId: string;
  documentTitle: string;
  renderedAt: string;
  storageObjectPath: string;
}) {
  return JSON.stringify(
    {
      artifactKind: params.artifactKind,
      checksum: params.checksum,
      documentId: params.documentId,
      documentTitle: params.documentTitle,
      generatedAt: params.renderedAt,
      renderer: "document-printable",
      storageObjectPath: params.storageObjectPath,
    },
    null,
    2,
  );
}

function extractPresentationConfigs(params: {
  currentVersion: Record<string, unknown> | null;
  patientDocument: Record<string, unknown>;
}) {
  const content = isRecord(params.currentVersion?.content) ? params.currentVersion.content : {};
  const renderSchema = isRecord(params.currentVersion?.renderSchema)
    ? params.currentVersion.renderSchema
    : null;
  const currentVersionMetadata = isRecord(params.currentVersion?.metadata)
    ? params.currentVersion.metadata
    : null;
  const documentMetadata = isRecord(params.patientDocument.metadata)
    ? params.patientDocument.metadata
    : null;
  const candidateSources = [
    params.patientDocument,
    params.currentVersion,
    renderSchema,
    currentVersionMetadata,
    documentMetadata,
    content,
  ];

  const explicitLayout = pickFirstRecordByKeys(candidateSources, [
    "layout",
    "documentLayout",
    "printLayout",
    "printableLayout",
  ]);
  const explicitBranding = pickFirstRecordByKeys(candidateSources, [
    "brand",
    "branding",
    "documentBranding",
    "printBranding",
    "printableBranding",
  ]);

  return {
    branding: explicitBranding ?? (looksLikeBrandingConfig(renderSchema) ? renderSchema : null),
    content,
    layout: explicitLayout ?? (looksLikeLayoutConfig(renderSchema) ? renderSchema : null),
  };
}

function buildPresentationTheme(params: {
  brandingConfig: Record<string, unknown> | null;
  layoutConfig: Record<string, unknown> | null;
}) {
  const colorRecord = pickFirstRecordByKeys(
    [params.brandingConfig, params.layoutConfig],
    ["colors", "palette", "theme"],
  );
  const pageRecord = pickFirstRecordByKeys([params.layoutConfig], ["page"]);
  const headerRecord = pickFirstRecordByKeys([params.layoutConfig], ["header"]);
  const footerRecord = pickFirstRecordByKeys([params.layoutConfig, params.brandingConfig], ["footer"]);
  const contentRecord = pickFirstRecordByKeys([params.layoutConfig], ["content"]);
  const metaRecord = pickFirstRecordByKeys([params.layoutConfig], ["meta"]);

  const accentToken =
    pickFirstString([params.brandingConfig, params.layoutConfig, colorRecord], [
      "accentColor",
      "accent",
      "primaryColor",
      "primary",
      "primary_color",
    ]) ?? "emerald";
  const accentPalette = resolveAccentPalette(accentToken);
  const secondaryAccentColor =
    normalizeCssColor(
      pickFirstString([params.brandingConfig, colorRecord], [
        "secondaryColor",
        "secondary",
        "secondary_color",
      ]),
    ) ?? accentPalette.secondaryAccentColor;
  const accentColor = normalizeCssColor(accentToken) ?? accentPalette.accentColor;
  const derivedAccentFallback = accentColor.startsWith("#") ? accentColor : accentPalette.accentColor;
  const secondaryAccentFallback = secondaryAccentColor ?? derivedAccentFallback;
  const accentStrongColor = normalizeCssColor(
    pickFirstString([params.brandingConfig, colorRecord], ["accentStrongColor", "accentStrong"]),
  ) ?? derivedAccentFallback;
  const accentSoftColor =
    normalizeCssColor(
      pickFirstString([params.brandingConfig, colorRecord], ["accentSoftColor", "accentSoft"]),
    ) ??
    toRgba(accentColor, 0.14) ??
    accentPalette.accentSoftColor;
  const headerAlign = normalizeHeaderAlign(
    pickFirstValue([headerRecord, params.layoutConfig], ["align", "headerAlign", "titleAlign"]),
  );
  const hasCustomPresentation = Boolean(params.brandingConfig || params.layoutConfig);

  return {
    accentColor,
    accentSoftColor,
    accentStrongColor,
    borderColor:
      normalizeCssColor(
        pickFirstString([pageRecord, params.brandingConfig, colorRecord], [
          "borderColor",
          "border",
          "border_color",
        ]),
      ) ?? "#e2e8f0",
    brandName: pickFirstString([params.brandingConfig], [
      "brandName",
      "brand_name",
      "displayName",
      "display_name",
      "name",
      "title",
    ]),
    brandTagline: pickFirstString([params.brandingConfig], [
      "tagline",
      "subtitle",
      "description",
    ]),
    contentVariant: normalizeContentVariant(
      pickFirstValue([contentRecord, params.layoutConfig], [
        "contentStyle",
        "sectionStyle",
        "style",
        "variant",
      ]),
    ),
    footerText:
      pickFirstString([params.layoutConfig, params.brandingConfig], ["footer"]) ??
      pickFirstString([footerRecord], ["text", "footerText", "footer_text"]) ??
      pickFirstString([params.brandingConfig], ["footerText", "footer_text", "disclaimer", "legalText"]),
    hasCustomPresentation,
    headerAlign,
    headerJustify:
      headerAlign === "center" ? "center" : headerAlign === "right" ? "flex-end" : "flex-start",
    mutedColor:
      normalizeCssColor(
        pickFirstString([pageRecord, params.brandingConfig, colorRecord], [
          "mutedColor",
          "muted",
          "muted_color",
        ]),
      ) ?? "#64748b",
    pageBackground:
      normalizeCssColor(
        pickFirstString([pageRecord, params.brandingConfig, colorRecord], [
          "backgroundColor",
          "background",
          "pageBackground",
          "pageBackgroundColor",
          "background_color",
        ]),
      ) ?? "#f8fafc",
    pagePadding:
      normalizeCssLength(
        pickFirstValue([pageRecord, params.layoutConfig], ["pagePadding", "padding", "page_padding"]),
      ) ?? "24px",
    pageWidth:
      normalizePageWidth(
        pickFirstValue([pageRecord, params.layoutConfig], [
          "pageWidth",
          "width",
          "maxWidth",
          "containerWidth",
          "container",
        ]),
      ) ?? "860px",
    secondaryAccentColor: secondaryAccentFallback,
    showMeta: resolveVisibility({
      fallback: true,
      hideKeys: ["hideMeta"],
      showKeys: ["showMeta"],
      sources: [metaRecord, params.layoutConfig],
    }),
    showSummary: resolveVisibility({
      fallback: true,
      hideKeys: ["hideSummary"],
      showKeys: ["showSummary"],
      sources: [headerRecord, params.layoutConfig],
    }),
    surfaceColor:
      normalizeCssColor(
        pickFirstString([pageRecord, params.brandingConfig, colorRecord], [
          "surfaceColor",
          "surface",
          "surface_color",
          "cardColor",
        ]),
      ) ?? "#ffffff",
    textColor:
      normalizeCssColor(
        pickFirstString([pageRecord, params.brandingConfig, colorRecord], [
          "textColor",
          "text",
          "text_color",
        ]),
      ) ?? "#0f172a",
  } satisfies PresentationTheme;
}

function resolveStorageLogoReference(value: unknown) {
  if (isRecord(value)) {
    const directUrl =
      asNonEmptyString(value.url) ??
      asNonEmptyString(value.src) ??
      asNonEmptyString(value.logoUrl) ??
      asNonEmptyString(value.logo_url);
    if (directUrl) {
      return { type: "url" as const, value: directUrl };
    }

    const bucket =
      asNonEmptyString(value.bucket) ??
      asNonEmptyString(value.storageBucket) ??
      asNonEmptyString(value.storage_bucket);
    const path =
      asNonEmptyString(value.path) ??
      asNonEmptyString(value.logoPath) ??
      asNonEmptyString(value.logo_path) ??
      asNonEmptyString(value.storageObjectPath) ??
      asNonEmptyString(value.storage_object_path) ??
      asNonEmptyString(value.objectPath);

    if (bucket && path) {
      return { bucket, path, type: "storage" as const };
    }
  }

  const rawValue = asNonEmptyString(value);
  if (!rawValue) {
    return null;
  }

  if (rawValue.startsWith("data:") || /^https?:\/\//i.test(rawValue)) {
    return { type: "url" as const, value: rawValue };
  }

  if (rawValue.startsWith("brand-assets/")) {
    return {
      bucket: "brand-assets",
      path: rawValue.slice("brand-assets/".length),
      type: "storage" as const,
    };
  }

  if (rawValue.startsWith("tenant/")) {
    return { bucket: "brand-assets", path: rawValue, type: "storage" as const };
  }

  return null;
}

async function blobToDataUrl(blob: Blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < buffer.length; index += chunkSize) {
    binary += String.fromCharCode(...buffer.subarray(index, index + chunkSize));
  }

  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function resolveLogoAsset(params: {
  brandingConfig: Record<string, unknown> | null;
  serviceClient: ReturnType<typeof createEdgeServiceClient>;
}): Promise<ResolvedLogoAsset | null> {
  if (!params.brandingConfig) {
    return null;
  }

  const logoReference =
    resolveStorageLogoReference(params.brandingConfig.logo) ??
    resolveStorageLogoReference(params.brandingConfig.logoUrl) ??
    resolveStorageLogoReference(params.brandingConfig.logoPath) ??
    resolveStorageLogoReference(params.brandingConfig.logo_path);

  if (!logoReference) {
    return null;
  }

  const alt =
    pickFirstString([params.brandingConfig], ["logoAlt", "logo_alt", "alt", "brandName", "name"]) ??
    "Marca do documento";

  if (logoReference.type === "url") {
    return { alt, src: logoReference.value };
  }

  const { data, error } = await params.serviceClient.storage
    .from(logoReference.bucket)
    .download(logoReference.path);

  if (error || !data) {
    return null;
  }

  return {
    alt,
    src: await blobToDataUrl(data),
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (request.method !== "POST") {
    return jsonResponse(request, 405, { error: "Method not allowed" });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization) {
    return jsonResponse(request, 401, { error: "Missing authorization header" });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse(request, 400, { error: "Invalid request body" });
  }

  const legacyTenantId = asNonEmptyString((body as Record<string, unknown>).legacyTenantId);
  const documentId = asNonEmptyString((body as Record<string, unknown>).documentId);
  const legacyUnitId = asNonEmptyString((body as Record<string, unknown>).legacyUnitId);
  const artifactKind = normalizeArtifactKind(
    asNonEmptyString((body as Record<string, unknown>).artifactKind),
  );
  const legacyCreatedByUserId = asNonEmptyString(
    (body as Record<string, unknown>).legacyCreatedByUserId,
  );

  if (!legacyTenantId || !documentId) {
    return jsonResponse(request, 400, {
      error: "legacyTenantId and documentId are required",
    });
  }

  const serviceClient = createEdgeServiceClient();

  const { data: patientDocument, error: patientDocumentError } = await serviceClient.rpc(
    "get_patient_document_snapshot",
    {
      p_legacy_tenant_id: legacyTenantId,
      p_document_id: documentId,
      p_legacy_unit_id: legacyUnitId,
    },
  );

  if (patientDocumentError || !isRecord(patientDocument)) {
    return jsonResponse(request, 404, {
      details: patientDocumentError?.message ?? null,
      error: "Document not found for printable generation",
    });
  }

  const currentVersion = isRecord(patientDocument.currentVersion) ? patientDocument.currentVersion : null;
  const documentTitle =
    asNonEmptyString(currentVersion?.title) ??
    asNonEmptyString(patientDocument.title) ??
    "Documento";
  const documentSummary =
    asNonEmptyString(currentVersion?.summary) ??
    asNonEmptyString(patientDocument.summary) ??
    "";
  const renderedAt = new Date().toISOString();

  const presentationConfig = extractPresentationConfigs({
    currentVersion,
    patientDocument,
  });
  const theme = buildPresentationTheme({
    brandingConfig: presentationConfig.branding,
    layoutConfig: presentationConfig.layout,
  });
  const logoAsset = await resolveLogoAsset({
    brandingConfig: presentationConfig.branding,
    serviceClient,
  });

  const contentBlocks = renderContentSections(presentationConfig.content);
  const summaryText =
    documentSummary || "Documento operacional gerado pelo runtime EmagrecePlus.";
  const bodyClassNames = [
    theme.hasCustomPresentation ? "custom-theme" : "default-theme",
    theme.contentVariant === "plain" ? "content-plain" : "content-cards",
    `align-${theme.headerAlign}`,
  ].join(" ");
  const brandRowHtml =
    logoAsset || theme.brandName || theme.brandTagline
      ? `
        <div class="brand-row">
          ${
            logoAsset
              ? `<img class="brand-logo" src="${escapeHtml(logoAsset.src)}" alt="${escapeHtml(logoAsset.alt)}" />`
              : ""
          }
          ${
            theme.brandName || theme.brandTagline
              ? `
                <div class="brand-copy">
                  ${theme.brandName ? `<p class="brand-name">${escapeHtml(theme.brandName)}</p>` : ""}
                  ${
                    theme.brandTagline
                      ? `<p class="brand-tagline">${escapeHtml(theme.brandTagline)}</p>`
                      : ""
                  }
                </div>
              `
              : ""
          }
        </div>
      `
      : "";
  const summaryHtml = theme.showSummary
    ? `<p class="muted">${escapeHtml(summaryText)}</p>`
    : "";
  const metaHtml = theme.showMeta
    ? `
      <div class="meta">
        <div class="meta-item"><strong>Documento</strong><br />${escapeHtml(String(patientDocument.id ?? documentId))}</div>
        <div class="meta-item"><strong>Tipo</strong><br />${escapeHtml(String(patientDocument.documentType ?? "custom"))}</div>
        <div class="meta-item"><strong>Numero</strong><br />${escapeHtml(String(patientDocument.documentNumber ?? "Sem numero"))}</div>
        <div class="meta-item"><strong>Emitido em</strong><br />${escapeHtml(String(patientDocument.issuedAt ?? renderedAt))}</div>
        <div class="meta-item"><strong>Gerado em</strong><br />${escapeHtml(renderedAt)}</div>
      </div>
    `
    : "";
  const footerHtml = theme.footerText
    ? `<footer><p class="footer-copy">${escapeHtml(theme.footerText)}</p></footer>`
    : "";

  const renderedHtml = `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(documentTitle)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", sans-serif;
        --accent: ${theme.accentColor};
        --accent-soft: ${theme.accentSoftColor};
        --accent-strong: ${theme.accentStrongColor};
        --accent-secondary: ${theme.secondaryAccentColor};
        --page-bg: ${theme.pageBackground};
        --page-border: ${theme.borderColor};
        --page-max-width: ${theme.pageWidth};
        --page-muted: ${theme.mutedColor};
        --page-padding-inline: ${theme.pagePadding};
        --page-surface: ${theme.surfaceColor};
        --page-text: ${theme.textColor};
      }
      * {
        box-sizing: border-box;
      }
      body {
        margin: 0;
        background: var(--page-bg);
        color: var(--page-text);
      }
      main {
        max-width: var(--page-max-width);
        margin: 0 auto;
        padding: 40px var(--page-padding-inline) 72px;
      }
      header {
        border-bottom: 2px solid var(--page-border);
        margin-bottom: 24px;
        padding-bottom: 20px;
      }
      .custom-theme header {
        padding-top: 8px;
      }
      .header-accent {
        display: none;
        width: 108px;
        height: 6px;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--accent), var(--accent-secondary));
        margin-bottom: 18px;
      }
      .custom-theme .header-accent {
        display: block;
      }
      .align-center .header-accent {
        margin-left: auto;
        margin-right: auto;
      }
      .align-right .header-accent {
        margin-left: auto;
      }
      .brand-row {
        display: flex;
        align-items: center;
        justify-content: ${theme.headerJustify};
        gap: 14px;
        margin-bottom: 16px;
      }
      .align-center .brand-row {
        text-align: left;
      }
      .brand-logo {
        display: block;
        max-width: 220px;
        max-height: 64px;
        object-fit: contain;
      }
      .brand-copy {
        min-width: 0;
      }
      .brand-name {
        margin: 0;
        color: var(--accent-strong);
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .brand-tagline {
        margin: 6px 0 0;
        color: var(--page-muted);
        font-size: 14px;
        line-height: 1.5;
      }
      .header-copy {
        text-align: ${theme.headerAlign};
      }
      h1 {
        margin: 0 0 8px;
        font-size: 28px;
      }
      h2 {
        margin: 0 0 10px;
        font-size: 16px;
      }
      p,
      .block-copy,
      .footer-copy {
        line-height: 1.6;
      }
      .meta {
        display: grid;
        gap: 8px;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        margin-top: 16px;
      }
      .meta-item,
      .block {
        border: 1px solid var(--page-border);
        border-radius: 18px;
        background: var(--page-surface);
        padding: 16px 18px;
      }
      .content-plain .meta-item,
      .content-plain .block {
        border-radius: 12px;
        background: transparent;
      }
      .block.tone-accent {
        border-color: var(--accent-secondary);
        background: var(--accent-soft);
      }
      .block.tone-muted {
        background: rgba(148, 163, 184, 0.08);
      }
      .muted {
        color: var(--page-muted);
      }
      .json-block > div + div {
        margin-top: 8px;
      }
      .text-value {
        white-space: pre-wrap;
      }
      ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }
      section + section {
        margin-top: 16px;
      }
      footer {
        margin-top: 28px;
        padding-top: 18px;
        border-top: 1px solid var(--page-border);
      }
      .footer-copy {
        margin: 0;
        color: var(--page-muted);
        font-size: 13px;
      }
    </style>
  </head>
  <body class="${bodyClassNames}">
    <main>
      <header>
        <div class="header-accent"></div>
        ${brandRowHtml}
        <div class="header-copy">
          <h1>${escapeHtml(documentTitle)}</h1>
          ${summaryHtml}
        </div>
        ${metaHtml}
      </header>
      ${
        contentBlocks ||
        '<section class="block"><h2>Conteudo</h2><p class="muted">Sem conteudo estruturado para este documento.</p></section>'
      }
      ${footerHtml}
    </main>
  </body>
</html>`;

  const htmlBytes = new TextEncoder().encode(renderedHtml);
  const pdfBytes = artifactKind === "pdf" || artifactKind === "print_package"
    ? buildPdfDocument({
        content: presentationConfig.content,
        documentId: String(patientDocument.id ?? documentId),
        documentNumber: patientDocument.documentNumber,
        documentSummary: summaryText,
        documentTitle,
        documentType: patientDocument.documentType,
        issuedAt: patientDocument.issuedAt,
        renderedAt,
        theme,
      })
    : null;
  const documentSlug = slugifyFileName(documentTitle);
  const artifactExtension =
    artifactKind === "pdf" ? "pdf" : artifactKind === "print_package" ? "zip" : "html";
  const artifactContentType =
    artifactKind === "pdf"
      ? "application/pdf"
      : artifactKind === "print_package"
        ? "application/zip"
        : "text/html";
  const storageScope = resolveStorageScope(patientDocument);

  if (!storageScope) {
    return jsonResponse(request, 500, {
      error: "Document storage scope is missing from snapshot",
    });
  }

  const storageObjectPath = `tenant/${storageScope.tenantId}/patients/${storageScope.patientId}/documents/${storageScope.runtimeDocumentId}/${artifactKind}-${Date.now()}.${artifactExtension}`;
  const artifactBytes =
    artifactKind === "pdf"
      ? pdfBytes!
      : artifactKind === "print_package"
        ? buildZipArchive([
            {
              bytes: htmlBytes,
              name: `${documentSlug}.html`,
            },
            {
              bytes: pdfBytes!,
              name: `${documentSlug}.pdf`,
            },
            {
              bytes: new TextEncoder().encode(
                buildManifest({
                  artifactKind,
                  checksum: await sha256HexBytes(pdfBytes!),
                  documentId,
                  documentTitle,
                  renderedAt,
                  storageObjectPath,
                }),
              ),
              name: "manifest.json",
            },
          ])
        : htmlBytes;
  const checksum = await sha256HexBytes(artifactBytes);

  const { error: uploadError } = await serviceClient.storage
    .from("patient-documents")
    .upload(storageObjectPath, artifactBytes, {
      contentType: artifactContentType,
      upsert: true,
    });

  if (uploadError) {
    return jsonResponse(request, 500, {
      details: uploadError.message,
      error: "Failed to upload printable artifact",
    });
  }

  const { data: registeredArtifact, error: registeredArtifactError } = await serviceClient.rpc(
    "register_document_printable_artifact",
    {
      p_artifact_kind: artifactKind,
      p_checksum: checksum,
      p_document_id: documentId,
      p_failure_reason: null,
      p_legacy_created_by_user_id: legacyCreatedByUserId,
      p_legacy_tenant_id: legacyTenantId,
      p_legacy_unit_id: legacyUnitId,
      p_metadata: {
        contentType: artifactContentType,
        extension: artifactExtension,
        realArtifact: true,
        renderer: "document-printable",
      },
      p_render_status: "rendered",
      p_rendered_at: renderedAt,
      p_rendered_html: renderedHtml,
      p_storage_object_path: storageObjectPath,
    },
  );

  if (registeredArtifactError || !registeredArtifact) {
    return jsonResponse(request, 500, {
      details: registeredArtifactError?.message ?? null,
      error: "Failed to register printable artifact",
    });
  }

  return jsonResponse(request, 200, {
    artifactKind,
    checksum,
    document: registeredArtifact,
    ok: true,
    renderedAt,
    storageObjectPath,
  });
});
