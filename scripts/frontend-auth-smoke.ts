import "dotenv/config";

import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaPg } from "@prisma/adapter-pg";
import { createBrowserClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

import { PrismaClient } from "../generated/prisma/client/client";
import { UserStatus } from "../generated/prisma/client/enums";
import { assertDatabaseAvailable } from "./smoke-utils";

const defaultFrontendPort = Number(process.env.FRONTEND_AUTH_SMOKE_PORT ?? 3500);
const defaultApiPort = Number(process.env.FRONTEND_AUTH_SMOKE_API_PORT ?? 3501);

const databaseUrl = process.env.DATABASE_URL ?? "";
assert(databaseUrl, "DATABASE_URL ausente.");

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
  log: ["error"],
});

type CleanupState = {
  localUserId?: string;
  supabaseUserId?: string;
  invitedSupabaseUserId?: string;
};

const cleanupState: CleanupState = {};

function logStep(message: string) {
  console.log(`\n[frontend-auth:smoke] ${message}`);
}

function startProcess(command: string, args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  const isWindows = process.platform === "win32";
  const child = isWindows
    ? spawn("cmd.exe", ["/d", "/s", "/c", command, ...args], {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      })
    : spawn(command, args, {
        cwd: process.cwd(),
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

  child.stdout?.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });

  child.stderr?.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });

  return child;
}

async function stopProcessTree(child?: ChildProcess) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
        cwd: process.cwd(),
        stdio: "ignore",
      });

      killer.once("exit", () => resolve());
      killer.once("error", () => resolve());
    });

    return;
  }

  child.kill("SIGTERM");
}

async function waitForUrl(url: string, expectedStatuses: number[] = [200]) {
  for (let attempt = 1; attempt <= 40; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "manual",
      });

      if (expectedStatuses.includes(response.status)) {
        return response;
      }
    } catch {
      // Aguarda o processo responder.
    }

    await delay(500);
  }

  throw new Error(`Timeout aguardando ${url}`);
}

async function findAvailablePort(preferredPort: number, blockedPorts: number[] = []) {
  for (let port = preferredPort; port < preferredPort + 20; port += 1) {
    if (blockedPorts.includes(port)) {
      continue;
    }

    const isAvailable = await new Promise<boolean>((resolve) => {
      const server = createServer();

      server.once("error", () => {
        resolve(false);
      });

      server.listen(port, "127.0.0.1", () => {
        server.close(() => resolve(true));
      });
    });

    if (isAvailable) {
      return port;
    }
  }

  throw new Error(`Nenhuma porta livre encontrada a partir de ${preferredPort}.`);
}

