import { env } from "@/lib/env";
import { http } from "@/lib/http";
import { useAuthStore } from "@/state/auth-store";
import { getDocumentTemplates } from "./get-document-templates";

export type DocumentLayoutBlockTone = "default" | "muted" | "accent";
export type DocumentLayoutAccent = "slate" | "emerald" | "indigo";
export type DocumentLayoutPageWidth = "compact" | "standard" | "wide";
export type DocumentLayoutPresetCode =
  | "clinical_classic"
  | "institutional_clean"
  | "evidence_compact";

export type DocumentLayoutBlock = {
  id: string;
  title: string;
  content: string;
  tone: DocumentLayoutBlockTone;
  position: number;
};

export type DocumentLayoutBranding = {
  organizationName: string;
  accent: DocumentLayoutAccent;
  logoUrl: string | null;
  footerNote: string | null;
  updatedAt: string | null;
};

export type DocumentLayoutPreset = {
  code: DocumentLayoutPresetCode;
  name: string;
  description: string | null;
  pageWidth: DocumentLayoutPageWidth;
};

export type DocumentLayoutGuideline = {
  code: string;
  title: string;
  summary: string;
};

const accentColorByToken: Record<
  DocumentLayoutAccent,
  { primary: string; secondary: string }
> = {
  emerald: {
    primary: "#059669",
    secondary: "#0f766e",
  },
  indigo: {
    primary: "#4f46e5",
    secondary: "#4338ca",
  },
  slate: {
    primary: "#475569",
    secondary: "#334155",
  },
};

const pageWidthByPresetCode: Record<DocumentLayoutPresetCode, DocumentLayoutPageWidth> = {
  clinical_classic: "standard",
  institutional_clean: "standard",
  evidence_compact: "compact",
};

