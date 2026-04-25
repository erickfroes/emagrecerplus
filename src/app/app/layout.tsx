import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerAuthState } from "@/lib/auth/server-session";

export default async function PatientPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authState = await getServerAuthState();

  if (authState.authMode === "real" && !authState.supabaseUser) {
    redirect("/login");
  }

  if (authState.authMode === "real" && authState.supabaseUser && authState.appSessionState === "invalid") {
    redirect("/auth/sign-out?next=/login");
  }

  const showBackToAdmin = authState.appSession?.user.role !== "patient";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6">
        <header className="mb-6 flex items-center justify-between rounded-3xl border border-border bg-surface px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">EmagrecePlus</p>
            <p className="text-sm font-semibold text-slate-950">Portal do paciente</p>
          </div>
          {showBackToAdmin ? (
            <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/dashboard">
              Voltar ao admin
            </Link>
          ) : null}
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
