import { http } from "@/lib/http";

export type MarkNotificationReadResponse = {
  id: string;
  deliveryId?: string | null;
  status?: string;
  deliveryStatus: string;
  readAt?: string | null;
};

export async function markNotificationRead(notificationId: string) {
  return http<MarkNotificationReadResponse>(
    `/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    },
  );
}
