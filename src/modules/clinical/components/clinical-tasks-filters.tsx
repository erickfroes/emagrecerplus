"use client";

import { Input } from "@/components/ui/input";

export function ClinicalTasksFilters({
  search,
  patient,
  priority,
  status,
  onSearchChange,
  onPatientChange,
  onPriorityChange,
  onStatusChange,
}: {
  search: string;
  patient: string;
  priority: string;
  status: string;
  onSearchChange: (value: string) => void;
  onPatientChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onStatusChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 rounded-3xl border border-border bg-surface p-4 md:grid-cols-4">
      <Input
        placeholder="Buscar tarefa"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <Input
        placeholder="Filtrar por paciente"
        value={patient}
        onChange={(e) => onPatientChange(e.target.value)}
      />
      <select
        className="field-base"
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value)}
      >
        <option value="">Todas as prioridades</option>
        <option value="Baixa">Baixa</option>
        <option value="Media">Media</option>
        <option value="Alta">Alta</option>
        <option value="Urgente">Urgente</option>
      </select>
      <select
        className="field-base"
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        <option value="">Todos os status</option>
        <option value="Aberta">Aberta</option>
        <option value="Em andamento">Em andamento</option>
        <option value="Concluida">Concluida</option>
        <option value="Cancelada">Cancelada</option>
      </select>
    </div>
  );
}
