import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  ActivityType,
  LeadStatus,
  RecordStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import {
  buildPipelineSummary,
  formatRelativeDateTime,
  formatStageName,
  humanizeCode,
  mapLeadStatusToStageCode,
} from "../../common/presenters.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import {
  resolveActorUserIdForRequest,
  resolvePipelineIdForRequest,
  resolveTenantIdForRequest,
} from "../../common/auth/request-context.ts";
import { syncCommercialRuntimeProjection } from "../../common/runtime/runtime-commercial-projection.ts";
import { syncPatientRuntimeProjection } from "../../common/runtime/runtime-patient-projection.ts";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type KanbanStageRow = {
  id: string;
  code: string;
  name: string;
};

type KanbanLeadRow = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interestType: string | null;
  status: LeadStatus;
  createdAt: Date;
  activities: Array<{
    id: string;
    activityType: ActivityType;
    description: string | null;
    dueAt: Date | null;
    completedAt: Date | null;
    createdAt: Date;
    assignedUser: { fullName: string } | null;
  }>;
  stageHistory: Array<{
    id: string;
    changedAt: Date;
    user: { fullName: string } | null;
    stage: { code: string; name: string } | null;
  }>;
};

type PipelineLeadRow = {
  status: LeadStatus;
  stageHistory: Array<{
    stage: { code: string } | null;
  }>;
};

type LeadActivityRow = {
  id: string;
  activityType: ActivityType;
  description: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assignedUser: { fullName: string } | null;
};

type RuntimeKanbanStage = {
  code: string;
  name: string;
  position: number;
};

type RuntimeKanbanTimelineItem = {
  id: string;
  kind: "activity" | "stage";
  title: string;
  description: string;
  date: string;
};

type RuntimeKanbanLead = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  source: string | null;
  interestType: string | null;
  stageCode: string | null;
  stageName: string | null;
  owner: string | null;
  lastContactAt: string | null;
  updatedAt: string | null;
  timeline: RuntimeKanbanTimelineItem[];
};

type RuntimeKanbanSnapshot = {
  stages: RuntimeKanbanStage[];
  leads: RuntimeKanbanLead[];
};

type RuntimeLeadActivity = {
  id: string;
  activityType: string;
  description: string;
  dueAt: string | null;
  completedAt: string | null;
  createdAt: string;
  assignedTo: string;
};

type RuntimeCatalogService = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  serviceType: string;
  durationMinutes: number | null;
  listPrice: number;
  currencyCode: string;
  active: boolean;
};

type RuntimeCatalogPackage = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  packageType: string;
  billingModel: string;
  tier: string | null;
  price: number;
  currencyCode: string;
  featured: boolean;
  active: boolean;
  serviceCount: number;
};

type RuntimeCatalogPackageService = {
  id: string;
  packageId: string;
  serviceId: string;
  quantity: number;
  required: boolean;
  notes: string | null;
  itemPriceOverride: number | null;
};

type RuntimeCatalogProgram = {
  id: string;
  name: string;
  code: string;
  description: string | null;
  programType: string;
  durationDays: number | null;
  featured: boolean;
  active: boolean;
  packageCount: number;
};

type RuntimeCatalogProgramPackage = {
  id: string;
  programId: string;
  packageId: string;
  sortOrder: number;
  recommended: boolean;
};

type RuntimeCommercialCatalogSnapshot = {
  services: RuntimeCatalogService[];
  packages: RuntimeCatalogPackage[];
  packageServices: RuntimeCatalogPackageService[];
  programs: RuntimeCatalogProgram[];
  programPackages: RuntimeCatalogProgramPackage[];
};

