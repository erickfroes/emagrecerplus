import Link from "next/link";
import { Card } from "@/components/ui/card";

const actions = [
  { href: "/patients", label: "Novo paciente" },
  { href: "/crm", label: "Novo lead" },
  { href: "/schedule", label: "Novo agendamento" },
  { href: "/clinical/tasks", label: "Abrir tarefas" },
  { href: "/app", label: "Portal do paciente" },
];

export function QuickActionsCard() {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-950">Atalhos rapidos</h2>
      <div className="grid gap-2">
        {actions.map((action) => (
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
