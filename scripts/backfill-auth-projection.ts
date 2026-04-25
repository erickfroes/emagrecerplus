import "dotenv/config";

import assert from "node:assert/strict";

import { ForbiddenException } from "@nestjs/common";

import {
  AuthService,
  type AuthProjectionSyncResult,
} from "../apps/api/src/modules/auth/auth.service";
import { PrismaService } from "../apps/api/src/prisma/prisma.service";
import { supabaseAdmin } from "../apps/api/src/lib/supabase-admin";

type CliOptions = {
  dryRun: boolean;
  limit: number | null;
};

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      limit = Number(arg.slice("--limit=".length));
      continue;
    }

    if (arg === "--limit") {
      limit = Number(args[index + 1] ?? "");
      index += 1;
    }
  }

  if (limit !== null) {
    assert(Number.isFinite(limit) && limit > 0, "O valor de --limit precisa ser um inteiro positivo.");
  }

  return {
    dryRun,
    limit,
  };
}

async function listSupabaseUsers(limit: number | null) {
  const users = [];
  let page = 1;

  while (true) {
    const perPage = limit ? Math.min(200, Math.max(limit - users.length, 1)) : 200;
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Falha ao listar usuarios do Supabase: ${error.message}`);
    }

    const pageUsers = data.users ?? [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage || (limit !== null && users.length >= limit)) {
      break;
    }

    page += 1;
  }

  return limit !== null ? users.slice(0, limit) : users;
}

function logProjectionResult(prefix: string, result: AuthProjectionSyncResult) {
  console.log(
    `${prefix} ${result.email} -> legacyUser=${result.legacyUserId} tenant=${result.legacyTenantId} unidades=${result.runtimeUnitCount} role=${result.role}`
  );
}

async function main() {
  const options = parseCliOptions();

  assert(process.env.DATABASE_URL, "DATABASE_URL ausente.");
  assert(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY ausente."
  );
  assert(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    "SUPABASE_URL ausente."
  );

  const prisma = new PrismaService();
  const authService = new AuthService(prisma);

  await prisma.onModuleInit();

  try {
    const users = await listSupabaseUsers(options.limit);
    let matched = 0;
    let synced = 0;
    let skipped = 0;

    console.log(
      `[auth:backfill] usuarios Supabase encontrados: ${users.length}${options.dryRun ? " (dry-run)" : ""}`
    );

    for (const user of users) {
      const normalizedEmail = user.email?.trim().toLowerCase();

      if (!normalizedEmail) {
        skipped += 1;
        console.log(`[skip] ${user.id} sem e-mail.`);
        continue;
      }

      if (options.dryRun) {
        const legacyUser = await prisma.user.findFirst({
          where: {
            OR: [{ externalAuthId: user.id }, { email: normalizedEmail }],
            deletedAt: null,
          },
          select: {
            id: true,
            tenantId: true,
          },
        });

        if (!legacyUser) {
          skipped += 1;
          console.log(`[skip] ${normalizedEmail} sem correspondencia no legado.`);
          continue;
        }

        matched += 1;
        console.log(
          `[match] ${normalizedEmail} -> legacyUser=${legacyUser.id} tenant=${legacyUser.tenantId}`
        );
        continue;
      }

      try {
        const result = await authService.syncRuntimeAccessForSupabaseUser(user);
        matched += 1;
        synced += 1;
        logProjectionResult("[synced]", result);
      } catch (error) {
        if (error instanceof ForbiddenException) {
          skipped += 1;
          console.log(`[skip] ${normalizedEmail} ${error.message}`);
          continue;
        }

        throw error;
      }
    }

    console.log("");
    console.log("[auth:backfill] resumo");
    console.log(`[auth:backfill] matched=${matched}`);
    console.log(`[auth:backfill] synced=${options.dryRun ? 0 : synced}`);
    console.log(`[auth:backfill] skipped=${skipped}`);
  } finally {
    await prisma.onModuleDestroy();
  }
}

main().catch((error) => {
  console.error("[auth:backfill] erro fatal");
  console.error(error);
  process.exitCode = 1;
});
