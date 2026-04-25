import { redirect } from "next/navigation";
import { AdminShell } from "@/components/layout/admin-shell";
import { getServerAuthState } from "@/lib/auth/server-session";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const authState = await getServerAuthState();

  if (
    authState.authMode === "real" &&
    !authState.supabaseUser
  ) {
    redirect("/login");
  }

  if (authState.authMode === "real" && authState.supabaseUser && authState.appSessionState === "invalid") {
    redirect("/auth/sign-out?next=/login");
  }

  if (authState.authMode === "real" && authState.appSession?.user.role === "patient") {
    redirect("/app");
  }

  return <AdminShell>{children}</AdminShell>;
}
