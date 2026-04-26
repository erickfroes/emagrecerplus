import { http } from "@/lib/http";

export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationListItem = {
  id: string;
  deliveryId?: string | null;
  unitId?: string | null;
  patientId?: string | null;
  sourceDomain: string;
  sourceEntityType: string;
  sourceEntityId: string;
  eventType: string;
  title: string;
  body: string;
  severity: NotificationSeverity;
  status: string;
  channel?: string | null;
  deliveryStatus?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  readAt?: string | null;
  createdAt: string | null;
};

export type NotificationsListResponse = {
  items: NotificationListItem[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
};

export type NotificationsParams = {
  includeRead?: boolean;
  limit?: number;
  offset?: number;
};

export async function getNotifications(params: NotificationsParams = {}) {
  const searchParams = new URLSearchParams();

  if (params.includeRead) {
    searchParams.set("includeRead", "true");
  }

  if (typeof params.limit === "number") {
    searchParams.set("limit", String(params.limit));
  }

  if (typeof params.offset === "number") {
    searchParams.set("offset", String(params.offset));
  }

  const query = searchParams.toString();

  return http<NotificationsListResponse>(`/notifications${query ? `?${query}` : ""}`);
}
