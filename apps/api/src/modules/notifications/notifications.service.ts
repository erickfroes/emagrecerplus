import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";

type ListMineQuery = {
  includeRead?: string;
  limit?: string;
  offset?: string;
};

type ListAdminQuery = {
  status?: string;
  severity?: string;
  limit?: string;
  offset?: string;
};

type NotificationListItem = {
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
  severity: "info" | "warning" | "critical";
  status: string;
  channel?: string | null;
  deliveryStatus?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  readAt?: string | null;
  createdAt: string | null;
};

type NotificationListResponse = {
  items: NotificationListItem[];
  total: number;
  unreadCount: number;
  limit: number;
  offset: number;
};

type AdminNotificationListResponse = Omit<NotificationListResponse, "unreadCount">;

@Injectable()
export class NotificationsService {
  async listMine(query: ListMineQuery, authorization?: string): Promise<NotificationListResponse> {
    const limit = this.normalizeLimit(query.limit, 20);
    const offset = this.normalizeOffset(query.offset);
    const includeRead = this.normalizeBoolean(query.includeRead);

    if (!this.isRealAuthEnabled()) {
      return this.emptyList(limit, offset);
    }

    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("list_my_notifications", {
      p_limit: limit,
      p_offset: offset,
      p_include_read: includeRead,
    });

    if (error) {
      throw new BadRequestException(`Falha ao consultar notificacoes: ${error.message}`);
    }

    return this.normalizeNotificationList(data, limit, offset);
  }

  async listAdmin(
    query: ListAdminQuery,
    authorization?: string
  ): Promise<AdminNotificationListResponse> {
    const limit = this.normalizeLimit(query.limit, 50);
    const offset = this.normalizeOffset(query.offset);

    if (!this.isRealAuthEnabled()) {
      return {
        items: [],
        total: 0,
        limit,
        offset,
      };
    }

    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("list_admin_notifications", {
      p_status: this.normalizeFilter(query.status),
      p_severity: this.normalizeFilter(query.severity),
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      throw new BadRequestException(`Falha ao consultar notificacoes administrativas: ${error.message}`);
    }

    const normalized = this.normalizeNotificationList(data, limit, offset);

    return {
      items: normalized.items,
      total: normalized.total,
      limit: normalized.limit,
      offset: normalized.offset,
    };
  }

  async markRead(id: string, authorization?: string) {
    const notificationId = id.trim();

    if (!notificationId) {
      throw new BadRequestException("Identificador da notificacao ausente.");
    }

    if (!this.isRealAuthEnabled()) {
      return {
        id: notificationId,
        deliveryStatus: "read",
        readAt: new Date().toISOString(),
      };
    }

    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc("mark_notification_read", {
      p_notification_event_id: notificationId,
      p_delivery_id: null,
    });

    if (error) {
      throw new BadRequestException(`Falha ao marcar notificacao como lida: ${error.message}`);
    }

    return this.normalizeReadResult(data, notificationId);
  }

  private normalizeNotificationList(
    payload: unknown,
    fallbackLimit: number,
    fallbackOffset: number
  ): NotificationListResponse {
    const record = this.asRecord(payload);
    const rawItems = Array.isArray(record?.items) ? record.items : [];

    return {
      items: rawItems.flatMap((item) => {
        const entry = this.asRecord(item);

        if (!entry) {
          return [];
        }

        const id = this.asString(entry.id);
        const title = this.asString(entry.title);

        if (!id || !title) {
          return [];
        }

        return [
          {
            id,
            deliveryId: this.asNullableString(entry.deliveryId),
            unitId: this.asNullableString(entry.unitId),
            patientId: this.asNullableString(entry.patientId),
            sourceDomain: this.asString(entry.sourceDomain) ?? "internal",
            sourceEntityType: this.asString(entry.sourceEntityType) ?? "notification",
            sourceEntityId: this.asString(entry.sourceEntityId) ?? id,
            eventType: this.asString(entry.eventType) ?? "notification",
            title,
            body: this.asString(entry.body) ?? "",
            severity: this.normalizeSeverity(entry.severity),
            status: this.asString(entry.status) ?? "ready",
            channel: this.asNullableString(entry.channel),
            deliveryStatus: this.asNullableString(entry.deliveryStatus),
            scheduledAt: this.asNullableString(entry.scheduledAt),
            sentAt: this.asNullableString(entry.sentAt),
            readAt: this.asNullableString(entry.readAt),
            createdAt: this.asNullableString(entry.createdAt),
          },
        ];
      }),
      total: this.asNumber(record?.total, 0),
      unreadCount: this.asNumber(record?.unreadCount, 0),
      limit: this.asNumber(record?.limit, fallbackLimit),
      offset: this.asNumber(record?.offset, fallbackOffset),
    };
  }

  private normalizeReadResult(payload: unknown, fallbackId: string) {
    const record = this.asRecord(payload);

    return {
      id: this.asString(record?.id) ?? fallbackId,
      deliveryId: this.asNullableString(record?.deliveryId),
      status: this.asString(record?.status) ?? "ready",
      deliveryStatus: this.asString(record?.deliveryStatus) ?? "read",
      readAt: this.asNullableString(record?.readAt),
    };
  }

  private emptyList(limit: number, offset: number): NotificationListResponse {
    return {
      items: [],
      total: 0,
      unreadCount: 0,
      limit,
      offset,
    };
  }

  private createClientFromAuthorization(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    return createSupabaseRequestClient(accessToken);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization?.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
  }

  private isRealAuthEnabled() {
    return (process.env.API_AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "mock") === "real";
  }

  private normalizeLimit(value: string | undefined, fallback: number) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return fallback;
    }

    return Math.min(Math.max(Math.trunc(parsed), 1), 100);
  }

  private normalizeOffset(value: string | undefined) {
    const parsed = Number(value);

    if (!Number.isFinite(parsed)) {
      return 0;
    }

    return Math.max(Math.trunc(parsed), 0);
  }

  private normalizeBoolean(value: string | undefined) {
    return value === "true" || value === "1";
  }

  private normalizeFilter(value: string | undefined) {
    const normalized = value?.trim().toLowerCase();
    return normalized ? normalized : null;
  }

  private normalizeSeverity(value: unknown): NotificationListItem["severity"] {
    if (value === "warning" || value === "critical") {
      return value;
    }

    return "info";
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }

  private asString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private asNullableString(value: unknown) {
    return this.asString(value);
  }

  private asNumber(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  }
}
