import "dotenv/config";

import assert from "node:assert/strict";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

type JsonRecord = Record<string, unknown>;

type FunctionMetadata = {
  signature: string;
  schema: string;
  name: string;
  isSecurityDefiner: boolean;
  config: string[];
};

type RpcResult = {
  status: number;
  body: unknown;
  bodyText: string;
};

type UserFixture = {
  tenantId: string;
  unitId: string | null;
  documentId: string;
};

type TempAuthUser = {
  userId: string;
  email: string;
  password: string;
  token: string;
};

type TestMode = "local" | "real";

const explicitMode =
  process.env.STAGE9_RLS_MODE ||
  process.argv.find((arg) => arg.startsWith("--mode="))?.split("=").pop() ||
  "local";
const testMode: TestMode = explicitMode === "real" ? "real" : "local";
const strictMode = testMode === "real";

if (explicitMode !== "local" && explicitMode !== "real") {
  throw new Error(`Modo invalido: ${explicitMode}. Use --mode=local ou --mode=real`);
}

console.log(`[stage9-rls] Modo do teste: ${testMode}`);

const requiredFunctions = [
  { schema: "api", name: "list_accessible_patient_documents" },
  { schema: "api", name: "prepare_patient_document_access" },
  { schema: "api", name: "record_patient_document_access_event" },
  { schema: "api", name: "get_patient_document_operational_detail" },
  { schema: "api", name: "consolidate_document_legal_evidence" },
  { schema: "api", name: "get_document_legal_evidence_dossier" },
  { schema: "api", name: "prepare_document_legal_evidence_package" },
  { schema: "api", name: "get_document_legal_evidence_package_summary" },
  { schema: "api", name: "record_document_legal_evidence_package_access_event" },
  { schema: "public", name: "list_accessible_patient_documents" },
  { schema: "public", name: "prepare_patient_document_access" },
  { schema: "public", name: "record_patient_document_access_event" },
  { schema: "public", name: "get_patient_document_operational_detail" },
  { schema: "public", name: "consolidate_document_legal_evidence" },
  { schema: "public", name: "get_document_legal_evidence_dossier" },
  { schema: "public", name: "prepare_document_legal_evidence_package" },
  { schema: "public", name: "get_document_legal_evidence_package_summary" },
  { schema: "public", name: "record_document_legal_evidence_package_access_event" },
];

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const databaseUrl = process.env.DATABASE_URL ?? "";
assert(databaseUrl, "DATABASE_URL e obrigatorio para este teste.");
if (strictMode) {
  assert(supabaseUrl, "MODE=real requer SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_URL.");
  assert(serviceRoleKey, "MODE=real requer SUPABASE_SERVICE_ROLE_KEY.");
  assert(anonKey, "MODE=real requer NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (ou var de anon equivalente).");
}

function logStep(message: string) {
  console.log(`\n[rls-test] ${message}`);
}

function requireOrSkip(condition: boolean, message: string) {
  if (condition) {
    return;
  }

  if (strictMode) {
    assert(false, `[real mode] ${message}`);
  }

  console.log(`  [skip] ${message}`);
}

function hasStorageObjectPath(payload: unknown): boolean {
  if (payload === null || payload === undefined) {
    return false;
  }

  if (Array.isArray(payload)) {
    return payload.some((entry) => hasStorageObjectPath(entry));
  }

  if (typeof payload === "object") {
    const record = payload as JsonRecord;
    if (Object.prototype.hasOwnProperty.call(record, "storageObjectPath")) {
      return true;
    }

    return Object.values(record).some((value) => hasStorageObjectPath(value));
  }

  return false;
}

function hasSearchPath(config: string[]) {
  return config.some(
    (entry) => entry.trim().toLowerCase() === "search_path=''" || entry.toLowerCase().includes("search_path=''"),
  );
}

async function runSql<T extends Record<string, unknown> = Record<string, unknown>>(
  pool: pg.Pool,
  query: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query(query, params);
  return result.rows as T[];
}

