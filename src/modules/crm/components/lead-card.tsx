import type { LeadListItem } from "@/types/api";

export function LeadCard({
  lead,
  onSelect,
}: {
  lead: LeadListItem;
  onSelect: (lead: LeadListItem) => void;
}) {
  return (
    <button
      className="w-full rounded-2xl border border-white/60 bg-surface p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      onClick={() => onSelect(lead)}
      type="button"
    >
      <p className="text-sm font-medium text-slate-950">{lead.name}</p>
      <p className="mt-1 text-xs text-slate-500">{lead.phone ?? "-"} · {lead.source ?? "-"}</p>
      <p className="mt-1 text-xs text-slate-500">{lead.interest ?? "-"}</p>
      <p className="mt-3 text-xs text-slate-400">Ultimo contato: {lead.lastContact}</p>
    </button>
  );
}
