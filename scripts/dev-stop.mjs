import { spawnSync } from "node:child_process";

const isWindows = process.platform === "win32";
const ports = [3000, 3001];

if (!isWindows) {
  console.log("`npm run dev:stop` hoje esta preparado para Windows.");
  process.exit(0);
}

const pids = new Set();

for (const port of ports) {
  const result = spawnSync("powershell", [
    "-NoProfile",
    "-Command",
    `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
  ], {
    encoding: "utf8",
  });

  const values = (result.stdout ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  for (const value of values) {
    pids.add(value);
  }
}

if (pids.size === 0) {
  console.log("Nenhum listener ativo encontrado nas portas 3000 ou 3001.");
  process.exit(0);
}

for (const pid of pids) {
  spawnSync("taskkill", ["/PID", pid, "/T", "/F"], {
    stdio: "ignore",
  });
}

await waitForPortsToClose(ports);

console.log(
  `Encerrados os listeners de desenvolvimento nas portas ${ports.join(", ")}.`
);

async function waitForPortsToClose(targetPorts) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const remaining = targetPorts.filter(isPortStillListening);

    if (remaining.length === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

function isPortStillListening(port) {
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
    ],
    {
      encoding: "utf8",
    }
  );

  return (result.stdout ?? "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean).length > 0;
}
