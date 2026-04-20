"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Breadcrumbs } from "./breadcrumbs";
import { Header } from "./header";
import { Sidebar } from "./sidebar";
import { useAuth } from "@/hooks/use-auth";

export function AdminShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const router = useRouter();
  const { hasHydrated, authResolved, isAuthenticated } = useAuth();

  useEffect(() => {
    if (hasHydrated && authResolved && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hasHydrated, authResolved, isAuthenticated, router]);

  if (!hasHydrated || !authResolved) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-500">
        Carregando sessão...
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[280px_1fr]">
        <Sidebar />
        <div className="flex min-h-screen flex-col">
          <Header />
          <main className="flex-1 px-4 py-5 md:px-6 md:py-6">
            <Breadcrumbs />
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}