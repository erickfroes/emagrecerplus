import type { PrismaService } from "../../prisma/prisma.service.ts";
import {
  resolvePipelineId,
  resolveTenantId,
  resolveUnitId,
  resolveUserId,
} from "../scope.ts";
import type { AppRequestContext } from "./app-session.ts";

export async function resolveTenantIdForRequest(
  prisma: PrismaService,
  context?: AppRequestContext
) {
  return context?.tenantId ?? resolveTenantId(prisma);
}

export async function resolveUnitIdForRequest(
  prisma: PrismaService,
  context?: AppRequestContext,
  preferredCode?: string
) {
  if (context?.currentUnitId) {
    return context.currentUnitId;
  }

  const tenantId = await resolveTenantIdForRequest(prisma, context);
  return resolveUnitId(prisma, tenantId, preferredCode);
}

export async function resolveActorUserIdForRequest(
  prisma: PrismaService,
  context?: AppRequestContext,
  preferredEmail?: string
) {
  const tenantId = await resolveTenantIdForRequest(prisma, context);

  if (context?.userId) {
    const legacyActor = await prisma.user.findFirst({
      where: {
        id: context.userId,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    if (legacyActor) {
      return legacyActor.id;
    }
  }

  return resolveUserId(prisma, tenantId, preferredEmail);
}

export async function resolvePipelineIdForRequest(
  prisma: PrismaService,
  context?: AppRequestContext
) {
  const tenantId = await resolveTenantIdForRequest(prisma, context);
  return resolvePipelineId(prisma, tenantId);
}
