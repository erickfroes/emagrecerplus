import { env } from "@/lib/env";
import { rolePermissions } from "@/lib/permissions";
import type { AuthRole, AuthSession } from "@/types/auth";

const defaultUnits = [
  { id: "unit-matriz", name: "Matriz", city: "Imperatriz" },
  { id: "unit-jk", name: "Unidade JK", city: "Imperatriz" },
];

function inferRoleByEmail(email: string): AuthRole {
  if (email.includes("gestor")) return "manager";
  if (email.includes("clinico") || email.includes("medico") || email.includes("doctor")) return "clinician";
  if (email.includes("assistente") || email.includes("recepcao") || email.includes("reception")) return "assistant";
  return "owner";
}

function toDisplayName(email: string) {
  const local = email.split("@")[0] ?? "usuario";
  const cleaned = local.replace(/[._-]+/g, " ").trim();

  if (!cleaned) {
    return "Usuário Demo";
  }

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getMockSession(email = env.demoDefaultEmail): AuthSession {
  const normalizedEmail = email.trim().toLowerCase();
  const role = inferRoleByEmail(normalizedEmail);

  return {
    user: {
      id: `mock-user-${role}`,
      name: toDisplayName(normalizedEmail),
      email: normalizedEmail,
      role,
    },
    units: defaultUnits,
    currentUnitId: defaultUnits[0].id,
    permissions: rolePermissions[role],
  };
}