@Injectable()
export class CrmService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: {
    fullName: string;
    phone?: string;
    email?: string;
    source?: string;
    campaign?: string;
    interestType?: string;
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const pipelineId = await resolvePipelineIdForRequest(this.prisma, context);
    const salesUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_SALES_EMAIL
    );

    const lead = await this.prisma.lead.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        source: dto.source,
        campaign: dto.campaign,
        interestType: dto.interestType,
        status: "NEW",
      },
    });

    const firstStage = await this.prisma.pipelineStage.findFirst({
      where: { pipelineId },
      orderBy: { position: "asc" },
    });

    await this.prisma.$transaction(async (tx: any) => {
      await tx.activity.create({
        data: {
          leadId: lead.id,
          assignedUserId: salesUserId,
          activityType: ActivityType.TASK,
          description: "Realizar primeiro contato com este lead.",
        },
      });

      if (firstStage) {
        await tx.leadStageHistory.create({
          data: {
            leadId: lead.id,
            stageId: firstStage.id,
            changedBy: salesUserId,
          },
        });
      }
    });

    await this.syncCommercialRuntimeProjectionSafely(tenantId, lead.id);

    return {
      id: lead.id,
      name: lead.fullName,
      status: lead.status,
    };
  }

  async getKanban(context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.getKanbanFromRuntime(context, authorization);
    }

    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const pipelineId = await resolvePipelineIdForRequest(this.prisma, context);

    const [stages, leads] = await Promise.all([
      this.prisma.pipelineStage.findMany({
        where: { pipelineId },
        orderBy: { position: "asc" },
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      this.prisma.lead.findMany({
        where: {
          tenantId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          phone: true,
          email: true,
          source: true,
          interestType: true,
          status: true,
          createdAt: true,
          activities: {
            orderBy: { createdAt: "desc" },
            take: 6,
            select: {
              id: true,
              activityType: true,
              description: true,
              dueAt: true,
              completedAt: true,
              createdAt: true,
              assignedUser: {
                select: {
                  fullName: true,
                },
              },
            },
          },
          stageHistory: {
            orderBy: { changedAt: "desc" },
            take: 6,
            select: {
              id: true,
              changedAt: true,
              user: {
                select: {
                  fullName: true,
                },
              },
              stage: {
                select: {
                  code: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return {
      columns: stages.map((stage: KanbanStageRow) => ({
        code: stage.code,
        title: stage.name,
        items: leads
          .filter(
            (lead: KanbanLeadRow) =>
              resolveStageCode(lead.stageHistory[0]?.stage?.code, lead.status) === stage.code
          )
          .map((lead: KanbanLeadRow) => ({
            id: lead.id,
            name: lead.fullName,
            phone: lead.phone,
            email: lead.email,
            source: humanizeCode(lead.source),
            interest: humanizeCode(lead.interestType),
            owner:
              lead.activities[0]?.assignedUser?.fullName ??
              lead.stageHistory[0]?.user?.fullName ??
              "Time comercial",
            lastContact: formatRelativeDateTime(
              lead.activities[0]?.createdAt ?? lead.stageHistory[0]?.changedAt ?? lead.createdAt
            ),
            stage:
              lead.stageHistory[0]?.stage?.name ??
              formatStageName(resolveStageCode(undefined, lead.status)),
            timeline: buildLeadTimeline(lead),
          })),
      })),
    };
  }

  async getPipelineSummary() {
    const tenantId = await resolveTenantIdForRequest(this.prisma);
    const leads = await this.prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      select: {
        status: true,
        stageHistory: {
          orderBy: { changedAt: "desc" },
          take: 1,
          select: {
            stage: {
              select: {
                code: true,
              },
            },
          },
        },
      },
    });

    return buildPipelineSummary(
      leads.map((lead: PipelineLeadRow) =>
        resolveStageCode(lead.stageHistory[0]?.stage?.code, lead.status)
      )
    );
  }

  async getCatalogSnapshot(context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.getCatalogSnapshotFromRuntime(context, authorization);
    }

    return {
      services: [],
      packages: [],
      packageServices: [],
      programs: [],
      programPackages: [],
    };
  }

  async listActivities(id: string, context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.listActivitiesFromRuntime(id, context, authorization);
    }

    const tenantId = await resolveTenantIdForRequest(this.prisma, context);

    await this.prisma.lead.findFirstOrThrow({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const activities = await this.prisma.activity.findMany({
      where: {
        leadId: id,
        lead: {
          is: {
            tenantId,
            deletedAt: null,
          },
        },
      },
      orderBy: [{ completedAt: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        activityType: true,
        description: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        assignedUser: {
          select: {
            fullName: true,
          },
        },
      },
      take: 20,
    });

    return {
      items: activities.map(mapLeadActivity),
    };
  }

  async createActivity(
    id: string,
    dto: { activityType: string; description?: string; dueAt?: string }
  , context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);

    await this.prisma.lead.findFirstOrThrow({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const assignedUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_SALES_EMAIL
    );

    const activity = await this.prisma.activity.create({
      data: {
        leadId: id,
        assignedUserId,
        activityType: normalizeActivityType(dto.activityType),
        description: dto.description?.trim() || undefined,
        dueAt: parseActivityDueAt(dto.dueAt),
      },
      select: {
        id: true,
        activityType: true,
        description: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        assignedUser: {
          select: {
            fullName: true,
          },
        },
      },
    });

    await this.syncCommercialRuntimeProjectionSafely(tenantId, id);

    return mapLeadActivity(activity);
  }

  async updateActivity(
    leadId: string,
    activityId: string,
    dto: {
      activityType?: string;
      description?: string;
      dueAt?: string;
      completed?: boolean;
    },
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);

    const activity = await this.prisma.activity.findFirst({
      where: {
        id: activityId,
        leadId,
        lead: {
          is: {
            tenantId,
            deletedAt: null,
          },
        },
      },
      select: {
        id: true,
      },
    });

    if (!activity) {
      throw new NotFoundException("Atividade nao encontrada para este lead.");
    }

    const updatedActivity = await this.prisma.activity.update({
      where: { id: activity.id },
      data: {
        ...(dto.activityType ? { activityType: normalizeActivityType(dto.activityType) } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.dueAt !== undefined
          ? { dueAt: parseActivityDueAt(dto.dueAt) ?? null }
          : {}),
        ...(dto.completed !== undefined
          ? { completedAt: dto.completed ? new Date() : null }
          : {}),
      },
      select: {
        id: true,
        activityType: true,
        description: true,
        dueAt: true,
        completedAt: true,
        createdAt: true,
        assignedUser: {
          select: {
            fullName: true,
          },
        },
      },
    });

    await this.syncCommercialRuntimeProjectionSafely(tenantId, leadId);

    return mapLeadActivity(updatedActivity);
  }

  async moveStage(id: string, dto: { stageCode: string }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const pipelineId = await resolvePipelineIdForRequest(this.prisma, context);
    const stageCode = dto.stageCode?.trim() ?? "";

    if (!stageCode) {
      throw new BadRequestException("stageCode e obrigatorio.");
    }

    const [lead, stage, changedBy] = await Promise.all([
      this.prisma.lead.findFirst({
        where: {
          id,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          stageHistory: {
            orderBy: { changedAt: "desc" },
            take: 1,
            select: {
              stage: {
                select: {
                  code: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.pipelineStage.findFirst({
        where: {
          pipelineId,
          code: stageCode,
        },
        select: {
          id: true,
          code: true,
          name: true,
        },
      }),
      resolveActorUserIdForRequest(this.prisma, context, process.env.DEFAULT_SALES_EMAIL),
    ]);

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado para o tenant atual.");
    }

    if (!stage) {
      throw new NotFoundException("Etapa do pipeline nao encontrada.");
    }

    if (lead.stageHistory[0]?.stage?.code === stage.code) {
      return {
        id: lead.id,
        stageCode: stage.code,
        stage: stage.name,
        status: mapStageCodeToLeadStatus(stage.code),
      };
    }

    const status = mapStageCodeToLeadStatus(stage.code);

    await this.prisma.$transaction(async (tx: any) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: { status },
      });
      await tx.leadStageHistory.create({
        data: {
          leadId: lead.id,
          stageId: stage.id,
          changedBy,
        },
      });
    });

    await this.syncCommercialRuntimeProjectionSafely(tenantId, lead.id);

    return {
      id: lead.id,
      stageCode: stage.code,
      stage: stage.name,
      status,
    };
  }

  async convert(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const pipelineId = await resolvePipelineIdForRequest(this.prisma, context);
    const convertedBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_SALES_EMAIL
    );

    const lead = await this.prisma.lead.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        profile: true,
        conversion: true,
      },
    });

    if (!lead) {
      throw new NotFoundException("Lead nao encontrado para o tenant atual.");
    }

    if (lead.conversion) {
      return {
        id: lead.id,
        patientId: lead.conversion.patientId,
        converted: true,
        reusedExistingPatient: true,
      };
    }

    const possibleMatches: Array<{ primaryEmail?: string; primaryPhone?: string }> = [];

    if (lead.email?.trim()) {
      possibleMatches.push({ primaryEmail: lead.email.trim().toLowerCase() });
    }

    if (lead.phone?.trim()) {
      possibleMatches.push({ primaryPhone: lead.phone.trim() });
    }

    const existingPatient: {
      id: string;
      primaryEmail: string | null;
      primaryPhone: string | null;
      profile: {
        goalsSummary: string | null;
        referralSource: string | null;
        notes: string | null;
      } | null;
    } | null = possibleMatches.length
      ? await this.prisma.patient.findFirst({
          where: {
            tenantId,
            deletedAt: null,
            OR: possibleMatches,
          },
          select: {
            id: true,
            primaryEmail: true,
            primaryPhone: true,
            profile: {
              select: {
                goalsSummary: true,
                referralSource: true,
                notes: true,
              },
            },
          },
        })
      : null;

    const wonStage = await this.prisma.pipelineStage.findFirst({
      where: {
        pipelineId,
        code: "won",
      },
      select: { id: true },
    });

    const patientId = await this.prisma.$transaction(async (tx: any) => {
      const patient = existingPatient
        ? await tx.patient.update({
            where: { id: existingPatient.id },
            data: {
              primaryEmail: existingPatient.primaryEmail ?? lead.email?.trim().toLowerCase(),
              primaryPhone: existingPatient.primaryPhone ?? lead.phone?.trim(),
              profile:
                lead.profile || lead.source
                  ? {
                      upsert: {
                        update: {
                          goalsSummary:
                            existingPatient.profile?.goalsSummary ??
                            lead.profile?.mainGoal ??
                            undefined,
                          referralSource:
                            existingPatient.profile?.referralSource ??
                            humanizeCode(lead.source) ??
                            undefined,
                          notes: existingPatient.profile?.notes ?? lead.profile?.notes ?? undefined,
                        },
                        create: {
                          goalsSummary: lead.profile?.mainGoal,
                          referralSource: humanizeCode(lead.source),
                          notes: lead.profile?.notes,
                        },
                      },
                    }
                  : undefined,
            },
            select: { id: true },
          })
        : await tx.patient.create({
            data: {
              tenantId,
              fullName: lead.fullName,
              primaryPhone: lead.phone?.trim(),
              primaryEmail: lead.email?.trim().toLowerCase(),
              status: RecordStatus.ACTIVE,
              profile:
                lead.profile || lead.source
                  ? {
                      create: {
                        goalsSummary: lead.profile?.mainGoal,
                        referralSource: humanizeCode(lead.source),
                        notes: lead.profile?.notes,
                      },
                    }
                  : undefined,
            },
            select: { id: true },
          });

      await tx.conversion.create({
        data: {
          leadId: lead.id,
          patientId: patient.id,
          convertedBy,
        },
      });

      await tx.lead.update({
        where: { id: lead.id },
        data: { status: LeadStatus.WON },
      });

      await tx.activity.create({
        data: {
          leadId: lead.id,
          assignedUserId: convertedBy,
          activityType: ActivityType.NOTE,
          description: existingPatient
            ? "Lead vinculado a um paciente existente."
            : "Lead convertido em paciente.",
        },
      });

      if (wonStage) {
        await tx.leadStageHistory.create({
          data: {
            leadId: lead.id,
            stageId: wonStage.id,
            changedBy: convertedBy,
          },
        });
      }

      return patient.id;
    });

    try {
      await syncPatientRuntimeProjection(this.prisma, patientId);
    } catch (error) {
      console.error(
        `[runtime:write] Falha ao sincronizar o paciente convertido ${patientId} depois da conversao do lead ${lead.id}.`,
        error
      );
    }

    await this.syncCommercialRuntimeProjectionSafely(tenantId, lead.id);

    return {
      id: lead.id,
      patientId,
      converted: true,
      reusedExistingPatient: Boolean(existingPatient),
    };
  }

  private async getKanbanFromRuntime(
    context?: AppRequestContext,
    authorization?: string
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    await syncCommercialRuntimeProjection(this.prisma, tenantId);

    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    const { data, error } = await requestClient.rpc("crm_kanban_snapshot", {
      p_pipeline_code: process.env.DEFAULT_PIPELINE_CODE ?? "default-sales",
    });

    if (error) {
      throw new BadRequestException(`Falha ao consultar CRM no runtime: ${error.message}`);
    }

    if (!isRecord(data)) {
      throw new BadRequestException("RPC crm_kanban_snapshot retornou um payload invalido.");
    }

    const snapshot = this.parseRuntimeKanbanSnapshot(data);

    return {
      columns: snapshot.stages.map((stage) => ({
        code: stage.code,
        title: stage.name,
        items: snapshot.leads
          .filter((lead) => (lead.stageCode ?? mapLeadStatusToStageCode(LeadStatus.NEW)) === stage.code)
          .map((lead) => ({
            id: lead.id,
            name: lead.fullName,
            phone: lead.phone,
            email: lead.email,
            source: humanizeCode(lead.source),
            interest: humanizeCode(lead.interestType),
            owner: lead.owner ?? "Time comercial",
            lastContact: formatRelativeDateTime(parseRuntimeDate(lead.lastContactAt, new Date())),
            stage:
              lead.stageName ??
              formatStageName(lead.stageCode ?? mapLeadStatusToStageCode(LeadStatus.NEW)),
            timeline: lead.timeline.map((item) => ({
              id: item.id,
              kind: item.kind,
              title: item.title,
              description: item.description,
              dateLabel: formatRelativeDateTime(parseRuntimeDate(item.date, new Date())),
            })),
          })),
      })),
    };
  }

  private async getCatalogSnapshotFromRuntime(
    context?: AppRequestContext,
    authorization?: string
  ) {
    await resolveTenantIdForRequest(this.prisma, context);

    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    const { data, error } = await requestClient.rpc("commercial_catalog_snapshot");

    if (error) {
      throw new BadRequestException(
        `Falha ao consultar catalogo comercial no runtime: ${error.message}`
      );
    }

    if (!isRecord(data)) {
      throw new BadRequestException(
        "RPC commercial_catalog_snapshot retornou um payload invalido."
      );
    }

    return this.parseRuntimeCommercialCatalogSnapshot(data);
  }

  private async listActivitiesFromRuntime(
    id: string,
    context?: AppRequestContext,
    authorization?: string
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    await syncCommercialRuntimeProjection(this.prisma, tenantId, { leadId: id });

    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    const { data, error } = await requestClient.rpc("crm_lead_activities", {
      p_lead_id: id,
    });

    if (error) {
      throw new BadRequestException(
        `Falha ao consultar atividades comerciais no runtime: ${error.message}`
      );
    }

    if (!isRecord(data)) {
      throw new BadRequestException("RPC crm_lead_activities retornou um payload invalido.");
    }

    const items = this.parseRuntimeLeadActivities(data);

    return {
      items: items.map((activity) => ({
        id: activity.id,
        activityType: normalizeRuntimeActivityType(activity.activityType),
        title: formatActivityTitle(normalizeRuntimeActivityType(activity.activityType)),
        description: activity.description,
        dueAt: activity.dueAt,
        completedAt: activity.completedAt,
        createdAt: activity.createdAt,
        assignedTo: activity.assignedTo,
      })),
    };
  }

  private async syncCommercialRuntimeProjectionSafely(tenantId: string, leadId?: string) {
    await syncCommercialRuntimeProjection(this.prisma, tenantId, {
      leadId: leadId ?? null,
    });
  }

  private parseRuntimeKanbanSnapshot(payload: Record<string, unknown>): RuntimeKanbanSnapshot {
    const stages = Array.isArray(payload.stages) ? payload.stages : [];
    const leads = Array.isArray(payload.leads) ? payload.leads : [];

    return {
      stages: stages.flatMap((entry) => {
        if (!isRecord(entry) || !entry.code || !entry.name) {
          return [];
        }

        return [
          {
            code: asString(entry.code),
            name: asString(entry.name),
            position: asNumber(entry.position),
          },
        ];
      }),
      leads: leads.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.fullName) {
          return [];
        }

        const timeline = Array.isArray(entry.timeline) ? entry.timeline : [];

        return [
          {
            id: asString(entry.id),
            fullName: asString(entry.fullName),
            phone: asNullableString(entry.phone),
            email: asNullableString(entry.email),
            source: asNullableString(entry.source),
            interestType: asNullableString(entry.interestType),
            stageCode: asNullableString(entry.stageCode),
            stageName: asNullableString(entry.stageName),
            owner: asNullableString(entry.owner),
            lastContactAt: asNullableString(entry.lastContactAt),
            updatedAt: asNullableString(entry.updatedAt),
            timeline: timeline.flatMap((timelineEntry) => {
              if (!isRecord(timelineEntry) || !timelineEntry.id || !timelineEntry.title || !timelineEntry.date) {
                return [];
              }

              const kind = timelineEntry.kind === "stage" ? "stage" : "activity";

              return [
                {
                  id: asString(timelineEntry.id),
                  kind,
                  title: asString(timelineEntry.title),
                  description: asString(timelineEntry.description),
                  date: asString(timelineEntry.date),
                },
              ];
            }),
          },
        ];
      }),
    };
  }

  private parseRuntimeLeadActivities(payload: Record<string, unknown>) {
    const items = Array.isArray(payload.items) ? payload.items : [];

    return items.flatMap((entry) => {
      if (!isRecord(entry) || !entry.id || !entry.activityType || !entry.createdAt) {
        return [];
      }

      return [
        {
          id: asString(entry.id),
          activityType: asString(entry.activityType),
          description: asString(entry.description),
          dueAt: asNullableString(entry.dueAt),
          completedAt: asNullableString(entry.completedAt),
          createdAt: asString(entry.createdAt),
          assignedTo: asString(entry.assignedTo) || "Time comercial",
        },
      ];
    });
  }

  private parseRuntimeCommercialCatalogSnapshot(
    payload: Record<string, unknown>
  ): RuntimeCommercialCatalogSnapshot {
    const services = Array.isArray(payload.services) ? payload.services : [];
    const packages = Array.isArray(payload.packages) ? payload.packages : [];
    const packageServices = Array.isArray(payload.packageServices)
      ? payload.packageServices
      : [];
    const programs = Array.isArray(payload.programs) ? payload.programs : [];
    const programPackages = Array.isArray(payload.programPackages)
      ? payload.programPackages
      : [];

    return {
      services: services.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.name || !entry.code) {
          return [];
        }

        return [
          {
            id: asString(entry.id),
            name: asString(entry.name),
            code: asString(entry.code),
            description: asNullableString(entry.description),
            serviceType: asString(entry.serviceType),
            durationMinutes: asNullableNumber(entry.durationMinutes),
            listPrice: asNumber(entry.listPrice),
            currencyCode: asString(entry.currencyCode) || "BRL",
            active: asBoolean(entry.active),
          },
        ];
      }),
      packages: packages.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.name || !entry.code) {
          return [];
        }

        return [
          {
            id: asString(entry.id),
            name: asString(entry.name),
            code: asString(entry.code),
            description: asNullableString(entry.description),
            packageType: asString(entry.packageType),
            billingModel: asString(entry.billingModel),
            tier: asNullableString(entry.tier),
            price: asNumber(entry.price),
            currencyCode: asString(entry.currencyCode) || "BRL",
            featured: asBoolean(entry.featured),
            active: asBoolean(entry.active),
            serviceCount: asNumber(entry.serviceCount),
          },
        ];
      }),
      packageServices: packageServices.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.packageId || !entry.serviceId) {
          return [];
        }

        return [
          {
            id: asString(entry.id),
            packageId: asString(entry.packageId),
            serviceId: asString(entry.serviceId),
            quantity: asNumber(entry.quantity),
            required: asBoolean(entry.required),
            notes: asNullableString(entry.notes),
            itemPriceOverride: asNullableNumber(entry.itemPriceOverride),
          },
        ];
      }),
      programs: programs.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.name || !entry.code) {
          return [];
        }

        return [
          {
            id: asString(entry.id),
            name: asString(entry.name),
            code: asString(entry.code),
            description: asNullableString(entry.description),
            programType: asString(entry.programType),
            durationDays: asNullableNumber(entry.durationDays),
            featured: asBoolean(entry.featured),
            active: asBoolean(entry.active),
            packageCount: asNumber(entry.packageCount),
          },
        ];
      }),
      programPackages: programPackages.flatMap((entry) => {
        if (!isRecord(entry) || !entry.id || !entry.programId || !entry.packageId) {
          return [];
        }

        return [
          {
            id: asString(entry.id),
            programId: asString(entry.programId),
            packageId: asString(entry.packageId),
            sortOrder: asNumber(entry.sortOrder),
            recommended: asBoolean(entry.recommended),
          },
        ];
      }),
    };
  }

  private isRealAuthEnabled() {
    return (process.env.API_AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "mock") === "real";
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
  }
}

