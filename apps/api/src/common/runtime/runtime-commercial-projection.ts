import { createHash } from "node:crypto";

import type { PrismaService } from "../../prisma/prisma.service.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { isRuntimeSyncEnabled } from "./runtime-mode.ts";

type ScopeResult = {
  tenantId: string;
  units: Array<{
    legacyUnitId: string;
    unitId: string;
  }>;
};

type SyncCommercialRuntimeProjectionOptions = {
  leadId?: string | null;
};

function deterministicUuid(namespace: string, legacyId: string) {
  const hash = createHash("sha1").update(`${namespace}:${legacyId}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.subarray(0, 16).toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function enumToRuntime(value: string | null | undefined, fallback: string) {
  return value?.toLowerCase() ?? fallback;
}

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

function asScopeResult(value: unknown): ScopeResult {
  if (!value || typeof value !== "object") {
    throw new Error("RPC de scope nao retornou um objeto valido.");
  }

  const record = value as Record<string, unknown>;
  if (typeof record.tenantId !== "string" || !record.tenantId) {
    throw new Error("RPC de scope nao retornou tenantId.");
  }

  if (!Array.isArray(record.units)) {
    throw new Error("RPC de scope nao retornou units.");
  }

  return {
    tenantId: record.tenantId,
    units: record.units
      .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
      .map((entry) => ({
        legacyUnitId: String(entry.legacyUnitId ?? ""),
        unitId: String(entry.unitId ?? ""),
      }))
      .filter((entry) => entry.legacyUnitId.length > 0 && entry.unitId.length > 0),
  };
}

async function callRpc<T>(name: string, args: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin.rpc(name, args);

  if (error) {
    throw new Error(`Falha ao executar RPC ${name}: ${error.message}`);
  }

  return data as T;
}

export async function syncCommercialRuntimeProjection(
  prisma: PrismaService,
  tenantId: string,
  options?: SyncCommercialRuntimeProjectionOptions
) {
  if (!isRuntimeSyncEnabled()) {
    return;
  }

  try {
    await syncCommercialRuntimeProjectionUnsafe(prisma, tenantId, options);
  } catch (error) {
    console.error(
      `[runtime:sync] Falha ao sincronizar CRM do tenant ${tenantId}${options?.leadId ? ` (lead ${options.leadId})` : ""}:`,
      error
    );
  }
}

async function syncCommercialRuntimeProjectionUnsafe(
  prisma: PrismaService,
  tenantId: string,
  options?: SyncCommercialRuntimeProjectionOptions
) {
  const tenant = await prisma.tenant.findFirstOrThrow({
    where: { id: tenantId },
    select: {
      id: true,
      legalName: true,
      tradeName: true,
      status: true,
      subscriptionPlanCode: true,
      units: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          code: true,
          status: true,
          deletedAt: true,
          address: {
            select: {
              city: true,
            },
          },
        },
      },
    },
  });

  const [pipelines, leads] = await Promise.all([
    prisma.pipeline.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        active: true,
        createdAt: true,
      },
    }),
    prisma.lead.findMany({
      where: {
        tenantId,
        ...(options?.leadId ? { id: options.leadId } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fullName: true,
        phone: true,
        email: true,
        source: true,
        campaign: true,
        interestType: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        profile: {
          select: {
            mainGoal: true,
            budgetRange: true,
            urgencyLevel: true,
            painPoint: true,
            notes: true,
            createdAt: true,
            updatedAt: true,
          },
        },
        activities: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            assignedUserId: true,
            activityType: true,
            description: true,
            dueAt: true,
            completedAt: true,
            createdAt: true,
          },
        },
        stageHistory: {
          orderBy: { changedAt: "asc" },
          select: {
            id: true,
            stageId: true,
            changedBy: true,
            changedAt: true,
          },
        },
        conversion: {
          select: {
            id: true,
            patientId: true,
            convertedBy: true,
            createdAt: true,
          },
        },
      },
    }),
  ]);

  const pipelineIds = pipelines.map((pipeline) => pipeline.id);
  const stages = pipelineIds.length
    ? await prisma.pipelineStage.findMany({
        where: {
          pipelineId: {
            in: pipelineIds,
          },
        },
        orderBy: [{ pipelineId: "asc" }, { position: "asc" }],
        select: {
          id: true,
          pipelineId: true,
          name: true,
          code: true,
          position: true,
          isFinal: true,
        },
      })
    : [];

  const scope = asScopeResult(
    await callRpc("backfill_runtime_scope", {
      p_legacy_tenant_id: tenant.id,
      p_legacy_tenant_legal_name: tenant.legalName,
      p_legacy_tenant_trade_name: tenant.tradeName,
      p_legacy_tenant_status: tenant.status,
      p_subscription_plan_code: tenant.subscriptionPlanCode,
      p_units: tenant.units.map((unit) => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        city: unit.address?.city ?? "Sem cidade",
        status: unit.status,
        deletedAt: toIso(unit.deletedAt),
      })),
    })
  );

  await callRpc("backfill_runtime_commercial_domain", {
    p_runtime_tenant_id: scope.tenantId,
    p_pipelines: pipelines.map((pipeline) => ({
      id: deterministicUuid("commercial_pipeline", pipeline.id),
      legacy_pipeline_id: pipeline.id,
      name: pipeline.name,
      code: pipeline.code,
      active: pipeline.active,
      metadata: {
        source: "api_runtime_commercial_sync",
      },
      created_at: toIso(pipeline.createdAt),
      updated_at: toIso(pipeline.createdAt),
      deleted_at: null,
    })),
    p_pipeline_stages: stages.map((stage) => ({
      id: deterministicUuid("commercial_pipeline_stage", stage.id),
      legacy_stage_id: stage.id,
      legacy_pipeline_id: stage.pipelineId,
      name: stage.name,
      code: stage.code,
      position: stage.position,
      is_final: stage.isFinal,
      metadata: {
        source: "api_runtime_commercial_sync",
      },
      created_at: null,
      updated_at: null,
    })),
    p_leads: leads.map((lead) => ({
      id: deterministicUuid("commercial_lead", lead.id),
      legacy_lead_id: lead.id,
      full_name: lead.fullName,
      phone: lead.phone,
      email: lead.email,
      source: lead.source,
      campaign: lead.campaign,
      interest_type: lead.interestType,
      status: enumToRuntime(lead.status, "new"),
      metadata: {
        source: "api_runtime_commercial_sync",
      },
      created_at: toIso(lead.createdAt),
      updated_at: toIso(lead.updatedAt),
      deleted_at: toIso(lead.deletedAt),
    })),
    p_lead_profiles: leads.flatMap((lead) =>
      lead.profile
        ? [
            {
              legacy_lead_id: lead.id,
              main_goal: lead.profile.mainGoal,
              budget_range: lead.profile.budgetRange,
              urgency_level: lead.profile.urgencyLevel,
              pain_point: lead.profile.painPoint,
              notes: lead.profile.notes,
              metadata: {
                source: "api_runtime_commercial_sync",
              },
              created_at: toIso(lead.profile.createdAt),
              updated_at: toIso(lead.profile.updatedAt),
            },
          ]
        : []
    ),
    p_lead_stage_history: leads.flatMap((lead) =>
      lead.stageHistory.map((history) => ({
        id: deterministicUuid("commercial_stage_history", history.id),
        legacy_stage_history_key: history.id,
        legacy_lead_id: lead.id,
        legacy_stage_id: history.stageId,
        legacy_changed_by_user_id: history.changedBy,
        changed_at: toIso(history.changedAt),
        metadata: {
          source: "api_runtime_commercial_sync",
        },
        created_at: toIso(history.changedAt),
      }))
    ),
    p_lead_activities: leads.flatMap((lead) =>
      lead.activities.map((activity) => ({
        id: deterministicUuid("commercial_activity", activity.id),
        legacy_activity_id: activity.id,
        legacy_lead_id: lead.id,
        assigned_to_legacy_user_id: activity.assignedUserId,
        activity_type: enumToRuntime(activity.activityType, "task"),
        description: activity.description,
        due_at: toIso(activity.dueAt),
        completed_at: toIso(activity.completedAt),
        metadata: {
          source: "api_runtime_commercial_sync",
        },
        created_at: toIso(activity.createdAt),
        updated_at: toIso(activity.createdAt),
      }))
    ),
    p_conversions: leads.flatMap((lead) =>
      lead.conversion
        ? [
            {
              id: deterministicUuid("commercial_conversion", lead.conversion.id),
              legacy_conversion_id: lead.conversion.id,
              legacy_lead_id: lead.id,
              legacy_patient_id: lead.conversion.patientId,
              legacy_converted_by_user_id: lead.conversion.convertedBy,
              metadata: {
                source: "api_runtime_commercial_sync",
              },
              created_at: toIso(lead.conversion.createdAt),
            },
          ]
        : []
    ),
  });
}
