import { env } from "@/lib/env";
import { http } from "@/lib/http";
import { useAuthStore } from "@/state/auth-store";
import type { SettingsAccessOverview } from "@/types/api";
import { buildMockSettingsAccessOverview } from "./mock-settings-access-overview";

export async function getSettingsAccessOverview() {
  if (env.authMode !== "real") {
    return buildMockSettingsAccessOverview(useAuthStore.getState().session);
  }

  return http<SettingsAccessOverview>("/settings/access");
}
