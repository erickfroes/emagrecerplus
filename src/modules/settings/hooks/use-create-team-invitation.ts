"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTeamInvitation,
  type CreateTeamInvitationInput,
} from "../api/create-team-invitation";

export function useCreateTeamInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateTeamInvitationInput) => createTeamInvitation(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-access"] });
    },
  });
}
