"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/types/auth";

const actions = [
  { href: "/patients", label: "Novo paciente", permission: "patients:write" },
  { href: "/crm", label: "Novo lead", permission: "crm:write" },
  { href: "/schedule", label: "Novo agendamento", permission: "schedule:write" },
  { href: "/clinical/tasks", label: "Abrir tarefas", permission: "clinical:view" },
  { href: "/app", label: "Portal do paciente", permission: null },
] satisfies Array<{ href: string; label: string; permission: PermissionKey | null }>;

export function QuickActionsCard() {
  const { can } = usePermissions();
  const visibleActions = actions.filter(
    (action) => action.permission === null || can(action.permission)
  );

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Atalhos rapidos</h2>
      <div className="grid gap-2">
        {visibleActions.map((action) => (
          <Link
            key={action.label}
            href={action.href}
            className="rounded-2xl border border-[color:var(--border)] px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </Card>
  );
}
