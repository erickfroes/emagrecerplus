import { redirect } from "next/navigation";
import { getServerAuthState } from "@/lib/auth/server-session";
import { LoginPageClient } from "@/modules/auth/components/login-page-client";

export default async function LoginPage() {
  const authState = await getServerAuthState();

  if (authState.authMode === "real" && authState.supabaseUser && authState.appSessionState === "invalid") {
    redirect("/auth/sign-out?next=/login");
  }

  if (
    authState.authMode === "real" &&
    authState.supabaseUser &&
    authState.appSessionState === "valid"
  ) {
    redirect("/dashboard");
  }

  return <LoginPageClient />;
}
