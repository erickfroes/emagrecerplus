import { Injectable } from "@nestjs/common";
import {
  AppointmentStatus,
  ClinicalTaskStatus,
  FlagSeverity,
  LeadStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import {
  buildPipelineSummary,
  formatRelativeDateTime,
  formatTime,
  mapDashboardAppointmentStatus,
  mapLeadStatusToStageCode,
} from "../../common/presenters.ts";
import { resolveTenantId } from "../../common/scope.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type DashboardPipelineLead = {
  status: LeadStatus;
  stageHistory: Array<{
    stage: { code: string } | null;
  }>;
};

type DashboardAlertFlag = {
  id: string;
  flagType: string;
  description: string | null;
  patient: { fullName: string };
};

type DashboardNoShow = {
  id: string;
  createdAt: Date;
  reason: string | null;
  patient: { fullName: string };
};

type DashboardAgendaItem = {
  id: string;
  startsAt: Date;
  status: AppointmentStatus;
  patient: { fullName: string };
  appointmentType: { name: string };
  professional: { displayName: string } | null;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const tenantId = await resolveTenantId(this.prisma);
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
      openLeads,
      openClinicalTasks,
      appointmentsToday,
      upcomingAppointments,
      riskyFlags,
      recentNoShows,
      hotLead,
      leadsForPipeline,
    ] = await Promise.all([
      this.prisma.appointment.count({
        where: {
          tenantId,
          deletedAt: null,
          startsAt: { gte: todayStart, lte: todayEnd },
        },
      }),
      this.prisma.appointment.count({
        where: {
          tenantId,
          deletedAt: null,
          startsAt: { gte: todayStart, lte: todayEnd },
          status: AppointmentStatus.COMPLETED,
        },
      }),
      this.prisma.noShowRecord.count({
        where: {
          patient: { tenantId },
          createdAt: { gte: sevenDaysAgo },
        },
      }),
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
      this.prisma.clinicalTask.count({
        where: {
          tenantId,
          deletedAt: null,
          status: {
            in: [ClinicalTaskStatus.OPEN, ClinicalTaskStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.appointment.findMany({
        where: {
          tenantId,
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
      this.prisma.appointment.findMany({
        where: {
          tenantId,
          deletedAt: null,
          startsAt: { gte: now },
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
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
      this.prisma.patientFlag.findMany({
        where: {
          tenantId,
          active: true,
          severity: { in: [FlagSeverity.HIGH, FlagSeverity.CRITICAL] },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: {
          id: true,
          flagType: true,
          description: true,
          patient: { select: { fullName: true } },
        },
      }),
      this.prisma.noShowRecord.findMany({
        where: {
          patient: { tenantId },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: "desc" },
        take: 2,
        select: {
          id: true,
          createdAt: true,
          patient: { select: { fullName: true } },
          reason: true,
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

    const agendaSource = appointmentsToday.length ? appointmentsToday : upcomingAppointments;
    const pipeline = buildPipelineSummary(
      leadsForPipeline.map(
        (lead: DashboardPipelineLead) =>
          lead.stageHistory[0]?.stage?.code ?? mapLeadStatusToStageCode(lead.status)
      )
    );

    const alerts = [
      ...riskyFlags.map((flag: DashboardAlertFlag) => ({
        id: flag.id,
        title: `${flag.patient.fullName} com alerta ativo`,
        description: flag.description ?? `Flag ${flag.flagType} ativa no cadastro.`,
      })),
      ...recentNoShows.map((record: DashboardNoShow) => ({
        id: record.id,
        title: `No-show recente de ${record.patient.fullName}`,
        description: record.reason ?? `Ocorrencia registrada em ${formatRelativeDateTime(record.createdAt)}.`,
      })),
      ...(hotLead
        ? [
            {
              id: hotLead.id,
              title: "Lead quente aguardando retorno",
              description: `${hotLead.fullName} sem nova abordagem desde ${formatRelativeDateTime(
                hotLead.activities[0]?.createdAt ?? now
              )}.`,
            },
          ]
        : []),
    ].slice(0, 5);

    return {
      stats: {
        scheduledToday,
        completedToday,
        noShows7d,
        openLeads,
        openClinicalTasks,
      },
      todayAppointments: agendaSource.map((item: DashboardAgendaItem) => ({
        id: item.id,
        time: formatTime(item.startsAt),
        patient: item.patient.fullName,
        type: item.appointmentType.name,
        professional: item.professional?.displayName ?? "Equipe clinica",
        status: mapDashboardAppointmentStatus(item.status),
      })),
      alerts,
      pipeline,
    };
  }
}
