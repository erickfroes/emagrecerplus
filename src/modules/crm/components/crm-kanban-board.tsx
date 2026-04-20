"use client";

import { useState } from "react";
import { LeadCard } from "@/modules/crm/components/lead-card";
import { LeadDrawer } from "@/modules/crm/components/lead-drawer";
import type { LeadsKanbanResponse } from "@/types/api";

export function CrmKanbanBoard({ data }: { data: LeadsKanbanResponse }) {
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const selectedLead =
    data.columns.flatMap((column) => column.items).find((lead) => lead.id === selectedLeadId) ?? null;

  return (
    <>
      <div className="grid gap-4 xl:grid-cols-4 2xl:grid-cols-7">
        {data.columns.map((column) => (
          <div key={column.code} className="rounded-3xl border border-border bg-slate-50 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-950">{column.title}</h2>
              <span className="rounded-full bg-surface px-2 py-1 text-xs text-slate-500">{column.items.length}</span>
            </div>
            <div className="space-y-3">
              {column.items.map((item) => (
                <LeadCard key={item.id} lead={item} onSelect={(lead) => setSelectedLeadId(lead.id)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <LeadDrawer
        availableStages={data.columns.map((column) => ({
          code: column.code,
          title: column.title,
        }))}
        lead={selectedLead}
        open={selectedLeadId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedLeadId(null);
          }
        }}
      />
    </>
  );
}
