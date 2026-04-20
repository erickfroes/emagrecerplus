"use client";

import { Input } from "@/components/ui/input";

export function PatientsFilters({
  search,
  status,
  tag,
  flag,
  onSearchChange,
  onStatusChange,
  onTagChange,
  onFlagChange,
}: {
  search: string;
  status: string;
  tag: string;
  flag: string;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onFlagChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-2xl border border-slate-200 bg-surface p-4 md:grid-cols-4">
      <Input
        placeholder="Buscar por nome, CPF ou telefone"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <select
        className="field-base"
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="">Todos os status</option>
        <option value="Ativo">Ativos</option>
        <option value="Inativo">Inativos</option>
        <option value="Arquivado">Arquivados</option>
      </select>
      <Input
        placeholder="Filtrar por tag"
        value={tag}
        onChange={(e) => onTagChange(e.target.value)}
      />
      <Input
        placeholder="Filtrar por flag"
        value={flag}
        onChange={(e) => onFlagChange(e.target.value)}
      />
    </div>
  );
}
