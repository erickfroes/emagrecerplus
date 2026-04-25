import "dotenv/config";

import { spawnSync } from "node:child_process";
import process from "node:process";

type CliOptions = {
  withLegacyBridge: boolean;
  skipLegacySeed: boolean;
  skipLevel2: boolean;
  skipRuntimeBackfill: boolean;
  skipDirectRuntime: boolean;
  dryRun: boolean;
  tenantId: string | null;
  batchSize: number | null;
};

function printHelp() {
  console.log(`
Uso:
  npx tsx scripts/seed-runtime-homologation.ts [opcoes]

Comportamento padrao:
  Executa apenas o seed direto no runtime Supabase.
  Use --with-legacy-bridge para incluir a trilha transicional baseada em Prisma.

Opcoes:
  --with-legacy-bridge      Inclui seed legado + backfill transicional antes do seed direto
  --skip-legacy-seed        Pula prisma/seed.ts
  --skip-level-2            Pula prisma/seed-level-2.ts
  --skip-runtime-backfill   Pula scripts/backfill-runtime-foundation.ts
  --skip-direct-runtime     Pula scripts/seed-runtime-direct-fixtures.ts
  --dry-run                 Executa o backfill em modo dry-run
  --tenant <id>             Restringe o backfill a um tenant legado
  --batch-size <n>          Define batch size do backfill runtime
  --help                    Mostra esta ajuda
`);
}

function parseCliOptions(): CliOptions {
  const args = process.argv.slice(2);
  let withLegacyBridge = false;
  let skipLegacySeed = true;
  let skipLevel2 = true;
  let skipRuntimeBackfill = true;
  let skipDirectRuntime = false;
  let dryRun = false;
  let tenantId: string | null = null;
  let batchSize: number | null = null;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--help") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--with-legacy-bridge") {
      withLegacyBridge = true;
      skipLegacySeed = false;
      skipLevel2 = false;
      skipRuntimeBackfill = false;
      continue;
    }

    if (arg === "--skip-legacy-seed") {
      skipLegacySeed = true;
      continue;
    }

    if (arg === "--skip-level-2") {
      skipLevel2 = true;
      continue;
    }

    if (arg === "--skip-runtime-backfill") {
      skipRuntimeBackfill = true;
      continue;
    }

    if (arg === "--skip-direct-runtime") {
      skipDirectRuntime = true;
      continue;
    }

    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }

    if (arg.startsWith("--tenant=")) {
      tenantId = arg.slice("--tenant=".length).trim() || null;
      continue;
    }

    if (arg === "--tenant") {
      tenantId = (args[index + 1] ?? "").trim() || null;
      index += 1;
      continue;
    }

    if (arg.startsWith("--batch-size=")) {
      const value = Number(arg.slice("--batch-size=".length));
      batchSize = Number.isFinite(value) && value > 0 ? value : null;
      continue;
    }

    if (arg === "--batch-size") {
      const value = Number(args[index + 1] ?? "");
      batchSize = Number.isFinite(value) && value > 0 ? value : null;
      index += 1;
    }
  }

  return {
    withLegacyBridge,
    skipLegacySeed,
    skipLevel2,
    skipRuntimeBackfill,
    skipDirectRuntime,
    dryRun,
    tenantId,
    batchSize,
  };
}

function assertRequiredEnv() {
  const required = [
    "DATABASE_URL",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(", ")}`);
  }
}

function resolveCommand(command: string) {
  if (process.platform !== "win32") {
    return command;
  }

  if (command === "npm" || command === "npx") {
    return `${command}.cmd`;
  }

  return command;
}

function quoteWindowsArg(value: string) {
  if (value.length === 0) {
    return '""';
  }

  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

function runStep(label: string, command: string, args: string[]) {
  console.log(`[runtime:seed] ${label}`);

  const result =
    process.platform === "win32"
      ? spawnSync(
          "cmd.exe",
          ["/d", "/s", "/c", [resolveCommand(command), ...args].map(quoteWindowsArg).join(" ")],
          {
            stdio: "inherit",
            env: process.env,
          }
        )
      : spawnSync(resolveCommand(command), args, {
          stdio: "inherit",
          env: process.env,
        });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`Falha em ${label}.`);
  }
}

function buildRuntimeBackfillArgs(options: CliOptions) {
  const args = ["tsx", "scripts/backfill-runtime-foundation.ts"];

  if (options.dryRun) {
    args.push("--dry-run");
  }

  if (options.tenantId) {
    args.push("--tenant", options.tenantId);
  }

  if (options.batchSize) {
    args.push("--batch-size", String(options.batchSize));
  }

  return args;
}

async function main() {
  const options = parseCliOptions();

  assertRequiredEnv();

  console.log("[runtime:seed] preparando trilha de seed homologacao -> runtime Supabase");

  if (!options.skipLegacySeed) {
    runStep("seed legado foundation", "npm", ["run", "prisma:seed"]);
  }

  if (!options.skipLevel2) {
    runStep("seed legado fixture level 2", "npm", ["run", "prisma:seed:level2"]);
  }

  if (!options.skipRuntimeBackfill) {
    runStep("backfill runtime Supabase", "npx", buildRuntimeBackfillArgs(options));
  }

  if (!options.skipDirectRuntime) {
    runStep("seed direto runtime Supabase", "npm", ["run", "runtime:seed:direct"]);
  }

  console.log("[runtime:seed] fluxo concluido");
}

main().catch((error) => {
  console.error("[runtime:seed] erro:", error instanceof Error ? error.message : error);
  process.exit(1);
});
