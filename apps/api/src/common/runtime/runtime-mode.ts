type RuntimeSyncMode = "auto" | "enabled" | "disabled";

function normalizeMode(value: string | undefined) {
  return value?.trim().toLowerCase();
}

export function getApiAuthMode() {
  return normalizeMode(process.env.API_AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE) ?? "mock";
}

export function isApiRealAuthEnabled() {
  return getApiAuthMode() === "real";
}

export function getRuntimeSyncMode(): RuntimeSyncMode {
  const value = normalizeMode(process.env.API_RUNTIME_SYNC_MODE ?? process.env.RUNTIME_SYNC_MODE);

  switch (value) {
    case "enabled":
    case "on":
    case "true":
    case "1":
      return "enabled";
    case "disabled":
    case "off":
    case "false":
    case "0":
      return "disabled";
    default:
      return "auto";
  }
}

export function isRuntimeSyncEnabled() {
  const mode = getRuntimeSyncMode();

  if (mode === "enabled") {
    return true;
  }

  if (mode === "disabled") {
    return false;
  }

  return isApiRealAuthEnabled();
}
