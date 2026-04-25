import { spawn } from "node:child_process";
import net from "node:net";

const isWindows = process.platform === "win32";
const managedPorts = [3000, 3001];
const processes = [];

let shuttingDown = false;

const occupiedPorts = await findOccupiedPorts(managedPorts);

if (occupiedPorts.length > 0) {
  shuttingDown = true;
  await stopAll();

  console.error(
    [
      "As portas abaixo ja estao em uso antes do boot:",
      ...occupiedPorts.map(
        ({ port }) => `- ${port} (frontend 3000 / api 3001)`
      ),
      "Se for resto de execucao anterior deste projeto, rode `npm run dev:stop` e tente novamente.",
    ].join("\n")
  );

  process.exit(1);
}

processes.push(startScript("web:dev"), startScript("api:dev"));

for (const child of processes) {
  child.on("exit", async (code) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stopAll(child.pid);
    process.exitCode = code ?? 0;
  });
}

for (const eventName of ["SIGINT", "SIGTERM"]) {
  process.on(eventName, async () => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    await stopAll();
  });
}

function startScript(scriptName) {
  if (isWindows) {
    return spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", `npm run ${scriptName}`],
      {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
      }
    );
  }

  return spawn("npm", ["run", scriptName], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
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

function isPortListening(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });

    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });

    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function findOccupiedPorts(ports) {
  const checks = await Promise.all(
    ports.map(async (port) => ({
      port,
      occupied: await isPortListening(port),
    }))
  );

  return checks.filter((entry) => entry.occupied);
}
