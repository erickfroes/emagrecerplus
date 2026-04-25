import type { SettingsAccessOverview, SettingsAccessRole } from "@/types/api";
import type { AuthSession } from "@/types/auth";

const mockRoles: SettingsAccessRole[] = [
  {
    id: "role-owner",
    code: "owner",
    name: "Owner",
    description: "Acesso administrativo completo ao tenant.",
    appRoleCode: "owner",
    scope: "tenant",
  },
  {
    id: "role-admin",
    code: "admin",
    name: "Admin",
    description: "Gerencia operacao e configuracoes.",
    appRoleCode: "admin",
    scope: "tenant",
  },
  {
    id: "role-clinician",
    code: "clinician",
    name: "Clinico",
    description: "Acompanha agenda, pacientes e prontuarios.",
    appRoleCode: "clinician",
    scope: "tenant",
  },
  {
    id: "role-assistant",
    code: "assistant",
    name: "Assistente",
    description: "Opera agenda, fila e apoio clinico.",
    appRoleCode: "assistant",
    scope: "tenant",
  },
];

export function buildMockSettingsAccessOverview(
  session: AuthSession | null
): SettingsAccessOverview {
  const units = session?.units ?? [];
  const currentUnitId = session?.currentUnitId ?? units[0]?.id ?? null;
  const roleCode = session?.user.role ?? "admin";
  const role = mockRoles.find((item) => item.appRoleCode === roleCode) ?? mockRoles[1];

  return {
    tenant: {
      id: session?.tenantId ?? "tenant-demo",
      legalName: "EmagrecePlus Clinica Integrada",
      tradeName: "EmagrecePlus",
      status: "active",
      defaultTimezone: "America/Araguaina",
    },
    currentUnitId,
    canManageAccess: false,
    roles: mockRoles,
    units: units.map((unit, index) => ({
      id: unit.id,
      name: unit.name,
      city: unit.city,
      status: "active",
      isDefault: index === 0,
    })),
    members: session
      ? [
          {
            membershipId: `membership-${session.user.id}`,
            profileId: session.user.id,
            fullName: session.user.name,
            email: session.user.email,
            status: "active",
            roleCode: role.code,
            roleName: role.name,
            appRoleCode: role.appRoleCode,
            isDefault: true,
            joinedAt: null,
            lastSeenAt: null,
            units: units.map((unit) => ({
              id: unit.id,
              name: unit.name,
              city: unit.city,
              status: "active",
              accessLevel: unit.id === currentUnitId ? "PRIMARY" : "SECONDARY",
              isPrimary: unit.id === currentUnitId,
            })),
          },
        ]
      : [],
    pendingInvitations: [],
  };
}
