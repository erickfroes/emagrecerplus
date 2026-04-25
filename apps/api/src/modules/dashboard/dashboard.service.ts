import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  ClinicalTaskStatus,
  LeadStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import {
  buildPipelineSummary,
  formatRelativeDateTime,
  mapLeadStatusToStageCode,
} from "../../common/presenters.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import {
  resolveTenantIdForRequest,
  resolveUnitIdForRequest,
} from "../../common/auth/request-context.ts";
import { syncCommercialRuntimeProjection } from "../../common/runtime/runtime-commercial-projection.ts";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type DashboardPipelineLead = {
  status: LeadStatus;
  stageHistory: Array<{
    stage: { code: string } | null;
  }>;
};

type RuntimeDashboardSummary = {
  stats: {
    scheduledToday: number;
    completedToday: number;
    noShows7d: number;
    openClinicalTasks: number;
  };
  todayAppointments: Array<{
    id: string;
    time: string;
    patient: string;
    type: string;
    professional: string;
    status: "scheduled" | "confirmed" | "completed" | "no_show";
  }>;
  alerts: Array<{
    id: string;
    title: string;
    description: string;
  }>;
};

type RuntimeCommercialSummary = {
  openLeads: number;
  pipeline: Array<{
    code: string;
    title: string;
    count: number;
  }>;
  hotLead: {
    id: string;
    fullName: string;
    lastContactAt: string | null;
  } | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.getSummaryFromRuntime(context, authorization);
    }

    return this.getSummaryFromLegacyPrisma(context);
  }

  private async getSummaryFromRuntime(
    context?: AppRequestContext,
    authorization?: string
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    await syncCommercialRuntimeProjection(this.prisma, tenantId);

    const requestClient = createSupabaseRequestClient(accessToken);
    const [dashboardResult, commercialResult] = await Promise.all([
      requestClient.rpc("dashboard_operational_summary", {
        p_current_legacy_unit_id: context?.currentUnitId ?? null,
      }),
      requestClient.rpc("crm_operational_summary", {
        p_pipeline_code: process.env.DEFAULT_PIPELINE_CODE ?? "default-sales",
      }),
    ]);

    if (dashboardResult.error) {
      throw new BadRequestException(
        `Falha ao consultar dashboard operacional no runtime: ${dashboardResult.error.message}`
      );
    }

    if (
      !dashboardResult.data ||
      typeof dashboardResult.data !== "object" ||
      Array.isArray(dashboardResult.data)
    ) {
      throw new BadRequestException(
        "RPC dashboard_operational_summary retornou um payload invalido."
      );
    }

    if (commercialResult.error) {
      throw new BadRequestException(
        `Falha ao consultar resumo comercial no runtime: ${commercialResult.error.message}`
      );
    }

    if (!commercialResult.data || typeof commercialResult.data !== "object" || Array.isArray(commercialResult.data)) {
      throw new BadRequestException(
        "RPC crm_operational_summary retornou um payload invalido."
      );
    }

    const runtimeSummary = this.parseRuntimeDashboardSummary(
      dashboardResult.data as Record<string, unknown>
    );
    const commercialSummary = this.parseRuntimeCommercialSummary(
      commercialResult.data as Record<string, unknown>
    );
    const now = new Date();
    const alerts = commercialSummary.hotLead
      ? [
          {
            id: commercialSummary.hotLead.id,
            title: "Lead quente aguardando retorno",
            description: `${commercialSummary.hotLead.fullName} sem nova abordagem desde ${formatRelativeDateTime(
              parseIsoDate(commercialSummary.hotLead.lastContactAt, now)
            )}.`,
          },
        ]
      : [];

    return {
      stats: {
        scheduledToday: runtimeSummary.stats.scheduledToday,
        completedToday: runtimeSummary.stats.completedToday,
        noShows7d: runtimeSummary.stats.noShows7d,
        openLeads: commercialSummary.openLeads,
        openClinicalTasks: runtimeSummary.stats.openClinicalTasks,
      },
      todayAppointments: runtimeSummary.todayAppointments,
      alerts: [...runtimeSummary.alerts, ...alerts].slice(0, 5),
      pipeline: commercialSummary.pipeline,
    };
  }

  private async getSummaryFromLegacyPrisma(context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(this.prisma, context);
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date(now);
    todayEnd.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [
      scheduledToday,
      completedToday,
      noShows7d,
      openClinicalTasks,
      appointmentsToday,
      commercialSummary,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          tenantId,
          unitId: currentUnitId,
          deletedAt: null,
          startsAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          unitId: currentUnitId,
          deletedAt: null,
          startsAt: { gte: todayStart, lte: todayEnd },
          status: AppointmentStatus.COMPLETED,
        },
      }),
      this.prisma.noShowRecord.count({
        where: {
          appointment: {
            is: {
              unitId: currentUnitId,
            },
          },
          patient: { tenantId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
      this.prisma.clinicalTask.count({
        where: {
          tenantId,
          deletedAt: null,
          OR: [
            {
              encounter: {
                is: {
                  unitId: currentUnitId,
                },
              },
            },
            { encounterId: null },
          ],
          status: {
            in: [ClinicalTaskStatus.OPEN, ClinicalTaskStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          unitId: currentUnitId,
          deletedAt: null,
          startsAt: { gte: todayStart, lte: todayEnd },
        },
        orderBy: { startsAt: "asc" },
        take: 8,
        select: {
          id: true,
          startsAt: true,
          status: true,
          patient: { select: { fullName: true } },
          appointmentType: { select: { name: true } },
          professional: { select: { displayName: true } },
        },
      }),
      this.getCommercialSummaryFromLegacyPrisma(context),
    ]);

    return {
      stats: {
        scheduledToday,
        completedToday,
        noShows7d,
        openLeads: commercialSummary.openLeads,
        openClinicalTasks,
      },
      todayAppointments: appointmentsToday.map((item) => ({
        id: item.id,
        time: item.startsAt.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
          timeZone: process.env.APP_TIMEZONE ?? "America/Araguaina",
        }),
        patient: item.patient.fullName,
        type: item.appointmentType.name,
        professional: item.professional?.displayName ?? "Equipe clinica",
        status: mapLegacyDashboardAppointmentStatus(item.status),
      })),
      alerts: commercialSummary.alerts,
      pipeline: commercialSummary.pipeline,
    };
  }

  private async getCommercialSummaryFromLegacyPrisma(context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const now = new Date();

    const [openLeads, hotLead, leadsForPipeline] = await Promise.all([
      this.prisma.lead.count({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [
              LeadStatus.NEW,
              LeadStatus.CONTACTED,
              LeadStatus.QUALIFIED,
              LeadStatus.APPOINTMENT_BOOKED,
              LeadStatus.PROPOSAL_SENT,
            ],
          },
        },
      }),
      this.prisma.lead.findFirst({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [LeadStatus.NEW, LeadStatus.CONTACTED, LeadStatus.QUALIFIED],
          },
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          fullName: true,
          activities: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      this.prisma.lead.findMany({
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
      }),
    ]);

    const pipeline = buildPipelineSummary(
      leadsForPipeline.map(
        (lead: DashboardPipelineLead) =>
          lead.stageHistory[0]?.stage?.code ?? mapLeadStatusToStageCode(lead.status)
      )
    );

    const alerts = hotLead
      ? [
          {
            id: hotLead.id,
            title: "Lead quente aguardando retorno",
            description: `${hotLead.fullName} sem nova abordagem desde ${formatRelativeDateTime(
              hotLead.activities[0]?.createdAt ?? now
            )}.`,
          },
        ]
      : [];

    return {
      openLeads,
      pipeline,
      alerts,
    };
  }

  private parseRuntimeDashboardSummary(payload: Record<string, unknown>): RuntimeDashboardSummary {
    const stats = isRecord(payload.stats) ? payload.stats : {};
    const todayAppointments = Array.isArray(payload.todayAppointments)
      ? payload.todayAppointments
      : [];
    const alerts = Array.isArray(payload.alerts) ? payload.alerts : [];

    return {
      stats: {
        scheduledToday: asNumber(stats.scheduledToday),
        completedToday: asNumber(stats.completedToday),
        noShows7d: asNumber(stats.noShows7d),
        openClinicalTasks: asNumber(stats.openClinicalTasks),
      },
      todayAppointments: todayAppointments.flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }

        return [
          {
            id: asString(item.id),
            time: asString(item.time),
            patient: asString(item.patient),
            type: asString(item.type),
            professional: asString(item.professional),
            status: normalizeRuntimeDashboardStatus(item.status),
          },
        ];
      }),
      alerts: alerts.flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }

        return [
          {
            id: asString(item.id),
            title: asString(item.title),
            description: asString(item.description),
          },
        ];
      }),
    };
  }

  private parseRuntimeCommercialSummary(payload: Record<string, unknown>): RuntimeCommercialSummary {
    const pipeline = Array.isArray(payload.pipeline) ? payload.pipeline : [];

    return {
      openLeads: asNumber(payload.openLeads),
      pipeline: pipeline.flatMap((item) => {
        if (!isRecord(item)) {
          return [];
        }

        return [
          {
            code: asString(item.code),
            title: asString(item.title),
            count: asNumber(item.count),
          },
        ];
      }),
      hotLead: isRecord(payload.hotLead)
        ? {
            id: asString(payload.hotLead.id),
            fullName: asString(payload.hotLead.fullName),
            lastContactAt: asNullableString(payload.hotLead.lastContactAt),
          }
        : null,
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

function mapLegacyDashboardAppointmentStatus(status: string) {
  switch (status) {
    case "COMPLETED":
      return "completed";
    case "CONFIRMED":
      return "confirmed";
    case "NO_SHOW":
      return "no_show";
    default:
      return "scheduled";
  }
}

function normalizeRuntimeDashboardStatus(value: unknown) {
  switch (value) {
    case "completed":
    case "confirmed":
    case "no_show":
      return value;
    default:
      return "scheduled";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function parseIsoDate(value: string | null | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}
