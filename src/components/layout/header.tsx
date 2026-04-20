"use client";

import { Bell, CalendarClock, ChevronDown, LogOut, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentUnit } from "@/hooks/use-current-unit";
import { Button } from "@/components/ui/button";
import { env } from "@/lib/env";

export function Header() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const { currentUnit } = useCurrentUnit();

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
          Operação do dia
        </button>

        <button className="rounded-2xl border border-border bg-surface p-2 text-slate-600 hover:bg-slate-50">
          <Bell className="h-4 w-4" />
        </button>

        <button className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-3 py-2 hover:bg-slate-50">
          <div className="text-left">
            <p className="text-xs text-slate-500">{currentUnit?.name ?? "Sem unidade"}</p>
            <p className="text-sm font-medium text-slate-900">{user?.name ?? "Sem sessão"}</p>
          </div>
          <ChevronDown className="h-4 w-4 text-slate-500" />
        </button>

        <Button size="sm" variant="secondary" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sair
        </Button>
      </div>
    </header>
  );
}
