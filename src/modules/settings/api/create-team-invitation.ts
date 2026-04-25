import { http } from "@/lib/http";
import type { SettingsPendingInvitation } from "@/types/api";

export type CreateTeamInvitationInput = {
  email: string;
  roleCode: string;
  unitIds: string[];
  expiresInDays?: number;
  note?: string;
};

export async function createTeamInvitation(input: CreateTeamInvitationInput) {
  return http<SettingsPendingInvitation>("/settings/invitations", {
    method: "POST",
    body: input,
  });
}
