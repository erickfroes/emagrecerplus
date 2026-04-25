"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { revokeTeamInvitation } from "../api/revoke-team-invitation";

export function useRevokeTeamInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (invitationId: string) => revokeTeamInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-access"] });
    },
  });
}
