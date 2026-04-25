import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const isWindows = process.platform === "win32";
const projectRoot = process.cwd();
const typeScriptBin = path.join(projectRoot, "node_modules", "typescript", "bin", "tsc");
const apiEntry = path.join(
  projectRoot,
  "apps",
  "api",
  "dist",
  "apps",
  "api",
  "src",
  "main.js"
);
const processes = [];

let shuttingDown = false;

runInitialBuild();

if (!existsSync(apiEntry)) {
  console.error(`API compilada nao encontrada em ${apiEntry}.`);
  process.exit(1);
}

processes.push(startTypeScriptWatch(), startNodeWatch());

for (const child of processes) {
  child.on("exit", async (code) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stopAll(child.pid);
    process.exit(code ?? 0);
  });
}

for (const eventName of ["SIGINT", "SIGTERM"]) {
  process.on(eventName, async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stopAll();
    process.exit(0);
  });
}

function runInitialBuild() {
  const buildResult = spawnSync(commandForNpm(), argsForNpm(["run", "api:build"]), {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (buildResult.status !== 0) {
    process.exit(buildResult.status ?? 1);
  }
}

function startTypeScriptWatch() {
  return spawn(process.execPath, [typeScriptBin, "-p", "apps/api/tsconfig.json", "--watch", "--preserveWatchOutput"], {
    cwd: projectRoot,
    env: process.env,
    stdio: "inherit",
  });
}

function startNodeWatch() {
  return spawn(
    process.execPath,
    ["--watch-path=apps/api/dist", "--watch-preserve-output", "apps/api/dist/apps/api/src/main.js"],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
    }
  );
}

async function stopAll(skipPid) {
  const stops = processes
    .filter((child) => child.pid && child.pid !== skipPid)
    .map((child) => stopProcessTree(child.pid));

  await Promise.allSettled(stops);
}

function stopProcessTree(pid) {
  if (!pid) {
    return Promise.resolve();
  }

  if (isWindows) {
    return new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
      });

      killer.on("exit", () => resolve());
      killer.on("error", () => resolve());
    });
  }

  return new Promise((resolve) => {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
    resolve();
  });
}

function commandForNpm() {
  return isWindows ? process.env.ComSpec ?? "cmd.exe" : "npm";
}

function argsForNpm(commandParts) {
  if (isWindows) {
    return ["/d", "/s", "/c", `npm ${commandParts.join(" ")}`];
  }

  return commandParts;
}
