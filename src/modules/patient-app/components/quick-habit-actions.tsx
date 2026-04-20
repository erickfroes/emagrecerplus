import Link from "next/link";

const actions = [
  { href: "/app/water", label: "Agua", helper: "Registrar hidratação" },
  { href: "/app/meals", label: "Refeicoes", helper: "Registrar alimentacao" },
  { href: "/app/workouts", label: "Treino", helper: "Marcar atividade" },
  { href: "/app/sleep", label: "Sono", helper: "Registrar descanso" },
  { href: "/app/symptoms", label: "Sintomas", helper: "Informar percepcoes" },
];

export function QuickHabitActions() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className="rounded-3xl border border-border bg-surface px-4 py-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-base font-semibold text-slate-950">{action.label}</p>
          <p className="mt-2 text-sm text-slate-500">{action.helper}</p>
        </Link>
      ))}
    </div>
  );
}