async function getFunctionMetadata(pool: pg.Pool, schema: string, name: string): Promise<FunctionMetadata[]> {
  return runSql<FunctionMetadata>(
    pool,
    `
      select
        p.oid::regprocedure::text as signature,
        n.nspname as schema,
        p.proname as name,
        p.prosecdef as "isSecurityDefiner",
        coalesce(p.proconfig, array[]::text[]) as config
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1
        and p.proname = $2
      order by p.oid;
    `,
    [schema, name],
  );
}

async function hasRole(pool: pg.Pool, role: string): Promise<boolean> {
  const rows = await runSql<{ exists: boolean }>(
    pool,
    `select exists(select 1 from pg_roles where rolname = $1) as exists`,
    [role],
  );
  return rows[0]?.exists ?? false;
}

async function hasTable(pool: pg.Pool, schema: string, table: string): Promise<boolean> {
  const rows = await runSql<{ exists: boolean }>(
    pool,
    `
      select exists(
        select 1
        from pg_tables
        where schemaname = $1
          and tablename = $2
      ) as exists;
    `,
    [schema, table],
  );
  return rows[0]?.exists ?? false;
}

async function hasFunctionExecute(pool: pg.Pool, functionSignature: string, role: string): Promise<boolean> {
  const rows = await runSql<{ can_execute: boolean }>(
    pool,
    `select has_function_privilege($1::name, $2::regprocedure, 'EXECUTE') as can_execute;`,
    [role, functionSignature],
  );
  return rows[0]?.can_execute ?? false;
}

async function tableRlsEnabled(pool: pg.Pool, schema: string, table: string): Promise<boolean> {
  const rows = await runSql<{ relrowsecurity: boolean }>(
    pool,
    `
      select c.relrowsecurity as relrowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1
        and c.relname = $2
        and c.relkind in ('r', 'p');
    `,
    [schema, table],
  );
  return rows[0]?.relrowsecurity ?? false;
}

async function tableHasColumn(pool: pg.Pool, schema: string, table: string, column: string): Promise<boolean> {
  const rows = await runSql<{ exists: boolean }>(
    pool,
    `
      select exists(
        select 1
        from information_schema.columns
        where table_schema = $1
          and table_name = $2
          and column_name = $3
      ) as exists;
    `,
    [schema, table, column],
  );
  return rows[0]?.exists ?? false;
}

async function policiesWithPrivateAccessGuards(pool: pg.Pool, schema: string, table: string) {
  return runSql<{ polname: string; cmd: string; qual: string | null; with_check: string | null }>(
    pool,
    `
      select
        polname,
        cmd,
        qual,
        with_check
      from pg_policies
      where schemaname = $1
        and tablename = $2
      order by polname;
    `,
    [schema, table],
  );
}

async function assertNoColumnPrivileges(pool: pg.Pool, tableFqdn: string, role: string, privilege: string) {
  const rows = await runSql<{ has_privilege: boolean }>(
    pool,
    `select has_table_privilege($1::name, $2::regclass, $3) as has_privilege`,
    [role, tableFqdn, privilege],
  );
  assert(
    rows[0]?.has_privilege === false,
    `Role ${role} tem privilégio inesperado ${privilege} em ${tableFqdn}.`,
  );
}

async function countRows(pool: pg.Pool, query: string, params: unknown[] = []): Promise<number> {
  const rows = await runSql<{ count: string }>(pool, `select count(*)::text as count ${query}`, params);
  return Number.parseInt(rows[0]?.count ?? "0", 10);
}

async function getEvidenceFixture(pool: pg.Pool): Promise<UserFixture | null> {
  const rows = await runSql<UserFixture>(
    pool,
    `
      select
        de.tenant_id::text as "tenantId",
        de.unit_id::text as "unitId",
        de.patient_document_id::text as "documentId"
      from docs.document_legal_evidence de
      join docs.patient_documents as pd
        on pd.id = de.patient_document_id
      where pd.deleted_at is null
      order by de.updated_at desc
      limit 1;
    `,
  );

  if (rows.length === 0) {
    return null;
  }

  return {
    tenantId: rows[0].tenantId,
    unitId: rows[0].unitId,
    documentId: rows[0].documentId,
  };
}

async function getAlternateTenant(pool: pg.Pool, tenantId: string): Promise<string | null> {
  const rows = await runSql<{ tenantId: string }>(
    pool,
    `
      select id::text as "tenantId"
      from platform.tenants
      where id::text <> $1
      order by created_at
      limit 1;
    `,
    [tenantId],
  );

  return rows[0]?.tenantId ?? null;
}