function cookieHeader(cookies: Map<string, string>) {
  return Array.from(cookies.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

function applySetCookies(cookies: Map<string, string>, response: Response) {
  const setCookieHeaders =
    "getSetCookie" in response.headers && typeof response.headers.getSetCookie === "function"
      ? response.headers.getSetCookie()
      : [];

  for (const setCookie of setCookieHeaders) {
    const [cookiePair] = setCookie.split(";", 1);
    const separatorIndex = cookiePair.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const name = cookiePair.slice(0, separatorIndex);
    const value = cookiePair.slice(separatorIndex + 1);

    if (value) {
      cookies.set(name, value);
      continue;
    }

    cookies.delete(name);
  }
}

function assertRedirectLocation(
  response: Response,
  expectedPath: string,
  message: string,
  baseUrl: string
) {
  const location = response.headers.get("location");
  assert(location, `${message} Location ausente.`);

  const resolvedLocation = new URL(location, baseUrl);
  assert.equal(resolvedLocation.pathname, expectedPath, `${message} Location recebida: ${location}`);
}

async function fetchJson<T = unknown>(url: string, init?: RequestInit, expectedStatus = 200) {
  const response = await fetch(url, init);
  const text = await response.text();

  assert.equal(response.status, expectedStatus, `${init?.method ?? "GET"} ${url} retornou ${response.status}: ${text}`);

  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function cleanup() {
  logStep("Limpando usuarios temporarios");

  if (cleanupState.localUserId) {
    await prisma.user.delete({ where: { id: cleanupState.localUserId } }).catch(() => undefined);
  }

  if (cleanupState.supabaseUserId && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const adminClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    await adminClient.auth.admin.deleteUser(cleanupState.supabaseUserId).catch(() => undefined);
    if (cleanupState.invitedSupabaseUserId) {
      await adminClient.auth.admin.deleteUser(cleanupState.invitedSupabaseUserId).catch(() => undefined);
    }
  }
}

async function main() {
  await assertDatabaseAvailable(databaseUrl);

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  assert(supabaseUrl, "SUPABASE_URL ausente.");
  assert(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY ausente.");
  assert(publishableKey, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ausente.");

  const [tenant, role, unit] = await Promise.all([
    prisma.tenant.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.role.findFirstOrThrow({
      where: { code: "admin" },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
    prisma.unit.findFirstOrThrow({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }),
  ]);

  const frontendPort = await findAvailablePort(defaultFrontendPort);
  const apiPort = await findAvailablePort(defaultApiPort, [frontendPort]);
  const frontendBaseUrl = `http://127.0.0.1:${frontendPort}`;
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;

  logStep(`Subindo API compilada e frontend Next em ${apiPort}/${frontendPort}`);

  const apiProcess = startProcess("node", ["apps/api/dist/apps/api/src/main.js"], {
    ...process.env,
    API_PORT: String(apiPort),
  });

  const frontendProcess = startProcess(
    "npm",
    ["run", "start", "--", "--hostname", "127.0.0.1", "--port", String(frontendPort)],
    {
      ...process.env,
      API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      NEXT_PUBLIC_AUTH_MODE: "real",
    }
  );

  try {
    await waitForUrl(`${apiBaseUrl}/health`);
    await waitForUrl(`${frontendBaseUrl}/login`, [200, 307, 308]);

    logStep("Validando redirect anonimo para /login");

    const anonymousDashboard = await fetch(`${frontendBaseUrl}/dashboard`, {
      redirect: "manual",
    });

    assert.equal(
      anonymousDashboard.status,
      307,
      `GET /dashboard anonimo deveria redirecionar para /login, mas retornou ${anonymousDashboard.status}.`
    );
    assertRedirectLocation(
      anonymousDashboard,
      "/login",
      "GET /dashboard anonimo nao redirecionou para /login.",
      frontendBaseUrl
    );

    logStep("Criando usuario temporario no Supabase sem espelho local");

    const email = `smoke.frontend.auth.${Date.now()}@emagreceplus.local`;
    const password = `TmpFront!${Date.now()}Ab`;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const createUserResult = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    assert(!createUserResult.error, `Falha ao criar usuario Supabase: ${createUserResult.error?.message}`);
    assert(createUserResult.data.user?.id, "Supabase nao retornou o id do usuario criado.");
    cleanupState.supabaseUserId = createUserResult.data.user.id;

    const cookieJar = new Map<string, string>();
    const browserClient = createBrowserClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return Array.from(cookieJar.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          for (const { name, value } of cookiesToSet) {
            if (value) {
              cookieJar.set(name, value);
              continue;
            }

            cookieJar.delete(name);
          }
        },
      },
      isSingleton: false,
    });

    const signInResult = await browserClient.auth.signInWithPassword({
      email,
      password,
    });

    assert(!signInResult.error, `Falha no sign-in do Supabase: ${signInResult.error?.message}`);
    assert(cookieJar.size > 0, "O browser client nao persistiu cookies de sessao do Supabase.");

    logStep("Validando bloqueio quando existe sessao Supabase sem usuario local");

    const supabaseOnlyDashboard = await fetch(`${frontendBaseUrl}/dashboard`, {
      headers: {
        cookie: cookieHeader(cookieJar),
      },
      redirect: "manual",
    });

    assert.equal(
      supabaseOnlyDashboard.status,
      307,
      `GET /dashboard com sessao Supabase sem usuario local deveria redirecionar, mas retornou ${supabaseOnlyDashboard.status}.`
    );
    assertRedirectLocation(
      supabaseOnlyDashboard,
      "/auth/sign-out",
      "GET /dashboard com sessao Supabase sem usuario local nao foi para a rota de sign-out.",
      frontendBaseUrl
    );
    assert.equal(
      new URL(supabaseOnlyDashboard.headers.get("location")!, frontendBaseUrl).searchParams.get("next"),
      "/login",
      "GET /dashboard com sessao Supabase sem usuario local nao preservou next=/login."
    );

    const invalidSessionSignOut = await fetch(
      `${frontendBaseUrl}${supabaseOnlyDashboard.headers.get("location")}`,
      {
        headers: {
          cookie: cookieHeader(cookieJar),
        },
        redirect: "manual",
      }
    );

    assert.equal(invalidSessionSignOut.status, 307, "A rota frontend de sign-out nao redirecionou.");
    assertRedirectLocation(
      invalidSessionSignOut,
      "/login",
      "A rota frontend de sign-out nao retornou para /login.",
      frontendBaseUrl
    );
    applySetCookies(cookieJar, invalidSessionSignOut);

    const clearedDashboard = await fetch(`${frontendBaseUrl}/dashboard`, {
      headers: {
        cookie: cookieHeader(cookieJar),
      },
      redirect: "manual",
    });

    assert.equal(clearedDashboard.status, 307, "GET /dashboard apos limpar cookie deveria redirecionar.");
    assertRedirectLocation(
      clearedDashboard,
      "/login",
      "GET /dashboard apos limpar cookie nao foi para /login.",
      frontendBaseUrl
    );

    const signInAfterClearResult = await browserClient.auth.signInWithPassword({
      email,
      password,
    });

    assert(!signInAfterClearResult.error, `Falha no segundo sign-in do Supabase: ${signInAfterClearResult.error?.message}`);
    assert(cookieJar.size > 0, "Os cookies do Supabase nao foram restaurados depois do novo sign-in.");

    logStep("Criando espelho local do usuario para validar acesso liberado");

    const localUser = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        fullName: "Frontend Auth Smoke User",
        email,
        status: UserStatus.ACTIVE,
        userRoles: {
          create: {
            roleId: role.id,
          },
        },
        unitAccess: {
          create: {
            unitId: unit.id,
            accessLevel: "PRIMARY",
          },
        },
      },
      select: { id: true },
    });

    cleanupState.localUserId = localUser.id;

    const validDashboard = await fetch(`${frontendBaseUrl}/dashboard`, {
      headers: {
        cookie: cookieHeader(cookieJar),
      },
      redirect: "manual",
    });

    assert.equal(validDashboard.status, 200, `GET /dashboard autenticado retornou ${validDashboard.status}.`);

    const validLogin = await fetch(`${frontendBaseUrl}/login`, {
      headers: {
        cookie: cookieHeader(cookieJar),
      },
      redirect: "manual",
    });

    assert.equal(validLogin.status, 307, `GET /login autenticado deveria redirecionar, mas retornou ${validLogin.status}.`);
    assertRedirectLocation(
      validLogin,
      "/dashboard",
      "GET /login autenticado nao redirecionou para /dashboard.",
      frontendBaseUrl
    );

    logStep("Validando aceite de convite com primeiro login do convidado");

    const adminAccessToken = signInAfterClearResult.data.session?.access_token;
    assert(adminAccessToken, "O usuario admin do smoke nao retornou access token apos o segundo sign-in.");

    const settingsAccess = await fetchJson<{
      units: Array<{ id: string }>;
    }>(`${apiBaseUrl}/settings/access`, {
      headers: {
        Authorization: `Bearer ${adminAccessToken}`,
      },
    });

    assert(settingsAccess.units.length > 0, "settings/access nao retornou unidades para emitir convite no smoke.");

    const invitedEmail = `smoke.frontend.invited.${Date.now()}@emagreceplus.local`;
    const invitedPassword = `TmpFrontInvite!${Date.now()}Ab`;

    await fetchJson<{ id: string }>(
      `${apiBaseUrl}/settings/invitations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminAccessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: invitedEmail,
          roleCode: "assistant",
          unitIds: [settingsAccess.units[0].id],
          expiresInDays: 7,
          note: "Frontend auth smoke invitation",
        }),
      },
      201
    );

    const invitedCreateUserResult = await adminClient.auth.admin.createUser({
      email: invitedEmail,
      password: invitedPassword,
      email_confirm: true,
      user_metadata: {
        full_name: "Frontend Invited Smoke User",
      },
    });

    assert(
      !invitedCreateUserResult.error,
      `Falha ao criar usuario convidado do frontend smoke: ${invitedCreateUserResult.error?.message}`
    );
    assert(invitedCreateUserResult.data.user?.id, "Supabase nao retornou o id do convidado do frontend smoke.");
    cleanupState.invitedSupabaseUserId = invitedCreateUserResult.data.user.id;

    const invitedCookieJar = new Map<string, string>();
    const invitedBrowserClient = createBrowserClient(supabaseUrl, publishableKey, {
      cookies: {
        getAll() {
          return Array.from(invitedCookieJar.entries()).map(([name, value]) => ({
            name,
            value,
          }));
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          for (const { name, value } of cookiesToSet) {
            if (value) {
              invitedCookieJar.set(name, value);
              continue;
            }

            invitedCookieJar.delete(name);
          }
        },
      },
      isSingleton: false,
    });

    const invitedSignInResult = await invitedBrowserClient.auth.signInWithPassword({
      email: invitedEmail,
      password: invitedPassword,
    });

    assert(
      !invitedSignInResult.error,
      `Falha no sign-in do usuario convidado do frontend smoke: ${invitedSignInResult.error?.message}`
    );
    assert(invitedCookieJar.size > 0, "Os cookies do usuario convidado nao foram persistidos.");

    const invitedDashboard = await fetch(`${frontendBaseUrl}/dashboard`, {
      headers: {
        cookie: cookieHeader(invitedCookieJar),
      },
      redirect: "manual",
    });

    assert.equal(
      invitedDashboard.status,
      200,
      `GET /dashboard do usuario convidado retornou ${invitedDashboard.status}.`
    );

    const invitedLogin = await fetch(`${frontendBaseUrl}/login`, {
      headers: {
        cookie: cookieHeader(invitedCookieJar),
      },
      redirect: "manual",
    });

    assert.equal(
      invitedLogin.status,
      307,
      `GET /login com usuario convidado autenticado deveria redirecionar, mas retornou ${invitedLogin.status}.`
    );
    assertRedirectLocation(
      invitedLogin,
      "/dashboard",
      "GET /login do usuario convidado nao redirecionou para /dashboard.",
      frontendBaseUrl
    );

    logStep("Smoke de auth do frontend concluido com sucesso");
  } finally {
    await Promise.all([stopProcessTree(apiProcess), stopProcessTree(frontendProcess)]);
    await cleanup();
  }
}

main()
  .catch(async (error) => {
    console.error("\n[frontend-auth:smoke] Falha:", error);
    await cleanup().catch(() => undefined);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
