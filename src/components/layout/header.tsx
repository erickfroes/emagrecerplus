"use client";

import { Bell, CalendarClock, LogOut, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUnit } from "@/hooks/use-current-unit";
import { env } from "@/lib/env";

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currentUnit, units, setCurrentUnit } = useCurrentUnit();

  async function handleLogout() {
    if (env.authMode === "real") {
      window.location.assign("/auth/sign-out?next=/login");
      return;
    }

    logout();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface/80 px-4 backdrop-blur md:px-6">
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-slate-50 px-3 py-2 focus-within:ring-2 focus-within:ring-slate-900/10">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          className="w-44 bg-transparent text-sm text-foreground placeholder:text-slate-400 focus:outline-none md:w-64"
          placeholder="Buscar pacientes, leads..."
        />
      </div>

      <div className="flex items-center gap-3 md:gap-4">
        <button className="hidden items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 md:inline-flex">
          <CalendarClock className="h-4 w-4" />
          Operacao do dia
        </button>

        <Link
          href="/notifications"
          className="rounded-2xl border border-border bg-surface p-2 text-slate-600 hover:bg-slate-50"
          aria-label="Abrir notificacoes"
          title="Notificacoes"
        >
          <Bell className="h-4 w-4" />
        </Link>

        <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-3 py-2">
          <div className="text-left">
            <p className="text-xs text-slate-500">Unidade ativa</p>
            <select
              aria-label="Selecionar unidade atual"
              className="bg-transparent text-sm font-medium text-slate-900 focus:outline-none"
              onChange={(event) => setCurrentUnit(event.target.value)}
              value={currentUnit?.id ?? ""}
            >
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden border-l border-border pl-3 text-left md:block">
            <p className="text-xs text-slate-500">{currentUnit?.city ?? "Sem cidade"}</p>
            <p className="text-sm font-medium text-slate-900">{user?.name ?? "Sem sessao"}</p>
          </div>
        </div>

        <Button size="sm" variant="secondary" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
