import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
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
import { resolvePipelineId, resolveTenantId, resolveUserId } from "../../common/scope.ts";
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
  }) {
    const tenantId = await resolveTenantId(this.prisma);
    const pipelineId = await resolvePipelineId(this.prisma, tenantId);
    const salesUserId = await resolveUserId(
      this.prisma,
      tenantId,
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

    await this.prisma.$transaction([
      this.prisma.activity.create({
        data: {
          leadId: lead.id,
          assignedUserId: salesUserId,
          activityType: ActivityType.TASK,
          description: "Realizar primeiro contato com este lead.",
        },
      }),
      ...(firstStage
        ? [
            this.prisma.leadStageHistory.create({
              data: {
                leadId: lead.id,
                stageId: firstStage.id,
                changedBy: salesUserId,
              },
            }),
          ]
        : []),
    ]);

    return {
      id: lead.id,
      name: lead.fullName,
      status: lead.status,
    };
  }

  async getKanban() {
    const tenantId = await resolveTenantId(this.prisma);
    const pipelineId = await resolvePipelineId(this.prisma, tenantId);

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
    const tenantId = await resolveTenantId(this.prisma);
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

  async listActivities(id: string) {
    const tenantId = await resolveTenantId(this.prisma);

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
  ) {
    const tenantId = await resolveTenantId(this.prisma);

    await this.prisma.lead.findFirstOrThrow({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const assignedUserId = await resolveUserId(
      this.prisma,
      tenantId,
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
    }
  ) {
    const tenantId = await resolveTenantId(this.prisma);

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

    return mapLeadActivity(updatedActivity);
  }

  async moveStage(id: string, dto: { stageCode: string }) {
    const tenantId = await resolveTenantId(this.prisma);
    const pipelineId = await resolvePipelineId(this.prisma, tenantId);
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
      resolveUserId(this.prisma, tenantId, process.env.DEFAULT_SALES_EMAIL),
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

    await this.prisma.$transaction([
      this.prisma.lead.update({
        where: { id: lead.id },
        data: { status },
      }),
      this.prisma.leadStageHistory.create({
        data: {
          leadId: lead.id,
          stageId: stage.id,
          changedBy,
        },
      }),
    ]);

    return {
      id: lead.id,
      stageCode: stage.code,
      stage: stage.name,
      status,
    };
  }

  async convert(id: string) {
    const tenantId = await resolveTenantId(this.prisma);
    const pipelineId = await resolvePipelineId(this.prisma, tenantId);
    const convertedBy = await resolveUserId(
      this.prisma,
      tenantId,
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

    return {
      id: lead.id,
      patientId,
      converted: true,
      reusedExistingPatient: Boolean(existingPatient),
    };
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
