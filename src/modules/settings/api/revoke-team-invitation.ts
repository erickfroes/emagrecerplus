import { http } from "@/lib/http";

export async function revokeTeamInvitation(invitationId: string) {
  return http<{ id: string; email: string; status: string }>(`/settings/invitations/${invitationId}`, {
    method: "DELETE",
  });
}
