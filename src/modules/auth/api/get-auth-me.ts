import { http } from "@/lib/http";
import type { AuthSession } from "@/types/auth";

export function getAuthMe(token: string) {
  return http<AuthSession>("/auth/me", {
    token,
  });
}