function resolveStageCode(stageCode: string | undefined, leadStatus: LeadStatus) {
  return stageCode ?? mapLeadStatusToStageCode(leadStatus);
}

function buildLeadTimeline(lead: KanbanLeadRow) {
  const activityItems = lead.activities.map((activity) => ({
    id: `activity-${activity.id}`,
    kind: "activity" as const,
    title: formatActivityTitle(activity.activityType),
    description: formatActivityDescription(activity),
    date: activity.completedAt ?? activity.createdAt,
  }));

  const stageItems = lead.stageHistory.map((history) => ({
    id: `stage-${history.id}`,
    kind: "stage" as const,
    title: `Etapa alterada para ${history.stage?.name ?? "Etapa do pipeline"}`,
    description: history.user?.fullName
      ? `Atualizado por ${history.user.fullName}.`
      : "Atualizado pelo time comercial.",
    date: history.changedAt,
  }));

  return [...activityItems, ...stageItems]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 8)
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description,
      dateLabel: formatRelativeDateTime(item.date),
    }));
}

function mapStageCodeToLeadStatus(stageCode: string) {
  switch (stageCode) {
    case "contacted":
      return LeadStatus.CONTACTED;
    case "qualified":
      return LeadStatus.QUALIFIED;
    case "appointment_booked":
    case "scheduled":
      return LeadStatus.APPOINTMENT_BOOKED;
    case "proposal_sent":
    case "proposal":
      return LeadStatus.PROPOSAL_SENT;
    case "won":
    case "closed":
      return LeadStatus.WON;
    case "lost":
      return LeadStatus.LOST;
    default:
      return LeadStatus.NEW;
  }
}

