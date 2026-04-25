"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

const segmentLabels: Record<string, string> = {
  dashboard: "Dashboard",
  patients: "Pacientes",
  schedule: "Agenda",
  crm: "CRM",
  clinical: "Clinico",
  encounters: "Atendimento",
  documents: "Documentos",
  tasks: "Tarefas",
  settings: "Configuracoes",
  app: "Portal do paciente",
  water: "Agua",
  meals: "Refeicoes",
  workouts: "Treinos",
  sleep: "Sono",
  symptoms: "Sintomas",
};

export function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  if (!segments.length) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-slate-500">
      <Link className="hover:text-slate-900" href="/dashboard">
        Inicio
      </Link>

      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const label = segmentLabels[segment] ?? (Number.isNaN(Number(segment)) ? segment : "Detalhe");
        const isLast = index === segments.length - 1;

        return (
          <span key={href} className="flex items-center gap-2">
            <ChevronRight className="h-4 w-4 text-slate-400" />
            {isLast ? (
              <span className="font-medium text-slate-900">{label}</span>
            ) : (
              <Link className="hover:text-slate-900" href={href}>
                {label}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
