"use client";

import type { ReactNode } from "react";
import { QueryProvider } from "@/components/providers/query-provider";
import { SupabaseAuthBridge } from "@/components/providers/supabase-auth-bridge";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <QueryProvider>
      <SupabaseAuthBridge />
      {children}
    </QueryProvider>
  );
}