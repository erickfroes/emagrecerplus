"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import type { CreatePrescriptionItemInput } from "@/modules/clinical/api/create-prescription-record";
import { useCreatePrescriptionRecord } from "@/modules/clinical/hooks/use-create-prescription-record";
import type { PrescriptionRecord } from "@/modules/clinical/types";

type PrescriptionItemDraft = {
  itemType: string;
  title: string;
  dosage: string;
  frequency: string;
  route: string;
  durationDays: string;
  quantity: string;
  unit: string;
  instructions: string;
};

const PRESCRIPTION_TYPE_OPTIONS = [
  { value: "MEDICATION", label: "Medicamento" },
  { value: "SUPPLEMENT", label: "Suplemento" },
  { value: "DIET", label: "Dieta" },
  { value: "EXERCISE", label: "Exercicio" },
  { value: "OTHER", label: "Outro" },
];

const ITEM_TYPE_OPTIONS = [
  { value: "MEDICATION", label: "Medicamento" },
  { value: "SUPPLEMENT", label: "Suplemento" },
  { value: "FOOD", label: "Alimento" },
  { value: "EXERCISE", label: "Exercicio" },
  { value: "OTHER", label: "Outro" },
];

export function PrescriptionRecordForm({
  encounterId,
  items,
}: {
  encounterId: string;
  items: PrescriptionRecord[];
}) {
  const { can } = usePermissions();
  const mutation = useCreatePrescriptionRecord(encounterId);
  const [prescriptionType, setPrescriptionType] = useState(PRESCRIPTION_TYPE_OPTIONS[0]?.value ?? "MEDICATION");
  const [summary, setSummary] = useState("");
  const [issuedAt, setIssuedAt] = useState(() => toLocalDateTimeValue(new Date()));
  const [draftItems, setDraftItems] = useState<PrescriptionItemDraft[]>([createEmptyDraftItem()]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canWrite = can("clinical:write");

  function updateDraftItem(index: number, field: keyof PrescriptionItemDraft, value: string) {
    setDraftItems((current) =>
      current.map((item, currentIndex) => (currentIndex === index ? { ...item, [field]: value } : item)),
    );
  }

  function addDraftItem() {
    setDraftItems((current) => [...current, createEmptyDraftItem(current.length + 1)]);
  }

  function removeDraftItem(index: number) {
    setDraftItems((current) => {
      if (current.length === 1) {
        return [createEmptyDraftItem()];
      }

      return current.filter((_, currentIndex) => currentIndex !== index);
    });
  }

  function resetForm() {
    setPrescriptionType(PRESCRIPTION_TYPE_OPTIONS[0]?.value ?? "MEDICATION");
    setSummary("");
    setIssuedAt(toLocalDateTimeValue(new Date()));
    setDraftItems([createEmptyDraftItem()]);
  }

  async function handleSubmit() {
    if (!canWrite) {
      return;
    }

    const normalizedItems = draftItems
      .map((item, index) => normalizeDraftItem(item, index))
      .filter((item): item is CreatePrescriptionItemInput => Boolean(item));

    if (normalizedItems.length === 0) {
      setErrorMessage("Adicione ao menos um item valido para a prescricao.");
      setSuccessMessage(null);
      return;
    }

    setErrorMessage(null);
    setSuccessMessage(null);

    await mutation.mutateAsync({
      prescriptionType,
      summary: summary.trim() || undefined,
      issuedAt: issuedAt ? new Date(issuedAt).toISOString() : undefined,
      items: normalizedItems,
    });

    setSuccessMessage("Prescricao estruturada registrada com sucesso.");
    resetForm();
  }

  return (
    <Card>
      <div className="space-y-1">
        <h2 className="text-base font-semibold text-slate-900">Prescricoes estruturadas</h2>
        <p className="text-sm text-slate-500">
          Registre prescricoes com itens estruturados para reaproveitar no cuidado longitudinal.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {items.length ? (
          items.map((item) => <PrescriptionRecordCard key={item.id} item={item} />)
        ) : (
          <p className="rounded-2xl border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
            Nenhuma prescricao estruturada registrada ate o momento.
          </p>
        )}
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-slate-900">Nova prescricao estruturada</h3>
          <p className="text-sm text-slate-500">
            O primeiro slice desta etapa foca no registro visual do encounter. O backend integra o envio.
          </p>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_1fr_0.9fr]">
          <label className="grid gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">Tipo de prescricao</span>
            <select
              className="field-base"
              value={prescriptionType}
              onChange={(event) => setPrescriptionType(event.target.value)}
              disabled={!canWrite || mutation.isPending}
            >
              {PRESCRIPTION_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">Emitida em</span>
            <Input
              type="datetime-local"
              value={issuedAt}
              onChange={(event) => setIssuedAt(event.target.value)}
              disabled={!canWrite || mutation.isPending}
            />
          </label>

          <label className="grid gap-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">Resumo</span>
            <Input
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="Ex.: uso domiciliar e orientacoes principais"
              disabled={!canWrite || mutation.isPending}
            />
          </label>
        </div>

        <div className="mt-4 space-y-4">
          {draftItems.map((item, index) => (
            <div key={`draft-${index}`} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-slate-900">Item {index + 1}</p>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => removeDraftItem(index)}
                  disabled={!canWrite || mutation.isPending}
                >
                  Remover
                </Button>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Tipo do item</span>
                  <select
                    className="field-base"
                    value={item.itemType}
                    onChange={(event) => updateDraftItem(index, "itemType", event.target.value)}
                    disabled={!canWrite || mutation.isPending}
                  >
                    {ITEM_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Titulo</span>
                  <Input
                    value={item.title}
                    onChange={(event) => updateDraftItem(index, "title", event.target.value)}
                    placeholder="Ex.: Metformina 850 mg"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Dosagem</span>
                  <Input
                    value={item.dosage}
                    onChange={(event) => updateDraftItem(index, "dosage", event.target.value)}
                    placeholder="850 mg"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Frequencia</span>
                  <Input
                    value={item.frequency}
                    onChange={(event) => updateDraftItem(index, "frequency", event.target.value)}
                    placeholder="2x ao dia"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Via</span>
                  <Input
                    value={item.route}
                    onChange={(event) => updateDraftItem(index, "route", event.target.value)}
                    placeholder="Oral"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Duracao (dias)</span>
                  <Input
                    type="number"
                    min="0"
                    value={item.durationDays}
                    onChange={(event) => updateDraftItem(index, "durationDays", event.target.value)}
                    placeholder="7"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[0.9fr_0.8fr_0.6fr_1.2fr]">
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Quantidade</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={item.quantity}
                    onChange={(event) => updateDraftItem(index, "quantity", event.target.value)}
                    placeholder="30"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Unidade</span>
                  <Input
                    value={item.unit}
                    onChange={(event) => updateDraftItem(index, "unit", event.target.value)}
                    placeholder="comprimidos"
                    disabled={!canWrite || mutation.isPending}
                  />
                </label>
                <div className="grid gap-2 text-sm text-slate-600 lg:col-span-2">
                  <span className="font-medium text-slate-900">Orientacoes</span>
                  <textarea
                    className="min-h-24 w-full rounded-2xl border border-border bg-surface p-3 text-sm text-foreground placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2"
                    value={item.instructions}
                    onChange={(event) => updateDraftItem(index, "instructions", event.target.value)}
                    placeholder="Ex.: tomar apos o cafe da manha e jantar."
                    disabled={!canWrite || mutation.isPending}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Button
            type="button"
            variant="secondary"
            onClick={addDraftItem}
            disabled={!canWrite || mutation.isPending}
          >
            Adicionar item
          </Button>

          <div className="flex flex-col gap-2 text-sm">
            {!canWrite ? (
              <p className="text-slate-500">Sua sessao esta em modo somente leitura para prescricoes.</p>
            ) : null}
            {mutation.isError ? <p className="text-red-600">Erro ao registrar prescricao estruturada.</p> : null}
            {errorMessage ? <p className="text-red-600">{errorMessage}</p> : null}
            {successMessage ? <p className="text-emerald-700">{successMessage}</p> : null}
          </div>

          <Button type="button" onClick={() => void handleSubmit()} disabled={!canWrite || mutation.isPending}>
            {mutation.isPending ? "Registrando..." : "Registrar prescricao"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function createEmptyDraftItem(position = 1): PrescriptionItemDraft {
  return {
    itemType: ITEM_TYPE_OPTIONS[0]?.value ?? "MEDICATION",
    title: "",
    dosage: "",
    frequency: "",
    route: "",
    durationDays: "",
    quantity: "",
    unit: "",
    instructions: "",
  };
}

function normalizeDraftItem(item: PrescriptionItemDraft, position: number): CreatePrescriptionItemInput | null {
  if (!item.itemType.trim() || !item.title.trim()) {
    return null;
  }

  return {
    itemType: item.itemType.trim(),
    title: item.title.trim(),
    dosage: item.dosage.trim() || undefined,
    frequency: item.frequency.trim() || undefined,
    route: item.route.trim() || undefined,
    durationDays: toOptionalNumber(item.durationDays),
    quantity: toOptionalNumber(item.quantity),
    unit: item.unit.trim() || undefined,
    instructions: item.instructions.trim() || undefined,
    position,
  };
}

function toOptionalNumber(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toLocalDateTimeValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  const hours = String(value.getHours()).padStart(2, "0");
  const minutes = String(value.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatIssuedAt(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function PrescriptionRecordCard({ item }: { item: PrescriptionRecord }) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{item.prescriptionType}</p>
          <p className="text-xs text-slate-500">
            {item.issuedAt ? `Emitida em ${formatIssuedAt(item.issuedAt)}` : "Sem data de emissao"}
          </p>
        </div>
        {item.summary ? <p className="text-sm text-slate-600">{item.summary}</p> : null}
      </div>

      <div className="mt-3 space-y-2">
        {item.items.map((prescriptionItem) => (
          <div key={prescriptionItem.id} className="rounded-2xl border border-white bg-white px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-900">{prescriptionItem.title}</p>
              <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                {prescriptionItem.itemType}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{buildPrescriptionItemSummary(prescriptionItem)}</p>
            {prescriptionItem.instructions ? (
              <p className="mt-1 text-sm text-slate-600">{prescriptionItem.instructions}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildPrescriptionItemSummary(item: PrescriptionRecord["items"][number]) {
  const parts = [item.dosage, item.frequency, item.route, item.durationDays ? `${item.durationDays} dias` : null]
    .filter(Boolean)
    .join(" • ");

  if (!parts) {
    return "Sem detalhes estruturados adicionais.";
  }

  return parts;
}
