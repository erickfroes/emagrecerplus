import type { EntityId } from "@/types/common";

export type PermissionKey =
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

export type AuthRole =
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

export type AuthUnit = {
  id: EntityId;
  name: string;
  city: string;
};

export type AuthUser = {
  id: EntityId;
  name: string;
  email: string;
  role: AuthRole;
};

export type AuthSession = {
  tenantId: EntityId;
  user: AuthUser;
  units: AuthUnit[];
  currentUnitId: EntityId;
  accessibleUnitIds: EntityId[];
  permissions: PermissionKey[];
};

export type LoginInput = {
  email: string;
};