function formatActivityTitle(activityType: ActivityType) {
  switch (activityType) {
    case ActivityType.CALL:
      return "Ligacao registrada";
    case ActivityType.MESSAGE:
      return "Mensagem registrada";
    case ActivityType.EMAIL:
      return "Email registrado";
    case ActivityType.MEETING:
      return "Reuniao registrada";
    case ActivityType.NOTE:
      return "Observacao comercial";
    case ActivityType.TASK:
    default:
      return "Tarefa comercial";
  }
}

function formatActivityDescription(activity: KanbanLeadRow["activities"][number]) {
  const baseDescription = activity.description?.trim() || "Atividade comercial registrada.";
  const ownerLabel = activity.assignedUser?.fullName
    ? `Responsavel: ${activity.assignedUser.fullName}.`
    : "Responsavel: time comercial.";

  if (activity.dueAt) {
    return `${baseDescription} ${ownerLabel} Prazo ${formatRelativeDateTime(activity.dueAt)}.`;
  }

  return `${baseDescription} ${ownerLabel}`;
}

function mapLeadActivity(activity: LeadActivityRow) {
  return {
    id: activity.id,
    activityType: activity.activityType,
    title: formatActivityTitle(activity.activityType),
    description: activity.description ?? "Atividade comercial registrada.",
    dueAt: activity.dueAt?.toISOString() ?? null,
    completedAt: activity.completedAt?.toISOString() ?? null,
    createdAt: activity.createdAt.toISOString(),
    assignedTo: activity.assignedUser?.fullName ?? "Time comercial",
  };
}

function normalizeActivityType(value?: string) {
  const normalizedValue = value?.trim().toUpperCase();

  switch (normalizedValue) {
    case "CALL":
      return ActivityType.CALL;
    case "MESSAGE":
      return ActivityType.MESSAGE;
    case "NOTE":
      return ActivityType.NOTE;
    case "EMAIL":
      return ActivityType.EMAIL;
    case "MEETING":
      return ActivityType.MEETING;
    case undefined:
    case "":
    case "TASK":
      return ActivityType.TASK;
    default:
      throw new BadRequestException("Tipo de atividade comercial invalido.");
  }
}

function parseActivityDueAt(value?: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!value.trim()) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException("Prazo de atividade comercial invalido.");
  }

  return date;
}

function normalizeRuntimeActivityType(value: string) {
  switch (value.toUpperCase()) {
    case "CALL":
      return ActivityType.CALL;
    case "MESSAGE":
      return ActivityType.MESSAGE;
    case "NOTE":
      return ActivityType.NOTE;
    case "EMAIL":
      return ActivityType.EMAIL;
    case "MEETING":
      return ActivityType.MEETING;
    default:
      return ActivityType.TASK;
  }
}

function parseRuntimeDate(value: string | null | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : false;
}
