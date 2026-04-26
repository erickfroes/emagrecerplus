"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { markNotificationRead } from "../api/mark-notification-read";

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: markNotificationRead,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["notifications", currentUnitId],
      });
    },
  });
}
