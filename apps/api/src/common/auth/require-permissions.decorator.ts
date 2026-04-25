import { SetMetadata } from "@nestjs/common";
import type { AppPermission } from "./app-session.ts";

export const REQUIRED_PERMISSIONS_KEY = "requiredPermissions";

export const RequirePermissions = (...permissions: AppPermission[]) =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);
