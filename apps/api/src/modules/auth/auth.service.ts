import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from "@nestjs/common";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { AppRole, AppSessionPayload } from "../../common/auth/app-session.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type LegacyUnitAccess = {
  unit: {
    id: string;
    name: string;
    code: string | null;
    addressId: string | null;
    address: { city: string } | null;
    status: "ACTIVE" | "INACTIVE";
    createdAt: Date;
    deletedAt: Date | null;
  };
};

type LegacyRoleLink = {
  role: {
    code: string;
  };
};

type LegacyTenant = {
  id: string;
  legalName: string;
  tradeName: string | null;
  status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
  subscriptionPlanCode: string | null;
};

type LegacyUserRecord = {
  id: string;
  tenantId: string;
  fullName: string;
  email: string;
  externalAuthId: string | null;
  status: "ACTIVE" | "INVITED" | "SUSPENDED" | "DISABLED";
  unitAccess: LegacyUnitAccess[];
  userRoles: LegacyRoleLink[];
  tenant: LegacyTenant;
};

type LegacyUnit = {
  id: string;
  name: string;
  code: string | null;
  city: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: Date;
  deletedAt: Date | null;
};

type LegacyAuthSnapshot = {
  user: {
    id: string;
    tenantId: string;
    fullName: string;
    email: string;
    status: LegacyUserRecord["status"];
  };
  tenant: LegacyTenant;
  units: LegacyUnit[];
  primaryRoleCode: AppRole;
};

type RuntimeUnitSession = {
  id: string;
  name: string;
  city: string;
};

type RuntimeAppSession = {
  tenantId: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
  };
  units: RuntimeUnitSession[];
  currentUnitId: string;
  accessibleUnitIds: string[];
  permissions: AppSessionPayload["permissions"];
};

export type AuthProjectionSyncResult = {
  email: string;
  legacyUserId: string;
  legacyTenantId: string;
  runtimeUnitCount: number;
  role: AppRole;
};

const APP_ROLES: AppRole[] = [
  "owner",
  "admin",
  "manager",
  "clinician",
  "assistant",
  "physician",
  "nutritionist",
  "reception",
  "sales",
  "nursing",
  "financial",
  "patient",
];

