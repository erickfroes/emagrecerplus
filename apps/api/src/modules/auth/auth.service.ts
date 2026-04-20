import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";

type AppPermission =
  | "dashboard:view"
  | "patients:view"
  | "patients:write"
  | "schedule:view"
  | "schedule:write"
  | "crm:view"
  | "crm:write"
  | "clinical:view"
  | "clinical:write"
  | "settings:view";

type SessionUnitAccess = {
  unit: {
    id: string;
    name: string;
    addressId: string | null;
    address: { city: string } | null;
  };
};

type TenantUnit = {
  id: string;
  name: string;
  address: { city: string } | null;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async getSessionFromAccessToken(accessToken: string) {
    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new UnauthorizedException("Token invalido.");
    }

    const authUser = data.user;
    const authEmail = authUser.email?.trim().toLowerCase();

    if (!authEmail) {
      throw new ForbiddenException("Usuario autenticado sem e-mail.");
    }

    let user = await this.prisma.user.findFirst({
      where: {
        OR: [{ externalAuthId: authUser.id }, { email: authEmail }],
        deletedAt: null,
      },
      include: {
        unitAccess: {
          include: {
            unit: {
              include: {
                address: true,
              },
            },
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new ForbiddenException(
        "Usuario autenticado no Supabase, mas nao vinculado ao sistema."
      );
    }

    if (!user.externalAuthId) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          externalAuthId: authUser.id,
          lastLoginAt: new Date(),
        },
        include: {
          unitAccess: {
            include: {
              unit: {
                include: {
                  address: true,
                },
              },
            },
          },
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
      });
    } else {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date(),
        },
      });
    }

    const currentUser = user;
    const permissionCodes = new Set<string>();

    for (const userRole of currentUser.userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        permissionCodes.add(rolePermission.permission.code);
      }
    }

    const permissions = this.mapPermissions([...permissionCodes]);
    const units =
      currentUser.unitAccess.length > 0
        ? currentUser.unitAccess.map((entry: SessionUnitAccess) => ({
            id: entry.unit.id,
            name: entry.unit.name,
            city: entry.unit.addressId ? entry.unit.address?.city ?? "Sem cidade" : "Sem cidade",
          }))
        : (
            await this.prisma.unit.findMany({
              where: {
                tenantId: currentUser.tenantId,
                deletedAt: null,
              },
              orderBy: { createdAt: "asc" },
              take: 20,
              include: {
                address: true,
              },
            })
          ).map((unit: TenantUnit) => ({
            id: unit.id,
            name: unit.name,
            city: unit.address?.city ?? "Sem cidade",
          }));

    if (units.length === 0) {
      throw new ForbiddenException("Usuario sem unidade disponivel.");
    }

    const primaryRoleCode = currentUser.userRoles[0]?.role.code ?? "assistant";

    return {
      user: {
        id: currentUser.id,
        name: currentUser.fullName,
        email: currentUser.email,
        role: this.mapRole(primaryRoleCode),
      },
      units,
      currentUnitId: units[0].id,
      permissions,
    };
  }

  private mapRole(roleCode: string) {
    switch (roleCode) {
      case "admin":
        return "admin";
      case "physician":
        return "physician";
      case "nutritionist":
        return "nutritionist";
      case "reception":
        return "reception";
      case "sales":
        return "sales";
      case "nursing":
        return "nursing";
      case "financial":
        return "financial";
      default:
        return "assistant";
    }
  }

  private mapPermissions(codes: string[]): AppPermission[] {
    const mapped = new Set<AppPermission>();

    if (codes.includes("platform.read")) {
      mapped.add("dashboard:view");
      mapped.add("settings:view");
    }

    if (codes.includes("patients.read")) mapped.add("patients:view");
    if (codes.includes("patients.write")) mapped.add("patients:write");

    if (codes.includes("schedule.read")) mapped.add("schedule:view");
    if (codes.includes("schedule.write")) mapped.add("schedule:write");

    if (codes.includes("crm.read")) mapped.add("crm:view");
    if (codes.includes("crm.write")) mapped.add("crm:write");

    if (codes.includes("clinical.read")) mapped.add("clinical:view");
    if (codes.includes("clinical.write")) mapped.add("clinical:write");

    if (
      codes.includes("roles.read") ||
      codes.includes("users.read") ||
      codes.includes("audit.read")
    ) {
      mapped.add("settings:view");
    }

    return [...mapped];
  }
}
