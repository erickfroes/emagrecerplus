"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  applyDocumentLayoutBrandingInput,
  applyDocumentLayoutTemplateInput,
  createDefaultDocumentLayoutBranding,
  createDocumentLayoutBlockId,
  getDocumentLayoutSettings,
  saveDocumentLayoutBranding,
  saveDocumentLayoutTemplate,
  type DocumentLayoutAccent,
  type DocumentLayoutBlock,
  type DocumentLayoutBranding,
  type DocumentLayoutGuideline,
  type DocumentLayoutPageWidth,
  type DocumentLayoutPreset,
  type DocumentLayoutPresetCode,
  type DocumentLayoutSettingsSnapshot,
  type DocumentLayoutTemplate,
} from "../api/document-layout-settings";

export type DocumentLayoutEditorBlock = DocumentLayoutBlock;
export type DocumentLayoutEditorAccent = DocumentLayoutAccent;
export type DocumentLayoutEditorPageWidth = DocumentLayoutPageWidth;

export type DocumentLayoutKindFilter =
  | "all"
  | "report"
  | "consent"
  | "prescription"
  | "orientation"
  | "exam_request"
  | "certificate"
  | "custom";

export const documentLayoutKindOptions: Array<{
  value: DocumentLayoutKindFilter;
  label: string;
}> = [
  { value: "all", label: "Todos" },
  { value: "report", label: "Relatorios" },
  { value: "consent", label: "Consentimentos" },
  { value: "prescription", label: "Prescricoes" },
  { value: "orientation", label: "Orientacoes" },
  { value: "exam_request", label: "Exames" },
  { value: "certificate", label: "Atestados" },
  { value: "custom", label: "Customizados" },
];

type DocumentLayoutTemplateDraft = {
  title: string;
  summary: string;
  presetCode: DocumentLayoutPresetCode;
  pageWidth: DocumentLayoutPageWidth;
  blocks: DocumentLayoutBlock[];
};

type SaveDocumentLayoutMutationResult = {
  branding: DocumentLayoutBranding | null;
  brandingSaved: boolean;
  savedAt: string;
  template: DocumentLayoutTemplate | null;
  templateSaved: boolean;
  templateId: string | null;
};

