import Link from "next/link";

export default function PatientPortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col px-4 py-6">
        <header className="mb-6 flex items-center justify-between rounded-3xl border border-border bg-surface px-4 py-3 shadow-sm">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-slate-400">EmagrecePlus</p>
            <p className="text-sm font-semibold text-slate-950">Portal do paciente</p>
          </div>
          <Link className="text-sm font-medium text-slate-600 hover:text-slate-950" href="/dashboard">
            Voltar ao admin
          </Link>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
