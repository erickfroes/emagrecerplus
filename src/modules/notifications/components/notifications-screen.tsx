"use client";

import { useState } from "react";
import { Bell, Check, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { HttpError } from "@/lib/http";
import type { NotificationListItem, NotificationSeverity } from "../api/get-notifications";
import { useMarkNotificationRead } from "../hooks/use-mark-notification-read";
import { useNotifications } from "../hooks/use-notifications";

const PAGE_SIZE = 25;

export function NotificationsScreen() {
  const [includeRead, setIncludeRead] = useState(false);
  const notificationsQuery = useNotifications({ includeRead, limit: PAGE_SIZE, offset: 0 });
  const markReadMutation = useMarkNotificationRead();
  const notifications = notificationsQuery.data?.items ?? [];
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;

  async function handleMarkRead(notificationId: string) {
    await markReadMutation.mutateAsync(notificationId);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notificacoes"
        description="Alertas internos do tenant para acompanhamento operacional."
        actions={
          <>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIncludeRead((value) => !value)}
              disabled={notificationsQuery.isFetching}
            >
              <Bell className="h-4 w-4" />
              {includeRead ? "Ocultar lidas" : "Exibir lidas"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void notificationsQuery.refetch()}
              disabled={notificationsQuery.isFetching}
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </Button>
          </>
        }
      />

      <Card className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-950">Pendentes</p>
          <p className="mt-1 text-sm text-slate-500">
            {unreadCount} notificacao{unreadCount === 1 ? "" : "es"} aguardando leitura.
          </p>
        </div>
        <Badge tone={unreadCount > 0 ? "warning" : "success"}>
          {notificationsQuery.isFetching ? "Atualizando" : unreadCount > 0 ? "Pendente" : "Em dia"}
        </Badge>
      </Card>

      {notificationsQuery.isLoading ? <NotificationsLoadingState /> : null}

      {notificationsQuery.isError ? (
        <NotificationsErrorState
          isAuthorizationError={isAuthorizationError(notificationsQuery.error)}
          onRetry={() => void notificationsQuery.refetch()}
        />
      ) : null}

      {notificationsQuery.data && notifications.length === 0 ? (
        <EmptyState
          title={includeRead ? "Nenhuma notificacao encontrada" : "Nenhuma notificacao pendente"}
          description={
            includeRead
              ? "Nao ha notificacoes internas para sua sessao."
              : "Novos alertas internos aparecerao aqui quando forem emitidos."
          }
        />
      ) : null}

      {notifications.length > 0 ? (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={`${notification.id}-${notification.deliveryId ?? "event"}`}
              notification={notification}
              isMarkingRead={markReadMutation.isPending}
              onMarkRead={() => void handleMarkRead(notification.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NotificationCard({
  notification,
  isMarkingRead,
  onMarkRead,
}: {
  notification: NotificationListItem;
  isMarkingRead: boolean;
  onMarkRead: () => void;
}) {
  const isRead = notification.deliveryStatus === "read";

  return (
    <Card className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 rounded-2xl bg-slate-100 p-2 text-slate-600">
          <Bell className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-950">{notification.title}</h2>
            <Badge tone={severityTone(notification.severity)}>
              {severityLabel(notification.severity)}
            </Badge>
            {isRead ? <Badge tone="success">Lida</Badge> : <Badge tone="warning">Pendente</Badge>}
          </div>
          {notification.body ? (
            <p className="mt-2 max-w-3xl text-sm text-slate-600">{notification.body}</p>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">
            {eventTypeLabel(notification.eventType)} / {formatDateTime(notification.createdAt)}
          </p>
        </div>
      </div>

      {!isRead ? (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={isMarkingRead}
          onClick={onMarkRead}
        >
          <Check className="h-4 w-4" />
          Marcar lida
        </Button>
      ) : null}
    </Card>
  );
}

function NotificationsLoadingState() {
  return (
    <Card className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="h-10 w-10" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-60 max-w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
      ))}
    </Card>
  );
}

function NotificationsErrorState({
  isAuthorizationError,
  onRetry,
}: {
  isAuthorizationError: boolean;
  onRetry: () => void;
}) {
  return (
    <EmptyState
      title={isAuthorizationError ? "Acesso restrito" : "Erro ao carregar notificacoes"}
      description={
        isAuthorizationError
          ? "Sua sessao nao pode consultar notificacoes internas."
          : "Nao foi possivel consultar notificacoes agora."
      }
      action={
        <Button type="button" variant="secondary" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      }
    />
  );
}

function severityTone(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return "danger";
    case "warning":
      return "warning";
    default:
      return "default";
  }
}

function severityLabel(severity: NotificationSeverity) {
  switch (severity) {
    case "critical":
      return "Critica";
    case "warning":
      return "Atencao";
    default:
      return "Info";
  }
}

function eventTypeLabel(eventType: string) {
  return eventType.replaceAll("_", " ").replaceAll(".", " / ");
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sem data";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Sem data";
  }

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function isAuthorizationError(error: unknown) {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}
