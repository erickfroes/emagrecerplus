import type { PermissionKey } from "@/types/auth";

type RouteAccessRule = {
  prefix: string;
  permission: PermissionKey;
};

const routeAccessRules: RouteAccessRule[] = [
  { prefix: "/settings", permission: "settings:view" },
  { prefix: "/clinical/encounters", permission: "clinical:view" },
  { prefix: "/clinical/tasks", permission: "clinical:view" },
  { prefix: "/clinical", permission: "clinical:view" },
  { prefix: "/crm", permission: "crm:view" },
  { prefix: "/schedule", permission: "schedule:view" },
  { prefix: "/patients", permission: "patients:view" },
  { prefix: "/dashboard", permission: "dashboard:view" },
];

const routeFallbacks: Array<{ href: string; permission: PermissionKey }> = [
  { href: "/dashboard", permission: "dashboard:view" },
  { href: "/patients", permission: "patients:view" },
  { href: "/schedule", permission: "schedule:view" },
  { href: "/crm", permission: "crm:view" },
  { href: "/clinical/tasks", permission: "clinical:view" },
  { href: "/settings", permission: "settings:view" },
];

export function getRequiredPermissionForPath(pathname: string): PermissionKey | null {
  const match = routeAccessRules.find((rule) => pathname.startsWith(rule.prefix));
  return match?.permission ?? null;
}

export function getFirstAccessibleRoute(permissions: PermissionKey[]) {
  return routeFallbacks.find((route) => permissions.includes(route.permission))?.href ?? null;
}
