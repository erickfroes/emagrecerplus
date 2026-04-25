"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { appTagline } from "@/lib/constants";
import { env } from "@/lib/env";
import { HttpError } from "@/lib/http";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getAuthMe } from "@/modules/auth/api/get-auth-me";

const loginSchema = z.object({
  email: z.email("Informe um e-mail valido."),
  password: z.string().min(6, "Informe sua senha."),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPageClient() {
  const router = useRouter();
  const { login, clearSession, setSession, setAuthResolved } = useAuth();
  const [isPending, startTransition] = useTransition();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: env.authMode === "mock" ? env.demoDefaultEmail : "",
      password: env.authMode === "mock" ? env.demoDefaultPassword : "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setAuthError(null);
    setIsSubmitting(true);

    if (env.authMode === "real") {
      const supabase = getSupabaseBrowserClient();

      try {
        setAuthResolved(false);

        const { data, error } = await supabase.auth.signInWithPassword({
          email: values.email,
          password: values.password,
        });

        if (error || !data.session?.access_token) {
          setAuthResolved(true);
          setAuthError(error?.message ?? "Falha no login.");
          return;
        }

        const appSession = await getAuthMe(data.session.access_token);

        setSession({
          token: data.session.access_token,
          session: appSession,
        });

        startTransition(() => {
          router.push(appSession.user.role === "patient" ? "/app" : "/dashboard");
        });
        return;
      } catch (error) {
        await supabase.auth.signOut();
        clearSession();
        setAuthResolved(true);
        setAuthError(getAuthErrorMessage(error));
        return;
      } finally {
        setIsSubmitting(false);
      }
    }

    if (!env.demoLoginEnabled) {
      setAuthError("O login demo esta desativado neste ambiente.");
      setIsSubmitting(false);
      return;
    }

    if (values.password !== env.demoDefaultPassword) {
      setAuthError("Credenciais invalidas.");
      setIsSubmitting(false);
      return;
    }

    login({ email: values.email });
    setIsSubmitting(false);

    startTransition(() => {
      router.push("/dashboard");
    });
  });

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-4xl border border-white/50 bg-slate-950 px-8 py-10 text-white shadow-[0_30px_90px_-40px_rgba(15,23,42,0.9)]">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">EmagrecePlus</p>
          <h1 className="mt-6 max-w-xl text-4xl font-semibold tracking-tight">
            Operacao clinica, agenda e relacionamento no mesmo workspace.
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">{appTagline}</p>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              ["12", "agendamentos hoje"],
              ["18", "leads em aberto"],
              ["7", "tarefas criticas"],
            ].map(([value, label]) => (
              <div key={label} className="rounded-3xl border border-white/10 bg-white/5 p-4">
                <p className="text-3xl font-semibold text-white">{value}</p>
                <p className="mt-2 text-sm text-slate-300">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <Card className="self-center p-6 md:p-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Acesso</p>
          <h2 className="mt-3 text-2xl font-semibold text-slate-950">Entrar no painel</h2>
          <p className="mt-2 text-sm text-slate-500">
            {env.authMode === "mock"
              ? "Use o login demo configurado para navegar pela estrutura inicial do projeto."
              : "Este ambiente esta usando autenticacao real com Supabase."}
          </p>

          <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="email">
                E-mail
              </label>
              <Input id="email" placeholder="voce@empresa.com" {...register("email")} />
              {errors.email ? <p className="text-xs text-red-600">{errors.email.message}</p> : null}
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-700" htmlFor="password">
                Senha
              </label>
              <Input id="password" placeholder="Sua senha" type="password" {...register("password")} />
              {errors.password ? <p className="text-xs text-red-600">{errors.password.message}</p> : null}
            </div>

            <div className="flex items-center justify-between text-sm">
              <button className="text-slate-500 hover:text-slate-950" type="button">
                Esqueci minha senha
              </button>
              {authError ? <span className="text-red-600">{authError}</span> : null}
            </div>

            <Button className="mt-2 w-full justify-center" type="submit">
              {isPending || isSubmitting ? "Entrando..." : "Entrar"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function getAuthErrorMessage(error: unknown) {
  if (error instanceof HttpError) {
    const payload = error.payload;

    if (payload && typeof payload === "object" && "message" in payload) {
      const { message } = payload as { message?: unknown };

      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Nao foi possivel autenticar com o Supabase.";
}