const APP_PERMISSIONS: AppSessionPayload["permissions"] = [
  "dashboard:view",
  "patients:view",
  "patients:write",
  "schedule:view",
  "schedule:write",
  "crm:view",
  "crm:write",
  "clinical:view",
  "clinical:write",
  "settings:view",
];

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessionFromAccessToken(accessToken: string): Promise<AppSessionPayload> {
    const authUser = await this.resolveAuthenticatedUser(accessToken);
    const authEmail = authUser.email?.trim().toLowerCase();

    if (!authEmail) {
      throw new ForbiddenException("Usuario autenticado sem e-mail.");
    }

    const legacySnapshot = await this.findLegacySnapshot(authUser.id, authEmail);

    if (legacySnapshot) {
      await this.ensureSupabaseAccessProjection(authUser, legacySnapshot);

      const runtimeSession = await this.fetchRuntimeSession(accessToken);
      return this.toLegacyCompatibleSession(runtimeSession, legacySnapshot);
    }

    let runtimeSession = await this.tryFetchRuntimeSession(accessToken);

    if (!runtimeSession) {
      const invitationAccepted = await this.acceptPendingInvitationForAuthUser(authUser, authEmail);

      if (!invitationAccepted) {
        throw new ForbiddenException(
          "Usuario autenticado no Supabase, mas sem acesso liberado no sistema."
        );
      }

      runtimeSession = await this.fetchRuntimeSession(accessToken);
    }

    return this.toRuntimeCompatibleSession(runtimeSession, authUser);
  }

  async syncRuntimeAccessForSupabaseUser(
    authUser: SupabaseUser
  ): Promise<AuthProjectionSyncResult> {
    const authEmail = authUser.email?.trim().toLowerCase();

    if (!authEmail) {
      throw new ForbiddenException("Usuario autenticado sem e-mail.");
    }

    const legacySnapshot = await this.findLegacySnapshot(authUser.id, authEmail);

    if (!legacySnapshot) {
      throw new ForbiddenException(
        "Usuario autenticado no Supabase, mas nao vinculado ao espelho legado."
      );
    }

    await this.ensureSupabaseAccessProjection(authUser, legacySnapshot);

    return {
      email: authEmail,
      legacyUserId: legacySnapshot.user.id,
      legacyTenantId: legacySnapshot.tenant.id,
      runtimeUnitCount: legacySnapshot.units.length,
      role: legacySnapshot.primaryRoleCode,
    };
  }

  private async resolveAuthenticatedUser(accessToken: string) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException("Token invalido.");
    }

    return data.user;
  }

  private async findLegacyUserRecord(
    authUserId: string,
    authEmail: string
  ): Promise<LegacyUserRecord | null> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ externalAuthId: authUserId }, { email: authEmail }],
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        fullName: true,
        email: true,
        externalAuthId: true,
        status: true,
      },
    });

    if (!user) {
      return null;
    }

    const tenant = await this.prisma.tenant.findFirstOrThrow({
      where: { id: user.tenantId },
      select: {
        id: true,
        legalName: true,
        tradeName: true,
        status: true,
        subscriptionPlanCode: true,
      },
    });

    const unitAccessRows = await this.prisma.userUnitAccess.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      select: { unitId: true },
    });
    const unitIds = unitAccessRows.map((entry) => entry.unitId);
    const units =
      unitIds.length > 0
        ? await this.prisma.unit.findMany({
            where: { id: { in: unitIds } },
            select: {
              id: true,
              name: true,
              code: true,
              addressId: true,
              status: true,
              createdAt: true,
              deletedAt: true,
            },
          })
        : [];
    const addressIds = units
      .map((unit) => unit.addressId)
      .filter((addressId): addressId is string => Boolean(addressId));
    const addresses =
      addressIds.length > 0
        ? await this.prisma.address.findMany({
            where: { id: { in: addressIds } },
            select: { id: true, city: true },
          })
        : [];
    const unitsById = new Map(units.map((unit) => [unit.id, unit]));
    const addressesById = new Map(addresses.map((address) => [address.id, address]));
    const unitAccess = unitIds
      .map((unitId) => unitsById.get(unitId))
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit))
      .map((unit) => ({
        unit: {
          id: unit.id,
          name: unit.name,
          code: unit.code,
          addressId: unit.addressId,
          address: unit.addressId ? addressesById.get(unit.addressId) ?? null : null,
          status: unit.status,
          createdAt: unit.createdAt,
          deletedAt: unit.deletedAt,
        },
      }));

    const userRoleRows = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      select: { roleId: true },
    });
    const roleIds = userRoleRows.map((entry) => entry.roleId);
    const roles =
      roleIds.length > 0
        ? await this.prisma.role.findMany({
            where: { id: { in: roleIds } },
            select: { id: true, code: true },
          })
        : [];
    const rolesById = new Map(roles.map((role) => [role.id, role]));
    const userRoles = roleIds
      .map((roleId) => rolesById.get(roleId))
      .filter((role): role is NonNullable<typeof role> => Boolean(role))
      .map((role) => ({
        role: {
          code: role.code,
        },
      }));

    return {
      ...user,
      tenant,
      unitAccess,
      userRoles,
    };
  }

  private async findLegacySnapshot(
    authUserId: string,
    authEmail: string
  ): Promise<LegacyAuthSnapshot | null> {
    let user = await this.findLegacyUserRecord(authUserId, authEmail);

    if (!user) {
      return null;
    }

    if (!user.externalAuthId) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          externalAuthId: authUserId,
          lastLoginAt: new Date(),
        },
      });
      user = await this.findLegacyUserRecord(authUserId, authEmail);

      if (!user) {
        throw new InternalServerErrorException("Falha ao recarregar usuario legado autenticado.");
      }
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
        },
      });
    }

    let units = user.unitAccess.map((entry: LegacyUnitAccess) => ({
      id: entry.unit.id,
      name: entry.unit.name,
      code: entry.unit.code,
      city: entry.unit.addressId ? entry.unit.address?.city ?? "Sem cidade" : "Sem cidade",
      status: entry.unit.status,
      createdAt: entry.unit.createdAt,
      deletedAt: entry.unit.deletedAt,
    }));

    if (units.length === 0) {
      const tenantUnits = await this.prisma.unit.findMany({
        where: {
          tenantId: user.tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          code: true,
          addressId: true,
          status: true,
          createdAt: true,
          deletedAt: true,
        },
      });
      const addressIds = tenantUnits
        .map((unit) => unit.addressId)
        .filter((addressId): addressId is string => Boolean(addressId));
      const addresses =
        addressIds.length > 0
          ? await this.prisma.address.findMany({
              where: { id: { in: addressIds } },
              select: { id: true, city: true },
            })
          : [];
      const addressesById = new Map(addresses.map((address) => [address.id, address]));

      units = tenantUnits.map((unit) => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        city: unit.addressId ? addressesById.get(unit.addressId)?.city ?? "Sem cidade" : "Sem cidade",
        status: unit.status,
        createdAt: unit.createdAt,
        deletedAt: unit.deletedAt,
      }));
    }

    if (units.length === 0) {
      throw new ForbiddenException("Usuario sem unidade disponivel.");
    }

    return {
      user: {
        id: user.id,
        tenantId: user.tenantId,
        fullName: user.fullName,
        email: user.email,
        status: user.status,
      },
      tenant: {
        id: user.tenant.id,
        legalName: user.tenant.legalName,
        tradeName: user.tenant.tradeName,
        status: user.tenant.status,
        subscriptionPlanCode: user.tenant.subscriptionPlanCode,
      },
      units,
      primaryRoleCode: this.normalizeAppRole(user.userRoles[0]?.role.code),
    };
  }

  private async acceptPendingInvitationForAuthUser(
    authUser: SupabaseUser,
    authEmail: string
  ) {
    const { data, error } = await supabaseAdmin.rpc("accept_team_invitation_for_auth_user", {
      p_auth_user_id: authUser.id,
      p_email: authEmail,
      p_full_name: this.resolveFullNameFromAuthUser(authUser),
      p_phone: authUser.phone ?? null,
    });

    if (error) {
      throw new InternalServerErrorException(
        `Falha ao aceitar convite pendente: ${error.message}`
      );
    }

    return Boolean(
      data &&
        typeof data === "object" &&
        "accepted" in data &&
        (data as { accepted?: unknown }).accepted === true
    );
  }

  private async ensureSupabaseAccessProjection(
    authUser: SupabaseUser,
    legacySnapshot: LegacyAuthSnapshot
  ) {
    const { error } = await supabaseAdmin.rpc("upsert_legacy_auth_projection", {
      p_auth_user_id: authUser.id,
      p_email: legacySnapshot.user.email,
      p_full_name: legacySnapshot.user.fullName,
      p_phone: authUser.phone ?? null,
      p_user_status: legacySnapshot.user.status,
      p_legacy_user_id: legacySnapshot.user.id,
      p_legacy_tenant_id: legacySnapshot.tenant.id,
      p_legacy_tenant_legal_name: legacySnapshot.tenant.legalName,
      p_legacy_tenant_trade_name: legacySnapshot.tenant.tradeName,
      p_legacy_tenant_status: legacySnapshot.tenant.status,
      p_subscription_plan_code: legacySnapshot.tenant.subscriptionPlanCode,
      p_app_role_code: legacySnapshot.primaryRoleCode,
      p_units: legacySnapshot.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        city: unit.city,
        status: unit.status,
        deletedAt: unit.deletedAt?.toISOString() ?? null,
      })),
    });

    if (error) {
      throw new InternalServerErrorException(
        `Falha ao sincronizar projecao legacy -> Supabase: ${error.message}`
      );
    }
  }

  private async fetchRuntimeSession(accessToken: string): Promise<RuntimeAppSession> {
    const requestClient = createSupabaseRequestClient(accessToken);
    const { data, error } = await requestClient.rpc("current_app_session");

    if (error) {
      throw new ForbiddenException(`Falha ao montar sessao runtime: ${error.message}`);
    }

    return this.normalizeRuntimeSession(data);
  }

  private async tryFetchRuntimeSession(accessToken: string) {
    try {
      return await this.fetchRuntimeSession(accessToken);
    } catch {
      return null;
    }
  }

  private async toLegacyCompatibleSession(
    runtimeSession: RuntimeAppSession,
    legacySnapshot: LegacyAuthSnapshot
  ): Promise<AppSessionPayload> {
    return {
      tenantId: runtimeSession.tenantId || legacySnapshot.tenant.id,
      user: {
        id: runtimeSession.user.id || legacySnapshot.user.id,
        name: runtimeSession.user.name || legacySnapshot.user.fullName,
        email: runtimeSession.user.email || legacySnapshot.user.email,
        role: runtimeSession.user.role,
      },
      units:
        runtimeSession.units.length > 0
          ? runtimeSession.units
          : legacySnapshot.units.map((unit) => ({
              id: unit.id,
              name: unit.name,
              city: unit.city,
            })),
      currentUnitId:
        runtimeSession.currentUnitId ||
        runtimeSession.accessibleUnitIds[0] ||
        legacySnapshot.units[0].id,
      accessibleUnitIds:
        runtimeSession.accessibleUnitIds.length > 0
          ? runtimeSession.accessibleUnitIds
          : legacySnapshot.units.map((unit) => unit.id),
      permissions: runtimeSession.permissions,
    };
  }

  private toRuntimeCompatibleSession(
    runtimeSession: RuntimeAppSession,
    authUser: SupabaseUser
  ): AppSessionPayload {
    return {
      tenantId: runtimeSession.tenantId,
      user: {
        id: runtimeSession.user.id || authUser.id,
        name: runtimeSession.user.name || this.resolveFullNameFromAuthUser(authUser),
        email: runtimeSession.user.email || authUser.email?.trim().toLowerCase() || "",
        role: runtimeSession.user.role,
      },
      units: runtimeSession.units,
      currentUnitId: runtimeSession.currentUnitId,
      accessibleUnitIds: runtimeSession.accessibleUnitIds,
      permissions: runtimeSession.permissions,
    };
  }

  private normalizeRuntimeSession(value: unknown): RuntimeAppSession {
    if (!value || typeof value !== "object") {
      throw new InternalServerErrorException("Sessao runtime invalida.");
    }

    const record = value as Record<string, unknown>;
    const userRecord =
      record.user && typeof record.user === "object"
        ? (record.user as Record<string, unknown>)
        : null;
    const runtimeUnits = Array.isArray(record.units) ? record.units : [];
    const accessibleUnitIds = Array.isArray(record.accessibleUnitIds)
      ? record.accessibleUnitIds
      : [];
    const permissions = Array.isArray(record.permissions) ? record.permissions : [];

    const units = runtimeUnits
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        id: this.normalizeString(entry.id),
        name: this.normalizeString(entry.name),
        city: this.normalizeString(entry.city) || "Sem cidade",
      }))
      .filter((unit): unit is RuntimeUnitSession => Boolean(unit.id && unit.name));

    const normalizedPermissions = this.uniquePermissions(
      permissions
        .map((entry) => this.normalizeString(entry))
        .filter((entry): entry is AppSessionPayload["permissions"][number] =>
          APP_PERMISSIONS.includes(entry as AppSessionPayload["permissions"][number])
        )
    );

    const normalizedAccessibleUnitIds = this.uniqueStrings(
      accessibleUnitIds
        .map((entry) => this.normalizeString(entry))
        .filter((entry): entry is string => Boolean(entry))
    );

    const normalizedRole = this.normalizeAppRole(userRecord?.role);

    const currentUnitId =
      this.normalizeString(record.currentUnitId) ??
      normalizedAccessibleUnitIds[0] ??
      units[0]?.id ??
      "";

    if (
      !record.tenantId ||
      !userRecord ||
      (normalizedAccessibleUnitIds.length === 0 && normalizedRole !== "patient")
    ) {
      throw new ForbiddenException("Sessao runtime incompleta para o usuario autenticado.");
    }

    return {
      tenantId: this.normalizeString(record.tenantId) ?? "",
      user: {
        id: this.normalizeString(userRecord.id) ?? "",
        name: this.normalizeString(userRecord.name) ?? "",
        email: this.normalizeString(userRecord.email) ?? "",
        role: normalizedRole,
      },
      units,
      currentUnitId,
      accessibleUnitIds: normalizedAccessibleUnitIds,
      permissions: normalizedPermissions,
    };
  }

  private normalizeAppRole(value: unknown): AppRole {
    const role = this.normalizeString(value);
    return APP_ROLES.includes(role as AppRole) ? (role as AppRole) : "assistant";
  }

  private normalizeString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
  }

  private uniquePermissions(values: AppSessionPayload["permissions"]) {
    return Array.from(new Set(values));
  }

  private resolveFullNameFromAuthUser(authUser: SupabaseUser) {
    const metadata = authUser.user_metadata;
    const candidates = [
      metadata?.full_name,
      metadata?.name,
      metadata?.display_name,
      authUser.email?.split("@")[0],
      authUser.id,
    ];

    const selected = candidates.find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );

    return selected?.trim() ?? "Usuario";
  }
}