async function getAlternateUnit(pool: pg.Pool, tenantId: string, unitId: string | null): Promise<string | null> {
  if (!unitId) {
    return null;
  }

  const rows = await runSql<{ unitId: string }>(
    pool,
    `
      select id::text as "unitId"
      from platform.units
      where tenant_id::text = $1
        and id::text <> $2
      limit 1;
    `,
    [tenantId, unitId],
  );

  return rows[0]?.unitId ?? null;
}

async function callRpc(
  baseUrl: string,
  fn: string,
  apiKey: string,
  token: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(fn)}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(args),
  });

  const bodyText = await response.text();
  let body: unknown = null;
  try {
    body = bodyText ? JSON.parse(bodyText) : null;
  } catch {
    body = bodyText;
  }

  return {
    status: response.status,
    body,
    bodyText,
  };
}

async function ensurePostgrestHealth(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: anonKey || serviceRoleKey,
      },
    });
    return response.status < 500;
  } catch {
    return false;
  }
}

async function createNoPermissionsUser(
  supabaseUrl: string,
  serviceRole: string,
  publishableKey: string,
): Promise<TempAuthUser | null> {
  const admin = createClient(supabaseUrl, serviceRole, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const email = `rls-stage9-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.local`;
  const password = `NoPerm-${Date.now()}!`;

  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (created.error || !created.data.user?.id) {
    return null;
  }

  const publicClient = createClient(supabaseUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const signedIn = await publicClient.auth.signInWithPassword({
    email,
    password,
  });

  if (signedIn.error || !signedIn.data.session?.access_token) {
    await admin.auth.admin.deleteUser(created.data.user.id).catch(() => undefined);
    return null;
  }

  return {
    userId: created.data.user.id,
    email,
    password,
    token: signedIn.data.session.access_token,
  };
}

function assertRpcBlocked(result: RpcResult, label: string) {
  assert(result.status !== 200, `${label} deveria ser bloqueado, mas retornou 200.`);
}

async function run() {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 5 });
  const restAvailable =
    !!(supabaseUrl && serviceRoleKey && anonKey) && (await ensurePostgrestHealth(supabaseUrl));

  let tempUser: TempAuthUser | null = null;

  if (strictMode) {
    assert(restAvailable, "Modo real exige Supabase REST acessivel para validar RPCs via HTTP.");
  }

  try {
    logStep("Validando presença e proteção das funcoes SQL usadas pela etapa 9");

    const hasAnonRole = await hasRole(pool, "anon");
    const hasAuthenticatedRole = await hasRole(pool, "authenticated");
    const hasServiceRole = await hasRole(pool, "service_role");

    for (const expected of requiredFunctions) {
      const functions = await getFunctionMetadata(pool, expected.schema, expected.name);
      requireOrSkip(functions.length > 0, `funcao ausente: ${expected.schema}.${expected.name}`);
      if (functions.length === 0) {
        continue;
      }

      for (const fn of functions) {
        if (expected.schema === "public") {
          assert(
            fn.isSecurityDefiner === false,
            `${fn.schema}.${fn.name} em public deve ser SECURITY INVOKER.`,
          );
          assert(hasSearchPath(fn.config), `${fn.schema}.${fn.name} em public deve ter search_path hardening seguro.`);
        } else if (fn.isSecurityDefiner) {
          assert(hasSearchPath(fn.config), `${fn.schema}.${fn.name} em security definer deve ter search_path hardening.`);
        }

        if (hasAnonRole) {
          const canAnonExecute = await hasFunctionExecute(pool, fn.signature, "anon");
          if (expected.schema === "public" || expected.schema === "api") {
            assert(!canAnonExecute, `${fn.schema}.${fn.name} nao deve conceder EXECUTE para anon.`);
          }
        }

        if (hasAuthenticatedRole) {
          const canAuthedExecute = await hasFunctionExecute(pool, fn.signature, "authenticated");
          if (expected.schema === "public" || expected.schema === "api") {
            assert(!canAuthedExecute, `${fn.schema}.${fn.name} nao deve conceder EXECUTE para authenticated.`);
          }
        }

        if (expected.schema === "public" || expected.schema === "api") {
          const canPublicExecute = await hasFunctionExecute(pool, fn.signature, "public");
          assert(!canPublicExecute, `${fn.schema}.${fn.name} nao deve conceder EXECUTE para role public.`);
        }

        if (hasServiceRole) {
          const canServiceExecute = await hasFunctionExecute(pool, fn.signature, "service_role");
          if (expected.schema === "public" || expected.schema === "api") {
            assert(canServiceExecute, `${fn.schema}.${fn.name} precisa permitir EXECUTE para service_role.`);
          }
        } else {
          console.log(`  [skip] role service_role nao encontrada para checar EXECUTE em ${fn.schema}.${fn.name}.`);
        }
      }
    }

    const hasDocsSchema = (
      await runSql<{ exists: boolean }>(
        pool,
        `select exists(select 1 from pg_namespace where nspname = 'docs') as exists;`,
      )
    )[0]?.exists ?? false;

    if (!hasDocsSchema) {
      if (strictMode) {
        assert(false, "Etapa 9 requer schema docs para validacao.");
      }
      console.log("[rls-test] Esquema docs nao existe nesse banco; pulando verificacoes especificas da Etapa 9.");
      return;
    }

    logStep("Validando RLS e politicas em tabelas críticas");

    const checkedTables = [
      { schema: "docs", table: "patient_documents" },
      { schema: "docs", table: "document_legal_evidence" },
      { schema: "docs", table: "document_legal_evidence_packages" },
      { schema: "docs", table: "document_legal_evidence_package_events" },
      { schema: "docs", table: "document_access_events" },
    ];

    for (const target of checkedTables) {
      if (!(await hasTable(pool, target.schema, target.table))) {
        if (strictMode) {
          assert(false, `Tabela ${target.schema}.${target.table} nao existe, mas e obrigatoria no modo real.`);
        }
        console.log(`  [skip] ${target.schema}.${target.table} nao existe no ambiente atual.`);
        continue;
      }
      assert(await tableRlsEnabled(pool, target.schema, target.table), `RLS deve estar ligada em ${target.schema}.${target.table}.`);

      if (hasAnonRole) {
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "anon", "SELECT");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "anon", "INSERT");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "anon", "UPDATE");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "anon", "DELETE");
      }

      if (hasAuthenticatedRole) {
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "authenticated", "SELECT");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "authenticated", "INSERT");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "authenticated", "UPDATE");
        await assertNoColumnPrivileges(pool, `${target.schema}.${target.table}`, "authenticated", "DELETE");
      }

      const policies = await policiesWithPrivateAccessGuards(pool, target.schema, target.table);
      if (policies.length > 0) {
        const hasAccessGuard = policies.some((policy) => {
          const qual = (policy.qual || "").toLowerCase();
          const withCheck = (policy.with_check || "").toLowerCase();
          return (
            qual.includes("can_access_patient") ||
            qual.includes("can_read_clinical_domain") ||
            withCheck.includes("can_access_patient") ||
            withCheck.includes("can_manage_clinical_domain")
          );
        });
        assert(
          hasAccessGuard,
          `politicas de ${target.schema}.${target.table} devem conter guardas de tenant/paciente.`,
        );
      } else {
        if (strictMode) {
          assert(false, `tabela ${target.schema}.${target.table} sem policy de controle de acesso visivel.`);
        }
        console.log(`  [skip] sem policy visivel em ${target.schema}.${target.table}.`);
      }
    }

    if (restAvailable) {
      logStep("Validando bloqueios HTTP para anon e sem permissao");

      tempUser = await createNoPermissionsUser(supabaseUrl, serviceRoleKey, anonKey);
      const serviceToken = serviceRoleKey;
      const publicWrappers = requiredFunctions.filter((item) => item.schema === "public").map((item) => item.name);

      for (const fn of publicWrappers) {
        const noAuthResult = await callRpc(supabaseUrl, fn, anonKey || serviceRoleKey, "", {});
        assertRpcBlocked(noAuthResult, `POST ${fn} sem autorizacao`);
      }

      if (tempUser) {
        for (const fn of publicWrappers) {
          const unauthorizedResult = await callRpc(supabaseUrl, fn, anonKey || serviceRoleKey, tempUser.token, {});
          assertRpcBlocked(unauthorizedResult, `POST ${fn} com usuario sem permissao`);
        }
      } else {
        console.log("  [skip] usuario sem permissao nao foi criado no auth.");
      }

      const fixture = await getEvidenceFixture(pool);
      if (fixture) {
        const dossierPayload = {
          p_legacy_tenant_id: fixture.tenantId,
          p_document_id: fixture.documentId,
          p_legacy_unit_id: fixture.unitId,
          p_access_event_limit: 5,
          p_legacy_actor_user_id: null,
          p_reconsolidate: false,
          p_audit_access: false,
        };

        const dossier = await callRpc(supabaseUrl, "get_document_legal_evidence_dossier", anonKey || serviceRoleKey, serviceToken, dossierPayload);
        assert(dossier.status === 200, "dossiê juridico deve retornar 200 no contexto autorizado.");
        assert(!hasStorageObjectPath(dossier.body), "dossiê nao deve expor storageObjectPath.");

        const alternateTenant = await getAlternateTenant(pool, fixture.tenantId);
        if (alternateTenant) {
          const crossTenant = await callRpc(supabaseUrl, "get_document_legal_evidence_dossier", anonKey || serviceRoleKey, serviceToken, {
            ...dossierPayload,
            p_legacy_tenant_id: alternateTenant,
          });
          assertRpcBlocked(crossTenant, "dossiê cruzando tenant");
        }

        const alternateUnit = await getAlternateUnit(pool, fixture.tenantId, fixture.unitId);
        if (alternateUnit) {
          const crossUnit = await callRpc(supabaseUrl, "get_document_legal_evidence_dossier", anonKey || serviceRoleKey, serviceToken, {
            ...dossierPayload,
            p_legacy_unit_id: alternateUnit,
          });
          assertRpcBlocked(crossUnit, "dossiê com unidade fora de escopo");
        }

        const packageSummary = await callRpc(supabaseUrl, "get_document_legal_evidence_package_summary", anonKey || serviceRoleKey, serviceToken, {
          p_legacy_tenant_id: fixture.tenantId,
          p_document_id: fixture.documentId,
          p_legacy_unit_id: fixture.unitId,
          p_event_limit: 10,
        });
        assert(packageSummary.status === 200, "resumo de pacote deve retornar 200.");
        assert(!hasStorageObjectPath(packageSummary.body), "resumo de pacote nao deve expor storageObjectPath.");

        if (alternateTenant) {
          const crossTenantPackage = await callRpc(
            supabaseUrl,
            "get_document_legal_evidence_package_summary",
            anonKey || serviceRoleKey,
            serviceToken,
            {
              p_legacy_tenant_id: alternateTenant,
              p_document_id: fixture.documentId,
              p_legacy_unit_id: fixture.unitId,
              p_event_limit: 10,
            },
          );
          assertRpcBlocked(crossTenantPackage, "resumo de pacote com tenant errado");
        }

        if (alternateUnit) {
          const crossUnitPackage = await callRpc(
            supabaseUrl,
            "get_document_legal_evidence_package_summary",
            anonKey || serviceRoleKey,
            serviceToken,
            {
              p_legacy_tenant_id: fixture.tenantId,
              p_document_id: fixture.documentId,
              p_legacy_unit_id: alternateUnit,
              p_event_limit: 10,
            },
          );
          assertRpcBlocked(crossUnitPackage, "resumo de pacote com unidade fora de escopo");
        }

        const consolidate = await callRpc(supabaseUrl, "consolidate_document_legal_evidence", anonKey || serviceRoleKey, serviceToken, {
          p_legacy_tenant_id: fixture.tenantId,
          p_document_id: fixture.documentId,
          p_legacy_unit_id: fixture.unitId,
          p_signature_request_id: null,
        });
        assert([200, 400].includes(consolidate.status), "consolidação deve responder no fluxo autorizado.");

        const prepare = await callRpc(supabaseUrl, "prepare_document_legal_evidence_package", anonKey || serviceRoleKey, serviceToken, {
          p_legacy_tenant_id: fixture.tenantId,
          p_document_id: fixture.documentId,
          p_legacy_unit_id: fixture.unitId,
          p_legacy_actor_user_id: null,
          p_metadata: { source: "stage-9-rls-test" },
        });

        if (prepare.status === 200) {
          const preparePayload = prepare.body as JsonRecord;
          const packageId = typeof preparePayload.id === "string" ? preparePayload.id : null;
          assert(packageId, "prepare_document_legal_evidence_package deve retornar packageId.");

          const beforeCount = await countRows(
            pool,
            `from docs.document_legal_evidence_package_events where document_legal_evidence_package_id = $1::uuid`,
            [packageId],
          );

          const granted = await callRpc(
            supabaseUrl,
            "record_document_legal_evidence_package_access_event",
            anonKey || serviceRoleKey,
            serviceToken,
            {
              p_legacy_tenant_id: fixture.tenantId,
              p_document_id: fixture.documentId,
              p_package_id: packageId,
              p_access_status: "granted",
              p_legacy_unit_id: fixture.unitId,
              p_signed_url_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              p_legacy_actor_user_id: null,
              p_request_metadata: { source: "stage-9-rls-test" },
            },
          );
          assert(granted.status === 200, "registro de acesso autorizado deve retornar 200.");

          const afterCount = await countRows(
            pool,
            `from docs.document_legal_evidence_package_events where document_legal_evidence_package_id = $1::uuid`,
            [packageId],
          );
          assert(afterCount > beforeCount, "evento autorizado deve registrar auditoria de pacote.");

          if (tempUser) {
            const denied = await callRpc(
              supabaseUrl,
              "record_document_legal_evidence_package_access_event",
              anonKey || serviceRoleKey,
              tempUser.token,
              {
                p_legacy_tenant_id: fixture.tenantId,
                p_document_id: fixture.documentId,
                p_package_id: packageId,
                p_access_status: "granted",
                p_legacy_unit_id: fixture.unitId,
                p_signed_url_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
                p_legacy_actor_user_id: null,
                p_request_metadata: { source: "stage-9-rls-test-denied" },
              },
            );
            assertRpcBlocked(denied, "registro por usuário sem permissão");

            const afterDeniedCount = await countRows(
              pool,
              `from docs.document_legal_evidence_package_events where document_legal_evidence_package_id = $1::uuid`,
              [packageId],
            );
            assert(afterDeniedCount === afterCount, "Acesso nao autorizado não pode registrar evento novo.");
          }
        } else {
          console.log(`  [skip] prepare_document_legal_evidence_package retornou ${prepare.status}.`);
        }
      } else {
        console.log("  [skip] sem fixture documental para validar dossiê/pacote.");
      }

      const operationalFixture = await runSql<UserFixture>(
        pool,
        `
          select
            pd.tenant_id::text as "tenantId",
            pd.unit_id::text as "unitId",
            pd.id::text as "documentId"
          from docs.patient_documents as pd
          where pd.deleted_at is null
          order by pd.updated_at desc
          limit 1;
        `,
      );

      if (operationalFixture.length > 0) {
        const op = operationalFixture[0];
        const detail = await callRpc(supabaseUrl, "get_patient_document_operational_detail", anonKey || serviceRoleKey, serviceToken, {
          p_patient_document_id: op.documentId,
          p_legacy_tenant_id: op.tenantId,
        });
        assert(detail.status === 200, "detalhe operacional do documento deve retornar 200.");
        assert(!hasStorageObjectPath(detail.body), "detalhe operacional nao deve expor storageObjectPath.");

        const alternateOpTenant = await getAlternateTenant(pool, op.tenantId);
        if (alternateOpTenant) {
          const crossTenantDetail = await callRpc(
            supabaseUrl,
            "get_patient_document_operational_detail",
            anonKey || serviceRoleKey,
            serviceToken,
            {
              p_patient_document_id: op.documentId,
              p_legacy_tenant_id: alternateOpTenant,
            },
          );
          assertRpcBlocked(crossTenantDetail, "detalhe operacional com tenant errado");
        }
      } else {
        console.log("  [skip] sem documento para validar detalhe operacional.");
      }
    } else {
      console.log("[rls-test] Supabase REST nao esta configurado; pulando validacao de RPC por HTTP.");
    }

    logStep("Validando cobertura D4Sign-ready sem chamada externa");

    const hasProviderMode = await tableHasColumn(pool, "docs", "document_legal_evidence", "provider_mode");
    if (hasProviderMode) {
      const rows = await runSql<{ total: string }>(
        pool,
        `
          select count(*)::text as total
          from docs.document_legal_evidence
          where coalesce(provider_code, '') = 'd4sign'
            and provider_mode in ('unconfigured', 'simulated')
            and verification_status = 'verified';
        `,
      );
      const invalid = Number.parseInt(rows[0]?.total ?? "0", 10);
      assert(
        invalid === 0,
        "D4Sign unconfigured/simulated nao pode produzir verification_status='verified' sem validacao real.",
      );
    } else {
      if (strictMode) {
        assert(false, "coluna provider_mode em docs.document_legal_evidence e obrigatoria no modo real.");
      }
      console.log("  [skip] colunas de provider_mode ainda nao existem.");
    }

    const hasSignatureEvents = await hasTable(pool, "docs", "signature_events");
    if (!hasSignatureEvents) {
      if (strictMode) {
        assert(false, "modo real exige docs.signature_events.");
      }
      console.log("  [skip] tabela docs.signature_events nao existe no ambiente atual.");
      return;
    }
    const hasProviderEventHash = await tableHasColumn(pool, "docs", "signature_events", "provider_event_hash");
    const hasRawEventHash = await tableHasColumn(pool, "docs", "signature_events", "raw_event_hash");
    const hasPayloadHash = await tableHasColumn(pool, "docs", "signature_events", "provider_payload_hash");
    assert(
      hasProviderEventHash && hasRawEventHash && hasPayloadHash,
      "signature_events precisa de hashes para rastreabilidade e integridade.",
    );

    const idempotencyIndexes = await runSql<{ is_unique: boolean; cols: string[] }>(
      pool,
      `
        select
          ix.indisunique as is_unique,
          array_agg(col.attname order by cols.ord) as cols
        from pg_index ix
        join pg_class c on c.oid = ix.indrelid
        join pg_class idx on idx.oid = ix.indexrelid
        join pg_namespace ns on ns.oid = c.relnamespace
        join unnest(ix.indkey) with ordinality as cols(attnum, ord) on true
        left join pg_attribute col on col.attrelid = c.oid and col.attnum = cols.attnum
        where ns.nspname = 'docs'
          and c.relname = 'signature_events'
          and ix.indisvalid
        group by idx.relname, ix.indisunique;
      `,
    );

    const hasWebhookDedupIndex = idempotencyIndexes.some((index) => {
      if (!index.is_unique) {
        return false;
      }
      const cols = (index.cols || []).map((column) => (column || "").toLowerCase());
      return cols.includes("external_event_id") || cols.includes("provider_event_id") || cols.includes("event_id") || cols.includes("idempotency_key");
    });
    assert(hasWebhookDedupIndex, "assinaturas: espera-se índice único para deduplicação de eventos/webhook.");

    const namedD4SignFunctions = await runSql<{ name: string }>(
      pool,
      `
        select p.proname as name
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('private', 'public', 'api')
          and lower(p.proname) like '%d4sign%';
      `,
    );
    const hasD4SignHmacOrWebhook = namedD4SignFunctions.some(
      (entry) => entry.name.toLowerCase().includes("hmac") || entry.name.toLowerCase().includes("webhook"),
    );
    assert(
      hasD4SignHmacOrWebhook,
      "Esperado existir função relacionada a webhook/HMAC para D4Sign no banco.",
    );

    logStep("Checagens concluídas.");
  } finally {
    if (tempUser && supabaseUrl && serviceRoleKey) {
      const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      });
      await admin.auth.admin.deleteUser(tempUser.userId).catch(() => undefined);
    }

    await pool.end().catch(() => undefined);
  }
}

run()
  .then(() => {
    console.log("\n[rls-test] Concluido com sucesso.");
  })
  .catch((error: unknown) => {
    console.error("\n[rls-test] Falha:", error);
    process.exitCode = 1;
  });