export function useDocumentLayoutEditor() {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);
  const [kind, setKind] = useState<DocumentLayoutKindFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [brandingDraft, setBrandingDraft] = useState<DocumentLayoutBranding | null>(null);
  const [templateDrafts, setTemplateDrafts] = useState<Record<string, DocumentLayoutTemplateDraft>>(
    {},
  );
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);
  const queryKey = ["document-layout-settings", currentUnitId] as const;

  const query = useQuery({
    queryKey,
    queryFn: getDocumentLayoutSettings,
  });

  const snapshot = query.data ?? null;
  const brandingSource = snapshot?.branding ?? createDefaultDocumentLayoutBranding();
  const branding = brandingDraft ?? brandingSource;
  const filteredTemplates = filterTemplates(snapshot?.templates ?? [], kind, deferredSearch);
  const selectedTemplate =
    filteredTemplates.find((template) => template.id === selectedTemplateId) ??
    filteredTemplates[0] ??
    null;
  const selectedTemplateDraft = selectedTemplate
    ? templateDrafts[selectedTemplate.id] ?? buildTemplateDraft(selectedTemplate)
    : null;
  const brandingDirty = isBrandingDirty(branding, brandingSource);
  const templateDirty =
    selectedTemplate && selectedTemplateDraft
      ? isTemplateDraftDirty(selectedTemplateDraft, selectedTemplate)
      : false;
  const dirty = brandingDirty || templateDirty;

  useEffect(() => {
    setBrandingDraft(null);
    setTemplateDrafts({});
    setSelectedTemplateId(null);
    setLastSavedAt(null);
  }, [currentUnitId]);

  useEffect(() => {
    if (!filteredTemplates.length) {
      setSelectedTemplateId(null);
      return;
    }

    const stillVisible = selectedTemplateId
      ? filteredTemplates.some((template) => template.id === selectedTemplateId)
      : false;

    if (!stillVisible) {
      setSelectedTemplateId(filteredTemplates[0]?.id ?? null);
    }
  }, [filteredTemplates, selectedTemplateId]);

  const saveMutation = useMutation({
    mutationFn: async (): Promise<SaveDocumentLayoutMutationResult> => {
      const savedAt = new Date().toISOString();
      const nextBranding =
        brandingDirty && snapshot
          ? applyDocumentLayoutBrandingInput(brandingSource, {
              organizationName: branding.organizationName,
              accent: branding.accent,
              logoUrl: branding.logoUrl,
              footerNote: branding.footerNote,
            }, savedAt)
          : null;
      const nextTemplate =
        templateDirty && selectedTemplate && selectedTemplateDraft
          ? applyDocumentLayoutTemplateInput(
              selectedTemplate,
              {
                title: selectedTemplateDraft.title,
                summary: selectedTemplateDraft.summary,
                presetCode: selectedTemplateDraft.presetCode,
                pageWidth: selectedTemplateDraft.pageWidth,
                blocks: selectedTemplateDraft.blocks,
              },
              savedAt,
            )
          : null;

      const [savedBranding, savedTemplate] = await Promise.all([
        nextBranding
          ? saveDocumentLayoutBranding(
              {
                organizationName: nextBranding.organizationName,
                accent: nextBranding.accent,
                logoUrl: nextBranding.logoUrl,
                footerNote: nextBranding.footerNote,
              },
              brandingSource,
            )
          : Promise.resolve(null),
        nextTemplate && selectedTemplate
          ? saveDocumentLayoutTemplate(
              selectedTemplate.id,
              {
                title: nextTemplate.title,
                summary: nextTemplate.description ?? nextTemplate.currentVersion?.summary ?? "",
                presetCode: nextTemplate.layout.presetCode,
                pageWidth: nextTemplate.layout.pageWidth,
                blocks: nextTemplate.layout.blocks,
              },
              selectedTemplate,
            )
          : Promise.resolve(null),
      ]);

      return {
        branding: savedBranding,
        brandingSaved: Boolean(nextBranding),
        savedAt,
        template: savedTemplate,
        templateSaved: Boolean(nextTemplate),
        templateId: selectedTemplate?.id ?? null,
      };
    },
    onSuccess: (result) => {
      queryClient.setQueryData<DocumentLayoutSettingsSnapshot | undefined>(queryKey, (current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          branding: result.branding ?? current.branding,
          templates: result.templateId
            ? current.templates.map((template) =>
                template.id === result.templateId
                  ? result.template ?? template
                  : template,
              )
            : current.templates,
          updatedAt: result.savedAt,
        };
      });

      setLastSavedAt(result.savedAt);

      if (result.brandingSaved) {
        setBrandingDraft(null);
      }

      if (result.templateSaved && result.templateId) {
        const templateId = result.templateId;

        setTemplateDrafts((current) => {
          if (!(templateId in current)) {
            return current;
          }

          const next = { ...current };
          delete next[templateId];
          return next;
        });
      }
    },
  });

  function updateBranding(
    updater: (current: DocumentLayoutBranding) => DocumentLayoutBranding,
  ) {
    setBrandingDraft((current) => updater(current ?? brandingSource));
  }

  function updateSelectedTemplateDraft(
    updater: (current: DocumentLayoutTemplateDraft) => DocumentLayoutTemplateDraft,
  ) {
    if (!selectedTemplate) {
      return;
    }

    setTemplateDrafts((current) => ({
      ...current,
      [selectedTemplate.id]: updater(current[selectedTemplate.id] ?? buildTemplateDraft(selectedTemplate)),
    }));
  }

  function setOrganizationName(value: string) {
    updateBranding((current) => ({
      ...current,
      organizationName: value,
    }));
  }

  function setAccent(value: DocumentLayoutAccent) {
    updateBranding((current) => ({
      ...current,
      accent: value,
    }));
  }

  function setLogoUrl(value: string) {
    updateBranding((current) => ({
      ...current,
      logoUrl: value,
    }));
  }

  function setFooterNote(value: string) {
    updateBranding((current) => ({
      ...current,
      footerNote: value,
    }));
  }

  function setTitle(value: string) {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      title: value,
    }));
  }

  function setSummary(value: string) {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      summary: value,
    }));
  }

  function setPageWidth(value: DocumentLayoutPageWidth) {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      pageWidth: value,
    }));
  }

  function setPresetCode(value: DocumentLayoutPresetCode) {
    const matchedPreset = snapshot?.presets.find((preset) => preset.code === value);
    updateSelectedTemplateDraft((current) => ({
      ...current,
      presetCode: value,
      pageWidth: matchedPreset?.pageWidth ?? current.pageWidth,
    }));
  }

  function updateBlock(blockId: string, patch: Partial<DocumentLayoutBlock>) {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      blocks: current.blocks.map((block, index) =>
        block.id === blockId
          ? {
              ...block,
              ...patch,
              position: index + 1,
            }
          : block,
      ),
    }));
  }

  function addBlock() {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      blocks: [
        ...current.blocks,
        {
          id: createDocumentLayoutBlockId(),
          title: `Nova secao ${current.blocks.length + 1}`,
          content: "Descreva o conteudo estrutural desta secao do documento.",
          tone: "default",
          position: current.blocks.length + 1,
        },
      ],
    }));
  }

  function duplicateBlock(blockId: string) {
    const source = selectedTemplateDraft?.blocks.find((block) => block.id === blockId);
    if (!source) {
      return;
    }

    updateSelectedTemplateDraft((current) => {
      const index = current.blocks.findIndex((block) => block.id === blockId);
      const nextBlocks = [...current.blocks];
      nextBlocks.splice(index + 1, 0, {
        ...source,
        id: createDocumentLayoutBlockId(),
        title: `${source.title} (copia)`,
        position: index + 2,
      });

      return {
        ...current,
        blocks: reindexBlocks(nextBlocks),
      };
    });
  }

  function removeBlock(blockId: string) {
    updateSelectedTemplateDraft((current) => ({
      ...current,
      blocks: reindexBlocks(current.blocks.filter((block) => block.id !== blockId)),
    }));
  }

  function reset() {
    setBrandingDraft(null);

    if (!selectedTemplate) {
      return;
    }

    setTemplateDrafts((current) => {
      if (!(selectedTemplate.id in current)) {
        return current;
      }

      const next = { ...current };
      delete next[selectedTemplate.id];
      return next;
    });
  }

  async function save() {
    if (!snapshot || !dirty || saveMutation.isPending) {
      return;
    }

    await saveMutation.mutateAsync();
  }

  return {
    kind,
    setKind,
    search,
    setSearch,
    selectedTemplateId,
    setSelectedTemplateId,
    query,
    saveMutation,
    templates: filteredTemplates,
    selectedTemplate,
    totalTemplates: snapshot?.templates.length ?? 0,
    visibleTemplateCount: filteredTemplates.length,
    footerNote: branding.footerNote ?? "",
    guidelines: snapshot?.standards ?? ([] as DocumentLayoutGuideline[]),
    logoUrl: branding.logoUrl ?? "",
    organizationName: branding.organizationName,
    accent: branding.accent,
    presets: snapshot?.presets ?? ([] as DocumentLayoutPreset[]),
    title: selectedTemplateDraft?.title ?? "",
    summary: selectedTemplateDraft?.summary ?? "",
    presetCode: selectedTemplateDraft?.presetCode ?? "clinical_classic",
    blocks: selectedTemplateDraft?.blocks ?? [],
    pageWidth: selectedTemplateDraft?.pageWidth ?? "standard",
    dirty,
    brandingDirty,
    templateDirty,
    canSave: Boolean(snapshot) && dirty,
    canReset: dirty,
    lastSavedAt,
    lastSyncedAt:
      lastSavedAt ??
      selectedTemplate?.layout.updatedAt ??
      snapshot?.branding.updatedAt ??
      snapshot?.updatedAt ??
      null,
    setOrganizationName,
    setAccent,
    setLogoUrl,
    setFooterNote,
    setTitle,
    setSummary,
    setPresetCode,
    setPageWidth,
    updateBlock,
    addBlock,
    duplicateBlock,
    removeBlock,
    reset,
    save,
  };
}