export type DocumentLayoutTemplateVersion = {
  id: string;
  versionNumber: number;
  status: string;
  title: string;
  summary: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type DocumentLayoutTemplate = {
  id: string;
  title: string;
  templateKind: string;
  description: string | null;
  status: string;
  currentVersion: DocumentLayoutTemplateVersion | null;
  layout: {
    presetCode: DocumentLayoutPresetCode;
    pageWidth: DocumentLayoutPageWidth;
    blocks: DocumentLayoutBlock[];
    updatedAt: string | null;
  };
};

export type DocumentLayoutSettingsSnapshot = {
  branding: DocumentLayoutBranding;
  presets: DocumentLayoutPreset[];
  standards: DocumentLayoutGuideline[];
  templates: DocumentLayoutTemplate[];
  updatedAt: string | null;
};

export type SaveDocumentLayoutBrandingInput = {
  organizationName: string;
  accent: DocumentLayoutAccent;
  logoUrl?: string | null;
  footerNote?: string | null;
};

export type SaveDocumentLayoutTemplateInput = {
  title: string;
  summary: string;
  presetCode: DocumentLayoutPresetCode;
  pageWidth: DocumentLayoutPageWidth;
  blocks: Array<Pick<DocumentLayoutBlock, "id" | "title" | "content" | "tone">>;
};

export async function getDocumentLayoutSettings() {
  if (env.authMode !== "real") {
    return buildMockDocumentLayoutSettings();
  }

  const payload = await http<unknown>("/settings/document-layout");
  return normalizeDocumentLayoutSettingsSnapshot(payload);
}

export async function saveDocumentLayoutBranding(
  input: SaveDocumentLayoutBrandingInput,
  fallbackBranding?: DocumentLayoutBranding | null,
) {
  const savedAt = new Date().toISOString();

  if (env.authMode !== "real") {
    return applyDocumentLayoutBrandingInput(
      fallbackBranding ?? createDefaultDocumentLayoutBranding(),
      input,
      savedAt,
    );
  }

  const payload = await http<unknown>("/settings/document-layout/branding", {
    method: "PUT",
    body: {
      branding: {
        brandName: input.organizationName.trim(),
        tradeName: input.organizationName.trim(),
        logoPath: input.logoUrl ?? null,
        primaryColor: accentColorByToken[input.accent].primary,
        secondaryColor: accentColorByToken[input.accent].secondary,
        accentColor: accentColorByToken[input.accent].primary,
        footerNote: normalizeNullableText(input.footerNote),
        showLogo: Boolean(normalizeNullableText(input.logoUrl)),
      },
    },
  });

  return normalizeDocumentLayoutBrandingResponse(
    payload,
    fallbackBranding ?? createDefaultDocumentLayoutBranding(),
    input,
    savedAt,
  );
}

export async function saveDocumentLayoutTemplate(
  templateId: string,
  input: SaveDocumentLayoutTemplateInput,
  fallbackTemplate?: DocumentLayoutTemplate | null,
) {
  const savedAt = new Date().toISOString();

  if (env.authMode !== "real") {
    return applyDocumentLayoutTemplateInput(
      fallbackTemplate ?? createFallbackTemplate(templateId, input),
      input,
      savedAt,
    );
  }

  const payload = await http<unknown>(
    `/settings/document-layout/templates/${encodeURIComponent(templateId)}`,
    {
      method: "PUT",
      body: {
        title: input.title.trim(),
        summary: normalizeNullableText(input.summary),
        content: {
          blocks: input.blocks.map((block, index) => ({
            id: block.id,
            title: normalizeBlockTitle(block.title, index),
            content: block.content.trim(),
            tone: normalizeDocumentLayoutBlockTone(block.tone),
            position: index + 1,
          })),
        },
        renderSchema: {
          presetCode: input.presetCode,
          pageWidth: input.pageWidth,
          showDocumentMeta: true,
          showSummary: true,
          sectionStyle: "cards",
        },
      },
    },
  );

  return normalizeDocumentLayoutTemplateResponse(
    payload,
    fallbackTemplate ?? createFallbackTemplate(templateId, input),
    input,
    savedAt,
  );
}

export function createDefaultDocumentLayoutBranding(
  organizationName = resolveFallbackOrganizationName(),
): DocumentLayoutBranding {
  return {
    organizationName,
    accent: "emerald",
    logoUrl: null,
    footerNote: "Documento institucional emitido pelo runtime EmagrecePlus.",
    updatedAt: null,
  };
}

export function createDocumentLayoutBlockId(prefix = "block") {
  const randomId =
    typeof globalThis.crypto !== "undefined" && "randomUUID" in globalThis.crypto
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.round(Math.random() * 10_000)}`;

  return `${prefix}-${randomId}`;
}

export function buildDefaultDocumentLayoutBlocks(
  title: string,
  templateKind: string,
): DocumentLayoutBlock[] {
  const normalizedTitle = title.trim() || "Documento";
  const kindLabel = formatTemplateKind(templateKind).toLowerCase();

  return [
    {
      id: "block-hero",
      title: "Abertura",
      content: `Documento base para ${kindLabel}. Ajuste este trecho para apresentar objetivo, contexto e orientacao do texto.`,
      tone: "accent",
      position: 1,
    },
    {
      id: "block-body",
      title: `${normalizedTitle} - conteudo principal`,
      content:
        "Use este bloco para compor orientacoes, clausulas clinicas, referencias ou dados operacionais do documento.",
      tone: "default",
      position: 2,
    },
    {
      id: "block-footer",
      title: "Rodape e assinatura",
      content:
        "Inclua assinatura, observacoes finais, identificacao da unidade e metadados de emissao.",
      tone: "muted",
      position: 3,
    },
  ];
}

export function applyDocumentLayoutBrandingInput(
  currentBranding: DocumentLayoutBranding,
  input: SaveDocumentLayoutBrandingInput,
  savedAt = new Date().toISOString(),
): DocumentLayoutBranding {
  return {
    organizationName:
      normalizeNullableText(input.organizationName) ?? currentBranding.organizationName,
    accent: normalizeDocumentLayoutAccent(input.accent),
    logoUrl:
      input.logoUrl === undefined ? currentBranding.logoUrl : normalizeNullableText(input.logoUrl),
    footerNote:
      input.footerNote === undefined
        ? currentBranding.footerNote
        : normalizeNullableText(input.footerNote),
    updatedAt: savedAt,
  };
}

export function applyDocumentLayoutTemplateInput(
  currentTemplate: DocumentLayoutTemplate,
  input: SaveDocumentLayoutTemplateInput,
  savedAt = new Date().toISOString(),
): DocumentLayoutTemplate {
  const title = normalizeNullableText(input.title) ?? currentTemplate.title;
  const summary = normalizeNullableText(input.summary);

  return {
    ...currentTemplate,
    title,
    description: summary,
    currentVersion: currentTemplate.currentVersion
      ? {
          ...currentTemplate.currentVersion,
          title,
          summary,
        }
      : currentTemplate.currentVersion,
    layout: {
      presetCode: input.presetCode,
      pageWidth: normalizeDocumentLayoutPageWidth(input.pageWidth),
      blocks: input.blocks.map((block, index) => ({
        id: block.id || createDocumentLayoutBlockId(),
        title: normalizeBlockTitle(block.title, index),
        content: block.content.trim(),
        tone: normalizeDocumentLayoutBlockTone(block.tone),
        position: index + 1,
      })),
      updatedAt: savedAt,
    },
  };
}

function normalizeDocumentLayoutSettingsSnapshot(
  value: unknown,
): DocumentLayoutSettingsSnapshot {
  const payload = unwrapData(value);
  const rawBranding =
    isRecord(payload) && "branding" in payload ? payload.branding : undefined;
  const rawTemplates = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.templates)
      ? payload.templates
      : [];

  return {
    branding: normalizeDocumentLayoutBranding(rawBranding),
    presets: normalizeDocumentLayoutPresets(
      isRecord(payload) && Array.isArray(payload.presets) ? payload.presets : [],
    ),
    standards: normalizeDocumentLayoutGuidelines(
      isRecord(payload) && Array.isArray(payload.standards) ? payload.standards : [],
    ),
    templates: rawTemplates
      .map((template) => normalizeDocumentLayoutTemplate(template))
      .filter((template): template is DocumentLayoutTemplate => Boolean(template)),
    updatedAt:
      asNullableString(
        isRecord(payload) ? firstDefined(payload, ["updatedAt", "savedAt"]) : undefined,
      ) ?? null,
  };
}

function normalizeDocumentLayoutBrandingResponse(
  value: unknown,
  fallbackBranding: DocumentLayoutBranding,
  input: SaveDocumentLayoutBrandingInput,
  savedAt: string,
) {
  const payload = unwrapData(value);
  const rawBranding =
    isRecord(payload) && "branding" in payload ? payload.branding : payload;
  const normalized = normalizeDocumentLayoutBranding(rawBranding);

  if (normalized.organizationName !== fallbackBranding.organizationName || rawBranding) {
    return {
      ...normalized,
      updatedAt: normalized.updatedAt ?? savedAt,
    };
  }

  return applyDocumentLayoutBrandingInput(fallbackBranding, input, savedAt);
}

function normalizeDocumentLayoutTemplateResponse(
  value: unknown,
  fallbackTemplate: DocumentLayoutTemplate,
  input: SaveDocumentLayoutTemplateInput,
  savedAt: string,
) {
  const payload = unwrapData(value);
  const rawTemplate =
    isRecord(payload) && "template" in payload ? payload.template : payload;
  const normalized = normalizeDocumentLayoutTemplate(rawTemplate);

  if (normalized) {
    return {
      ...normalized,
      layout: {
        ...normalized.layout,
        updatedAt: normalized.layout.updatedAt ?? savedAt,
      },
    };
  }

  return applyDocumentLayoutTemplateInput(fallbackTemplate, input, savedAt);
}

function normalizeDocumentLayoutBranding(value: unknown): DocumentLayoutBranding {
  const payload = isRecord(value) ? value : {};

  return {
    organizationName:
      asNullableString(
        firstDefined(payload, ["organizationName", "brandName", "displayName", "name"]),
      ) ?? resolveFallbackOrganizationName(),
    accent: normalizeDocumentLayoutAccent(
      firstDefined(payload, ["accent", "accentColor", "primaryColor", "accentTone"]),
    ),
    logoUrl: asNullableString(
      firstDefined(payload, ["logoUrl", "logoUri", "logoPath", "logo_path"]),
    ),
    footerNote: asNullableString(firstDefined(payload, ["footerNote", "footer_text", "footer"])),
    updatedAt: asNullableString(firstDefined(payload, ["updatedAt", "savedAt"])),
  };
}

function normalizeDocumentLayoutTemplate(
  value: unknown,
): DocumentLayoutTemplate | null {
  const payload = isRecord(value) ? value : null;
  if (!payload) {
    return null;
  }

  const currentVersion = isRecord(payload.currentVersion) ? payload.currentVersion : null;
  const layout = isRecord(payload.layout) ? payload.layout : null;
  const content = currentVersion && isRecord(currentVersion.content) ? currentVersion.content : null;
  const renderSchema =
    currentVersion && isRecord(currentVersion.renderSchema) ? currentVersion.renderSchema : null;

  const title =
    asNullableString(firstDefined(payload, ["title"])) ??
    asNullableString(currentVersion ? currentVersion.title : undefined) ??
    null;
  const templateKind =
    asNullableString(firstDefined(payload, ["templateKind", "kind"])) ?? "custom";

  if (!title) {
    return null;
  }

  return {
    id: asString(firstDefined(payload, ["id"]), createDocumentLayoutBlockId("template")),
    title,
    templateKind,
    description:
      asNullableString(firstDefined(payload, ["description", "summary"])) ??
      asNullableString(currentVersion ? currentVersion.summary : undefined),
    status: asString(firstDefined(payload, ["status"]), "draft"),
    currentVersion: currentVersion
      ? {
          id: asString(firstDefined(currentVersion, ["id"]), ""),
          versionNumber: asNumber(firstDefined(currentVersion, ["versionNumber"]), 0),
          status: asString(firstDefined(currentVersion, ["status"]), "draft"),
          title: asString(firstDefined(currentVersion, ["title"]), title),
          summary: asNullableString(firstDefined(currentVersion, ["summary"])),
          effectiveFrom: asNullableString(firstDefined(currentVersion, ["effectiveFrom"])),
          effectiveTo: asNullableString(firstDefined(currentVersion, ["effectiveTo"])),
        }
      : null,
    layout: {
      presetCode: normalizeDocumentLayoutPresetCode(
        firstDefined(renderSchema ?? {}, ["presetCode"]) ??
          firstDefined(layout ?? {}, ["presetCode"]) ??
          "clinical_classic",
      ),
      pageWidth: normalizeDocumentLayoutPageWidth(
        firstDefined(renderSchema ?? {}, ["pageWidth", "width"]) ??
          firstDefined(layout ?? {}, ["pageWidth"]) ??
          firstDefined(content ?? {}, ["pageWidth"]) ??
          firstDefined(payload, ["pageWidth"]),
      ),
      blocks: normalizeDocumentLayoutBlocks(
        firstDefined(layout ?? {}, ["blocks"]) ??
          firstDefined(content ?? {}, ["blocks", "sections"]) ??
          firstDefined(payload, ["blocks", "sections"]),
        title,
        templateKind,
      ),
      updatedAt:
        asNullableString(firstDefined(layout ?? {}, ["updatedAt", "savedAt"])) ??
        asNullableString(firstDefined(payload, ["updatedAt", "savedAt"])) ??
        asNullableString(currentVersion ? currentVersion.publishedAt : undefined),
    },
  };
}

async function buildMockDocumentLayoutSettings(): Promise<DocumentLayoutSettingsSnapshot> {
  const templates = await getDocumentTemplates(null);

  return {
    branding: createDefaultDocumentLayoutBranding(),
    presets: buildDefaultDocumentLayoutPresets(),
    standards: buildDefaultDocumentLayoutGuidelines(),
    templates: templates
      .map((template) => normalizeDocumentLayoutTemplate(template))
      .filter((template): template is DocumentLayoutTemplate => Boolean(template)),
    updatedAt: new Date().toISOString(),
  };
}

function createFallbackTemplate(
  templateId: string,
  input: SaveDocumentLayoutTemplateInput,
): DocumentLayoutTemplate {
  return {
    id: templateId,
    title: normalizeNullableText(input.title) ?? "Documento",
    templateKind: "custom",
    description: normalizeNullableText(input.summary),
    status: "draft",
    currentVersion: null,
    layout: {
      presetCode: "clinical_classic",
      pageWidth: normalizeDocumentLayoutPageWidth(input.pageWidth),
      blocks: input.blocks.map((block, index) => ({
        id: block.id || createDocumentLayoutBlockId(),
        title: normalizeBlockTitle(block.title, index),
        content: block.content.trim(),
        tone: normalizeDocumentLayoutBlockTone(block.tone),
        position: index + 1,
      })),
      updatedAt: null,
    },
  };
}

function normalizeDocumentLayoutBlocks(
  value: unknown,
  title: string,
  templateKind: string,
): DocumentLayoutBlock[] {
  if (!Array.isArray(value)) {
    return buildDefaultDocumentLayoutBlocks(title, templateKind);
  }

  const blocks = value
    .map((block, index) => normalizeDocumentLayoutBlock(block, index))
    .filter((block): block is DocumentLayoutBlock => Boolean(block));

  return blocks.length ? blocks : buildDefaultDocumentLayoutBlocks(title, templateKind);
}

function normalizeDocumentLayoutBlock(
  value: unknown,
  index: number,
): DocumentLayoutBlock | null {
  if (typeof value === "string") {
    const title = humanizeToken(value) || `Secao ${index + 1}`;
    return {
      id: createDocumentLayoutBlockId(),
      title,
      content: `Estruture aqui o conteudo da secao ${title.toLowerCase()}.`,
      tone: index === 0 ? "accent" : index % 2 === 0 ? "default" : "muted",
      position: index + 1,
    };
  }

  if (!isRecord(value)) {
    return null;
  }

  return {
    id: asString(firstDefined(value, ["id"]), createDocumentLayoutBlockId()),
    title: normalizeBlockTitle(asString(firstDefined(value, ["title"]), ""), index),
    content: asString(
      firstDefined(value, ["content", "description", "body"]),
      "Descreva o conteudo estrutural desta secao do documento.",
    ),
    tone: normalizeDocumentLayoutBlockTone(firstDefined(value, ["tone", "variant"])),
    position: asNumber(firstDefined(value, ["position"]), index + 1),
  };
}

function normalizeDocumentLayoutAccent(value: unknown): DocumentLayoutAccent {
  switch (`${value ?? ""}`.trim().toLowerCase()) {
    case "slate":
    case "#475569":
    case "#334155":
      return "slate";
    case "indigo":
    case "#4f46e5":
    case "#4338ca":
      return "indigo";
    default:
      return "emerald";
  }
}

function normalizeDocumentLayoutPageWidth(value: unknown): DocumentLayoutPageWidth {
  switch (`${value ?? ""}`.trim().toLowerCase()) {
    case "compact":
      return "compact";
    case "wide":
      return "wide";
    default:
      return "standard";
  }
}

function normalizeDocumentLayoutBlockTone(value: unknown): DocumentLayoutBlockTone {
  switch (`${value ?? ""}`.trim().toLowerCase()) {
    case "accent":
      return "accent";
    case "muted":
      return "muted";
    default:
      return "default";
  }
}

function normalizeDocumentLayoutPresetCode(value: unknown): DocumentLayoutPresetCode {
  switch (`${value ?? ""}`.trim().toLowerCase()) {
    case "institutional_clean":
      return "institutional_clean";
    case "evidence_compact":
      return "evidence_compact";
    default:
      return "clinical_classic";
  }
}

function normalizeDocumentLayoutPresets(value: unknown[]): DocumentLayoutPreset[] {
  const presets = value
    .map((entry) => normalizeDocumentLayoutPreset(entry))
    .filter((entry): entry is DocumentLayoutPreset => Boolean(entry));

  return presets.length > 0 ? presets : buildDefaultDocumentLayoutPresets();
}

function normalizeDocumentLayoutPreset(value: unknown): DocumentLayoutPreset | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = normalizeDocumentLayoutPresetCode(firstDefined(value, ["code"]));

  return {
    code,
    name: asNullableString(firstDefined(value, ["name"])) ?? humanizeToken(code),
    description: asNullableString(firstDefined(value, ["description"])),
    pageWidth: normalizeDocumentLayoutPageWidth(
      firstDefined(value, ["pageWidth", "width"]) ?? pageWidthByPresetCode[code],
    ),
  };
}

function buildDefaultDocumentLayoutPresets(): DocumentLayoutPreset[] {
  return [
    {
      code: "clinical_classic",
      name: "Clinico classico",
      description: "Cabecalho institucional, assinatura evidente e leitura ampla em A4.",
      pageWidth: "standard",
    },
    {
      code: "institutional_clean",
      name: "Institucional clean",
      description: "Modelo limpo para consentimentos e documentos formais de aceite.",
      pageWidth: "standard",
    },
    {
      code: "evidence_compact",
      name: "Evidencia compacta",
      description: "Layout enxuto para laudos, anexos e reproducao documental.",
      pageWidth: "compact",
    },
  ];
}

function normalizeDocumentLayoutGuidelines(value: unknown[]): DocumentLayoutGuideline[] {
  const guidelines = value
    .map((entry) => normalizeDocumentLayoutGuideline(entry))
    .filter((entry): entry is DocumentLayoutGuideline => Boolean(entry));

  return guidelines.length > 0 ? guidelines : buildDefaultDocumentLayoutGuidelines();
}

function normalizeDocumentLayoutGuideline(value: unknown): DocumentLayoutGuideline | null {
  if (!isRecord(value)) {
    return null;
  }

  const code = asNullableString(firstDefined(value, ["code"]));
  const title = asNullableString(firstDefined(value, ["title"]));
  const summary = asNullableString(firstDefined(value, ["summary"]));

  if (!code || !title || !summary) {
    return null;
  }

  return { code, title, summary };
}

function buildDefaultDocumentLayoutGuidelines(): DocumentLayoutGuideline[] {
  return [
    {
      code: "cfm_document_identity",
      title: "Identificacao e autoria",
      summary:
        "Mantenha cabecalho institucional, identificacao do paciente, data e autoria sempre legiveis.",
    },
    {
      code: "lei_14063_signature_trace",
      title: "Assinatura e trilha eletronica",
      summary:
        "Reserve bloco claro para assinatura e informacoes do fluxo de validacao eletronica.",
    },
    {
      code: "lei_13787_retention",
      title: "Guarda e reproducao",
      summary:
        "Prefira composicao em A4 com margens estaveis, contraste adequado e leitura segura para arquivo.",
    },
  ];
}

function normalizeBlockTitle(value: string, index: number) {
  const normalized = normalizeNullableText(value);
  return normalized ?? `Secao ${index + 1}`;
}

function resolveFallbackOrganizationName() {
  const authState = useAuthStore.getState();
  const currentUnitId = authState.session?.currentUnitId ?? null;
  const currentUnit =
    authState.session?.units.find((unit) => unit.id === currentUnitId) ?? authState.session?.units[0];

  return currentUnit?.name ?? "EmagrecePlus";
}

function formatTemplateKind(value: string) {
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
      return "Documento";
  }
}

function humanizeToken(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function unwrapData(value: unknown) {
  if (isRecord(value) && "data" in value) {
    return value.data;
  }

  return value;
}

function firstDefined(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (key in record && record[key] !== undefined) {
      return record[key];
    }
  }

  return undefined;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
