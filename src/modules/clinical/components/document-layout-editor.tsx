"use client";

import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BadgeCheck,
  Clock3,
  Copy,
  FilePenLine,
  LayoutTemplate,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/hooks/use-permissions";
import { cn, formatShortDateTime } from "@/lib/utils";
import {
  documentLayoutKindOptions,
  useDocumentLayoutEditor,
  type DocumentLayoutEditorAccent,
  type DocumentLayoutEditorBlock,
  type DocumentLayoutEditorPageWidth,
} from "@/modules/clinical/hooks/use-document-layout-editor";

const widthOptions: Array<{ value: DocumentLayoutEditorPageWidth; label: string }> = [
  { value: "compact", label: "Compacto" },
  { value: "standard", label: "Padrao" },
  { value: "wide", label: "Amplo" },
];

const accentOptions: Array<{ value: DocumentLayoutEditorAccent; label: string }> = [
  { value: "slate", label: "Slate" },
  { value: "emerald", label: "Esmeralda" },
  { value: "indigo", label: "Indigo" },
];

export function DocumentLayoutEditor() {
  const router = useRouter();
  const { can } = usePermissions();
  const canWrite = can("clinical:write");
  const editor = useDocumentLayoutEditor();
  const inputsDisabled = !canWrite || editor.saveMutation.isPending;
  const selectedStatus = formatStatusLabel(
    editor.selectedTemplate?.currentVersion?.status ??
      editor.selectedTemplate?.status ??
      "draft",
  );
  const saveLabel = editor.saveMutation.isPending
    ? "Salvando..."
    : editor.dirty
      ? "Salvar alteracoes"
      : "Sincronizado";
  const savedAt = editor.lastSyncedAt;
  const persistenceTone: "default" | "success" | "warning" = editor.query.isError
    ? "warning"
    : editor.saveMutation.isPending
      ? "default"
      : editor.dirty
        ? "warning"
        : "success";
  const persistenceLabel = editor.query.isError
    ? "Contrato remoto"
    : editor.saveMutation.isPending
      ? "Sincronizando"
      : editor.dirty
        ? "Alteracoes locais"
        : "Snapshot remoto";
  const persistenceMessage = editor.query.isError
    ? "Nao foi possivel carregar o snapshot em /settings/document-layout."
    : editor.saveMutation.isPending
      ? "Enviando branding e layout do template selecionado para os endpoints de settings."
      : editor.dirty
        ? "Existem mudancas locais prontas para salvar no contrato real da tela."
        : "Branding e layout agora usam o snapshot remoto de settings.";
  const saveErrorMessage =
    editor.saveMutation.error instanceof Error
      ? editor.saveMutation.error.message
      : "Nao foi possivel salvar o branding e o layout selecionado.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Editor documental"
        description="Ajuste layout, branding e versao antes da emissao do documento."
        actions={
          <>
            <Button variant="secondary" onClick={() => router.push("/clinical/encounters/1")}>
              <ArrowRight className="h-4 w-4" />
              Atendimento
            </Button>
            <Button
              variant="secondary"
              onClick={editor.reset}
              disabled={!canWrite || !editor.canReset || editor.saveMutation.isPending}
            >
              <RotateCcw className="h-4 w-4" />
              Restaurar
            </Button>
            <Button
              onClick={() => void editor.save()}
              disabled={!canWrite || !editor.canSave || editor.saveMutation.isPending}
            >
              <Sparkles className="h-4 w-4" />
              {saveLabel}
            </Button>
          </>
        }
      />

      <section className="surface-card relative overflow-hidden border-slate-200 bg-[linear-gradient(135deg,#0f172a_0%,#111827_56%,#ecfdf5_125%)] px-6 py-6 text-white md:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.16),transparent_26%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.09),transparent_22%)]" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-white/75">
              <FilePenLine className="h-3.5 w-3.5" />
              {(editor.organizationName || "EmagrecePlus").trim() || "EmagrecePlus"} / Documentos
            </div>
            <div className="space-y-3">
              <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
                Layout documental com marca, estrutura e controle de versao.
              </h2>
              <p className="max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                Escolha um modelo, ajuste os blocos do texto, revise o preview e deixe a emissao pronta para o fluxo clinico.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/72">
              <Badge tone={persistenceTone}>{persistenceLabel}</Badge>
              <span>{persistenceMessage}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[28rem]">
            <Metric label="Templates visiveis" value={String(editor.visibleTemplateCount)} />
            <Metric label="Selecionado" value={editor.selectedTemplate?.title ?? "Nenhum"} />
            <Metric label="Status" value={selectedStatus} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[330px_minmax(0,1fr)_320px]">
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="surface-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Biblioteca</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Modelos e filtros</h3>
              </div>
              <Badge>{editor.totalTemplates} total</Badge>
            </div>

            <label className="grid gap-2 text-sm text-slate-600">
              <span className="font-medium text-slate-900">Buscar modelo</span>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  className="pl-9"
                  value={editor.search}
                  onChange={(event) => editor.setSearch(event.target.value)}
                  placeholder="Titulo, descricao ou tipo"
                />
              </div>
            </label>

            <div className="flex flex-wrap gap-2">
              {documentLayoutKindOptions.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={editor.kind === option.value ? "primary" : "secondary"}
                  onClick={() => editor.setKind(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>

            <div className="space-y-2">
              {editor.query.isLoading ? (
                <p className="text-sm text-slate-500">Carregando snapshot do editor...</p>
              ) : null}
              {editor.query.isError ? (
                <p className="text-sm text-red-600">
                  Erro ao carregar o snapshot remoto de branding e layout.
                </p>
              ) : null}

              {!editor.query.isLoading && editor.templates.length === 0 ? (
                <EmptyState
                  title="Nenhum modelo encontrado"
                  description="Tente limpar a busca ou trocar o tipo de documento."
                />
              ) : null}

              <div className="max-h-[32rem] space-y-2 overflow-auto pr-1">
                {editor.templates.map((template) => {
                  const isSelected = template.id === editor.selectedTemplate?.id;

                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => editor.setSelectedTemplateId(template.id)}
                      className={cn(
                        "group w-full rounded-3xl border px-4 py-3 text-left transition",
                        isSelected
                          ? "border-emerald-200 bg-emerald-50/80 shadow-sm"
                          : "border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="font-semibold text-slate-950">{template.title}</p>
                          <p className="text-xs uppercase tracking-[0.16em] text-slate-500">
                            {formatTemplateKind(template.templateKind)}
                          </p>
                        </div>
                        <Badge tone={template.status === "published" ? "success" : "default"}>
                          {template.status}
                        </Badge>
                      </div>

                      <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-600">
                        {template.description ??
                          template.currentVersion?.summary ??
                          "Sem descricao estruturada."}
                      </p>

                      <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                        <span>
                          {template.currentVersion?.versionNumber
                            ? `Versao ${template.currentVersion.versionNumber}`
                            : "Sem versao ativa"}
                        </span>
                        <span className="opacity-0 transition group-hover:opacity-100">Abrir</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </aside>

        <main className="space-y-4">
          <section className="surface-card space-y-5">
            <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Canvas</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Estrutura e texto do documento</h3>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  tone={
                    editor.saveMutation.isPending
                      ? "default"
                      : editor.dirty
                        ? "warning"
                        : "success"
                  }
                >
                  {editor.saveMutation.isPending
                    ? "Salvando"
                    : editor.dirty
                      ? "Rascunho ativo"
                      : "Sincronizado"}
                </Badge>
                {savedAt ? (
                  <Badge tone="default">
                    <Clock3 className="mr-1 h-3.5 w-3.5" />
                    {formatShortDateTime(savedAt)}
                  </Badge>
                ) : null}
              </div>
            </div>

            {editor.saveMutation.isError ? (
              <div className="rounded-3xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {saveErrorMessage}
              </div>
            ) : null}

            {!editor.selectedTemplate ? (
              <EmptyState
                title="Selecione um modelo para editar"
                description="Assim que um modelo estiver ativo, o canvas mostra a estrutura base e o preview."
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-4">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_16px_48px_-32px_rgba(15,23,42,0.32)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Identidade</p>
                        <h4 className="mt-1 text-xl font-semibold tracking-tight text-slate-950">
                          {editor.title || "Titulo do documento"}
                        </h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge>{selectedStatus}</Badge>
                        {editor.selectedTemplate.currentVersion?.versionNumber ? (
                          <Badge tone="default">
                            v{editor.selectedTemplate.currentVersion.versionNumber}
                          </Badge>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm text-slate-600 md:col-span-2">
                        <span className="font-medium text-slate-900">Titulo</span>
                        <Input
                          value={editor.title}
                          onChange={(event) => editor.setTitle(event.target.value)}
                          disabled={inputsDisabled}
                          placeholder="Titulo do documento"
                        />
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600 md:col-span-2">
                        <span className="font-medium text-slate-900">Resumo</span>
                        <textarea
                          className="min-h-32 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2 disabled:opacity-60"
                          value={editor.summary}
                          onChange={(event) => editor.setSummary(event.target.value)}
                          disabled={inputsDisabled}
                          placeholder="Resumo do documento e da intencao clinica."
                        />
                      </label>
                    </div>
                  </section>

                  <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Blocos</p>
                        <h4 className="mt-1 text-base font-semibold text-slate-950">Conteudo estrutural</h4>
                      </div>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={editor.addBlock}
                        disabled={inputsDisabled}
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar secao
                      </Button>
                    </div>

                    <div className="mt-4 space-y-3">
                      {editor.blocks.map((block, index) => (
                        <article
                          key={block.id}
                          className={cn(
                            "rounded-3xl border px-4 py-4 transition",
                            block.tone === "accent"
                              ? "border-emerald-200 bg-emerald-50/60"
                              : block.tone === "muted"
                                ? "border-slate-200 bg-slate-50/80"
                                : "border-slate-200 bg-slate-50/40",
                          )}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Bloco {index + 1}
                              </p>
                              <p className="mt-1 font-semibold text-slate-950">{block.title}</p>
                            </div>

                            <div className="flex items-center gap-2">
                              <Badge tone={toneBadge(block.tone)}>{formatBlockTone(block.tone)}</Badge>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editor.duplicateBlock(block.id)}
                                disabled={inputsDisabled}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => editor.removeBlock(block.id)}
                                disabled={inputsDisabled || editor.blocks.length <= 1}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                            <label className="grid gap-2 text-sm text-slate-600">
                              <span className="font-medium text-slate-900">Titulo da secao</span>
                              <Input
                                value={block.title}
                                onChange={(event) =>
                                  editor.updateBlock(block.id, { title: event.target.value })
                                }
                                disabled={inputsDisabled}
                              />
                            </label>

                            <label className="grid gap-2 text-sm text-slate-600">
                              <span className="font-medium text-slate-900">Tom visual</span>
                              <select
                                className="field-base"
                                value={block.tone}
                                onChange={(event) =>
                                  editor.updateBlock(block.id, {
                                    tone: event.target.value as DocumentLayoutEditorBlock["tone"],
                                  })
                                }
                                disabled={inputsDisabled}
                              >
                                <option value="default">Padrao</option>
                                <option value="muted">Suave</option>
                                <option value="accent">Destaque</option>
                              </select>
                            </label>
                          </div>

                          <label className="mt-3 grid gap-2 text-sm text-slate-600">
                            <span className="font-medium text-slate-900">Conteudo</span>
                            <textarea
                              className="min-h-28 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2 disabled:opacity-60"
                              value={block.content}
                              onChange={(event) =>
                                editor.updateBlock(block.id, { content: event.target.value })
                              }
                              disabled={inputsDisabled}
                              placeholder="Texto do bloco."
                            />
                          </label>
                        </article>
                      ))}
                    </div>
                  </section>
                </div>

                <aside className="space-y-4">
                  <section className="rounded-[1.75rem] border border-slate-200 bg-gradient-to-b from-slate-950 to-slate-900 p-5 text-white">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">Preview</p>
                        <h4 className="mt-1 text-base font-semibold">Pagina de documento</h4>
                      </div>
                      <Badge tone="default">Live</Badge>
                    </div>

                    <div
                      className={cn(
                        "mt-5 mx-auto rounded-[2rem] border border-white/10 bg-white p-5 text-slate-900 shadow-2xl",
                        canvasClass(editor.pageWidth),
                      )}
                    >
                      <div className={cn("h-1.5 rounded-full", accentClass(editor.accent))} />
                      <div className="mt-4 flex items-start justify-between gap-3">
                        <div>
                          {editor.logoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={editor.logoUrl}
                              alt={editor.organizationName || "Marca"}
                              className="mb-3 h-10 max-w-[180px] object-contain"
                            />
                          ) : null}
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                            {(editor.organizationName || "EmagrecePlus").trim() || "EmagrecePlus"}
                          </p>
                          <h5 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                            {editor.title || "Titulo do documento"}
                          </h5>
                        </div>
                        <Badge tone="success">{selectedStatus}</Badge>
                      </div>

                      <p className="mt-3 text-sm leading-6 text-slate-600">
                        {editor.summary || "Resumo do documento e da intencao clinica."}
                      </p>

                      <div className="mt-5 space-y-3">
                        {editor.blocks.map((block) => (
                          <div
                            key={block.id}
                            className={cn(
                              "rounded-2xl border p-3",
                              block.tone === "accent"
                                ? "border-emerald-200 bg-emerald-50/70"
                                : block.tone === "muted"
                                  ? "border-slate-200 bg-slate-50"
                                  : "border-slate-200 bg-white",
                            )}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-950">{block.title}</p>
                              <Badge tone="default">{formatBlockTone(block.tone)}</Badge>
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-600">{block.content}</p>
                          </div>
                        ))}
                      </div>

                      {editor.footerNote ? (
                        <div className="mt-6 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-500">
                          {editor.footerNote}
                        </div>
                      ) : null}
                    </div>
                  </section>

                  <section className="surface-card space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Inspector</p>
                        <h4 className="mt-1 text-base font-semibold text-slate-950">Branding e layout</h4>
                      </div>
                      <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge tone={editor.brandingDirty ? "warning" : "default"}>
                        {editor.brandingDirty ? "Branding alterado" : "Branding sincronizado"}
                      </Badge>
                      <Badge tone={editor.templateDirty ? "warning" : "default"}>
                        {editor.templateDirty ? "Layout alterado" : "Layout sincronizado"}
                      </Badge>
                    </div>

                    <div className="grid gap-3">
                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Nome da marca</span>
                        <Input
                          value={editor.organizationName}
                          onChange={(event) => editor.setOrganizationName(event.target.value)}
                          disabled={inputsDisabled}
                          placeholder="Nome exibido no topo do documento"
                        />
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Logo / URL da marca</span>
                        <Input
                          value={editor.logoUrl}
                          onChange={(event) => editor.setLogoUrl(event.target.value)}
                          disabled={inputsDisabled}
                          placeholder="https://... ou caminho do bucket"
                        />
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Largura da pagina</span>
                        <select
                          className="field-base"
                          value={editor.pageWidth}
                          onChange={(event) =>
                            editor.setPageWidth(
                              event.target.value as DocumentLayoutEditorPageWidth,
                            )
                          }
                          disabled={inputsDisabled}
                        >
                          {widthOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Preset documental</span>
                        <select
                          className="field-base"
                          value={editor.presetCode}
                          onChange={(event) => editor.setPresetCode(event.target.value as typeof editor.presetCode)}
                          disabled={inputsDisabled}
                        >
                          {editor.presets.map((preset) => (
                            <option key={preset.code} value={preset.code}>
                              {preset.name}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Cor de destaque</span>
                        <select
                          className="field-base"
                          value={editor.accent}
                          onChange={(event) =>
                            editor.setAccent(
                              event.target.value as DocumentLayoutEditorAccent,
                            )
                          }
                          disabled={inputsDisabled}
                        >
                          {accentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="grid gap-2 text-sm text-slate-600">
                        <span className="font-medium text-slate-900">Rodape institucional</span>
                        <textarea
                          className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2 disabled:opacity-60"
                          value={editor.footerNote}
                          onChange={(event) => editor.setFooterNote(event.target.value)}
                          disabled={inputsDisabled}
                          placeholder="Texto padrao no rodape do documento."
                        />
                      </label>

                      <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-sm text-slate-600">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Contexto</p>
                        <div className="mt-3 space-y-2">
                          <InfoRow label="Modelo" value={editor.selectedTemplate?.title ?? "Nenhum"} />
                          <InfoRow
                            label="Tipo"
                            value={formatTemplateKind(
                              editor.selectedTemplate?.templateKind ?? "custom",
                            )}
                          />
                          <InfoRow
                            label="Preset"
                            value={
                              editor.presets.find((preset) => preset.code === editor.presetCode)?.name ??
                              editor.presetCode
                            }
                          />
                          <InfoRow
                            label="Versao"
                            value={
                              editor.selectedTemplate?.currentVersion?.versionNumber
                                ? `v${editor.selectedTemplate.currentVersion.versionNumber}`
                                : "Sem versao"
                            }
                          />
                          <InfoRow
                            label="Salvo"
                            value={savedAt ? formatShortDateTime(savedAt) : "Ainda nao sincronizado"}
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
                        {persistenceMessage}
                      </div>
                    </div>
                  </section>
                </aside>
              </div>
            )}
          </section>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <section className="surface-card space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Acoes</p>
                <h3 className="mt-1 text-lg font-semibold text-slate-950">Fluxo rapido</h3>
              </div>
              <Badge tone={canWrite ? "success" : "warning"}>
                {canWrite ? "Escrita" : "Leitura"}
              </Badge>
            </div>

            <div className="space-y-2">
              <Button
                className="w-full justify-start"
                variant="secondary"
                onClick={() => void editor.save()}
                disabled={!canWrite || !editor.canSave || editor.saveMutation.isPending}
              >
                <BadgeCheck className="h-4 w-4" />
                {saveLabel}
              </Button>
              <Button
                className="w-full justify-start"
                variant="secondary"
                onClick={editor.reset}
                disabled={!canWrite || !editor.canReset || editor.saveMutation.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Restaurar modelo base
              </Button>
              <Button
                className="w-full justify-start"
                variant="secondary"
                onClick={() => router.push("/clinical/tasks")}
              >
                <LayoutTemplate className="h-4 w-4" />
                Revisar tarefas clinicas
              </Button>
            </div>
          </section>

          <section className="surface-card space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Boas praticas</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Checklist visual</h3>
            </div>

            <div className="space-y-3 text-sm text-slate-600">
              <ChecklistItem title="Marca definida" done={Boolean(editor.organizationName.trim())} />
              <ChecklistItem title="Preset selecionado" done={Boolean(editor.presetCode)} />
              <ChecklistItem title="Rodape institucional" done={Boolean(editor.footerNote.trim())} />
              <ChecklistItem title="Titulo curto" done={Boolean(editor.title.trim())} />
              <ChecklistItem title="Resumo presente" done={Boolean(editor.summary.trim())} />
              <ChecklistItem title="Ao menos um bloco" done={editor.blocks.length > 0} />
            </div>
          </section>

          <section className="surface-card space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Padroes</p>
              <h3 className="mt-1 text-lg font-semibold text-slate-950">Referencia institucional</h3>
            </div>

            <div className="space-y-3">
              {editor.guidelines.map((item) => (
                <div key={item.code} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-950">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/8 px-4 py-3 backdrop-blur">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/55">{label}</p>
      <p className="mt-2 text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ChecklistItem({ title, done }: { title: string; done: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 px-3 py-2">
      <span className="text-slate-700">{title}</span>
      <Badge tone={done ? "success" : "warning"}>{done ? "OK" : "Pendente"}</Badge>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-950">{value}</span>
    </div>
  );
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
    case "custom":
      return "Customizado";
    default:
      return "Modelo";
  }
}

function formatBlockTone(value: DocumentLayoutEditorBlock["tone"]) {
  switch (value) {
    case "accent":
      return "Destaque";
    case "muted":
      return "Suave";
    default:
      return "Padrao";
  }
}

function toneBadge(value: DocumentLayoutEditorBlock["tone"]) {
  switch (value) {
    case "accent":
      return "success";
    case "muted":
      return "default";
    default:
      return "warning";
  }
}

function formatStatusLabel(value: string) {
  switch (value) {
    case "active":
      return "Ativo";
    case "published":
      return "Publicado";
    case "archived":
      return "Arquivado";
    case "draft":
      return "Rascunho";
    default:
      return value;
  }
}

function canvasClass(value: DocumentLayoutEditorPageWidth) {
  switch (value) {
    case "compact":
      return "max-w-[640px]";
    case "wide":
      return "max-w-[920px]";
    default:
      return "max-w-[780px]";
  }
}

function accentClass(value: DocumentLayoutEditorAccent) {
  switch (value) {
    case "indigo":
      return "bg-gradient-to-r from-indigo-500 via-sky-500 to-cyan-400";
    case "slate":
      return "bg-gradient-to-r from-slate-500 via-slate-700 to-slate-900";
    default:
      return "bg-gradient-to-r from-emerald-500 via-teal-500 to-lime-400";
  }
}