function buildTemplateDraft(template: DocumentLayoutTemplate): DocumentLayoutTemplateDraft {
  return {
    title: template.title,
    summary: template.description ?? template.currentVersion?.summary ?? "",
    presetCode: template.layout.presetCode,
    pageWidth: template.layout.pageWidth,
    blocks: template.layout.blocks.map((block, index) => ({
      ...block,
      position: index + 1,
    })),
  };
}

function filterTemplates(
  templates: DocumentLayoutTemplate[],
  kind: DocumentLayoutKindFilter,
  search: string,
) {
  const normalizedSearch = search.trim().toLowerCase();

  return templates.filter((template) => {
    if (kind !== "all" && template.templateKind !== kind) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const title = template.title.toLowerCase();
    const description = template.description?.toLowerCase() ?? "";
    const templateKind = template.templateKind.toLowerCase();

    return (
      title.includes(normalizedSearch) ||
      description.includes(normalizedSearch) ||
      templateKind.includes(normalizedSearch)
    );
  });
}

function isBrandingDirty(
  currentBranding: DocumentLayoutBranding,
  snapshotBranding: DocumentLayoutBranding,
) {
  return (
    currentBranding.organizationName !== snapshotBranding.organizationName ||
    currentBranding.accent !== snapshotBranding.accent ||
    (currentBranding.logoUrl ?? null) !== (snapshotBranding.logoUrl ?? null) ||
    (currentBranding.footerNote ?? null) !== (snapshotBranding.footerNote ?? null)
  );
}

function isTemplateDraftDirty(
  currentDraft: DocumentLayoutTemplateDraft,
  snapshotTemplate: DocumentLayoutTemplate,
) {
  const snapshotDraft = buildTemplateDraft(snapshotTemplate);

  if (
    currentDraft.title !== snapshotDraft.title ||
    currentDraft.summary !== snapshotDraft.summary ||
    currentDraft.presetCode !== snapshotDraft.presetCode ||
    currentDraft.pageWidth !== snapshotDraft.pageWidth ||
    currentDraft.blocks.length !== snapshotDraft.blocks.length
  ) {
    return true;
  }

  return currentDraft.blocks.some((block, index) => {
    const snapshotBlock = snapshotDraft.blocks[index];

    return (
      block.id !== snapshotBlock.id ||
      block.title !== snapshotBlock.title ||
      block.content !== snapshotBlock.content ||
      block.tone !== snapshotBlock.tone
    );
  });
}

function reindexBlocks(blocks: DocumentLayoutBlock[]) {
  return blocks.map((block, index) => ({
    ...block,
    position: index + 1,
  }));
}
