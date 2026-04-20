import { NotFoundException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service.ts";

let cachedTenantId: string | null = null;
const cachedPipelineIds = new Map<string, string>();
const cachedUnitIds = new Map<string, string>();
const cachedUserIds = new Map<string, string>();

export async function resolveTenantId(prisma: PrismaService) {
  if (process.env.DEFAULT_TENANT_ID) {
    return process.env.DEFAULT_TENANT_ID;
  }

  if (cachedTenantId) {
    return cachedTenantId;
  }

  const tenant = await prisma.tenant.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (!tenant) {
    throw new NotFoundException("Nenhum tenant disponivel para a API.");
  }

  cachedTenantId = tenant.id;
  return tenant.id;
}

export async function resolvePipelineId(prisma: PrismaService, tenantId: string) {
  const preferredCode = process.env.DEFAULT_PIPELINE_CODE ?? "default-sales";
  const cacheKey = `${tenantId}:${preferredCode}`;

  const cached = cachedPipelineIds.get(cacheKey);
  if (cached) {
    return cached;
  }

  const preferredPipeline =
    (await prisma.pipeline.findFirst({
      where: {
        tenantId,
        code: preferredCode,
        active: true,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await prisma.pipeline.findFirst({
      where: {
        tenantId,
        active: true,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));

  if (!preferredPipeline) {
    throw new NotFoundException("Nenhum pipeline ativo encontrado para o tenant atual.");
  }

  cachedPipelineIds.set(cacheKey, preferredPipeline.id);
  return preferredPipeline.id;
}

export async function resolveUnitId(
  prisma: PrismaService,
  tenantId: string,
  preferredCode?: string
) {
  const code = preferredCode ?? process.env.DEFAULT_UNIT_CODE ?? "MATRIZ";
  const cacheKey = `${tenantId}:${code}`;

  const cached = cachedUnitIds.get(cacheKey);
  if (cached) {
    return cached;
  }

  const unit =
    (await prisma.unit.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        ...(code ? { code } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    })) ??
    (await prisma.unit.findFirst({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));

  if (!unit) {
    throw new NotFoundException("Nenhuma unidade disponivel para o tenant atual.");
  }

  cachedUnitIds.set(cacheKey, unit.id);
  return unit.id;
}

export async function resolveUserId(
  prisma: PrismaService,
  tenantId: string,
  preferredEmail?: string
) {
  const normalizedEmail = preferredEmail?.trim().toLowerCase() ?? "";
  const cacheKey = `${tenantId}:${normalizedEmail || "__first__"}`;

  const cached = cachedUserIds.get(cacheKey);
  if (cached) {
    return cached;
  }

  const user =
    (normalizedEmail
      ? await prisma.user.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            email: normalizedEmail,
          },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      : null) ??
    (await prisma.user.findFirst({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    }));

  if (!user) {
    throw new NotFoundException("Nenhum usuario disponivel para o tenant atual.");
  }

  cachedUserIds.set(cacheKey, user.id);
  return user.id;
}