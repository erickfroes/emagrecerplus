"use client";

import type { ReactNode } from "react";
import { usePermissions } from "@/hooks/use-permissions";
import type { PermissionKey } from "@/types/auth";

export function PermissionGate({
  permission,
  fallback = null,
  children,
}: {
  permission: PermissionKey;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { can } = usePermissions();

  return can(permission) ? <>{children}</> : <>{fallback}</>;
}
