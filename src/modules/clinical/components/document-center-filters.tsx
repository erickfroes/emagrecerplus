"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  documentStatusOptions,
  documentTypeOptions,
  signatureStatusOptions,
} from "@/modules/clinical/lib/document-display";

export function DocumentCenterFilters({
  patientId,
  documentType,
  status,
  signatureStatus,
  issuedFrom,
  issuedTo,
  hasActiveFilters,
  disabled,
  onPatientIdChange,
  onDocumentTypeChange,
  onStatusChange,
  onSignatureStatusChange,
  onIssuedFromChange,
  onIssuedToChange,
  onClear,
}: {
  patientId: string;
  documentType: string;
  status: string;
  signatureStatus: string;
  issuedFrom: string;
  issuedTo: string;
  hasActiveFilters: boolean;
  disabled?: boolean;
  onPatientIdChange: (value: string) => void;
  onDocumentTypeChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onSignatureStatusChange: (value: string) => void;
  onIssuedFromChange: (value: string) => void;
  onIssuedToChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1fr_0.9fr_0.9fr_auto]">
      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Paciente
        <Input
          placeholder="ID do paciente"
          value={patientId}
          onChange={(event) => onPatientIdChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Tipo
        <select
          className="field-base"
          value={documentType}
          onChange={(event) => onDocumentTypeChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Todos os tipos</option>
          {documentTypeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Status
        <select
          className="field-base"
          value={status}
          onChange={(event) => onStatusChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Todos os status</option>
          {documentStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Assinatura
        <select
          className="field-base"
          value={signatureStatus}
          onChange={(event) => onSignatureStatusChange(event.target.value)}
          disabled={disabled}
        >
          <option value="">Todos</option>
          {signatureStatusOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Inicio
        <Input
          type="date"
          value={issuedFrom}
          onChange={(event) => onIssuedFromChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <label className="grid gap-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        Fim
        <Input
          type="date"
          value={issuedTo}
          onChange={(event) => onIssuedToChange(event.target.value)}
          disabled={disabled}
        />
      </label>

      <div className="flex items-end">
        <Button
          type="button"
          variant="secondary"
          className="w-full md:w-auto"
          onClick={onClear}
          disabled={disabled || !hasActiveFilters}
        >
          <RotateCcw className="h-4 w-4" />
          Limpar
        </Button>
      </div>
    </div>
  );
}
