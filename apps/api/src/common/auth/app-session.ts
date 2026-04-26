import type { IncomingHttpHeaders } from "node:http";

export type AppPermission =
  | "dashboard:view"
  | "patients:view"
  | "patients:write"
  | "schedule:view"
  | "schedule:write"
  | "crm:view"
  | "crm:write"
  | "clinical:view"
  | "clinical:write"
  | "notifications:view"
  | "settings:view";

export type AppRole =
  | "owner"
  | "manager"
  | "clinician"
  | "assistant"
  | "admin"
  | "physician"
  | "nutritionist"
  | "reception"
  | "sales"
  | "nursing"
  | "financial"
  | "patient";

export type AppSessionPayload = {
  tenantId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
  };
  units: Array<{
    id: string;
    name: string;
    city: string;
  }>;
  currentUnitId: string;
  accessibleUnitIds: string[];
  permissions: AppPermission[];
};

export type AppRequestContext = {
  userId: string;
  tenantId: string;
  currentUnitId: string;
  accessibleUnitIds: string[];
  permissions: AppPermission[];
};

export type RequestWithAppSession = {
  headers: IncomingHttpHeaders;
  appSession?: AppSessionPayload;
  appContext?: AppRequestContext;
};

export function toAppRequestContext(session: AppSessionPayload): AppRequestContext {
  return {
    userId: session.user.id,
    tenantId: session.tenantId,
    currentUnitId: session.currentUnitId,
    accessibleUnitIds: session.accessibleUnitIds,
    permissions: session.permissions,
  };
}
