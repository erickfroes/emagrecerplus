"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import {
  getNotifications,
  type NotificationsParams,
} from "../api/get-notifications";

export const notificationsQueryKey = (
  currentUnitId: string | null,
  params: NotificationsParams,
) => [
  "notifications",
  currentUnitId,
  params.includeRead ? "with-read" : "unread",
  params.limit ?? "",
  params.offset ?? "",
];

export function useNotifications(params: NotificationsParams = {}) {
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useQuery({
    queryKey: notificationsQueryKey(currentUnitId, params),
    queryFn: () => getNotifications(params),
  });
}
