import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  ConfirmationChannel,
  ConfirmationStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import { formatTime, mapAppointmentStatusLabel } from "../../common/presenters.ts";
import { resolveTenantId, resolveUnitId, resolveUserId } from "../../common/scope.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

@Injectable()
export class SchedulingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: {
    patientId: string;
    appointmentTypeId: string;
    professionalId?: string;
    startsAt: string;
    endsAt: string;
    notes?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);
    const unitId = await resolveUnitId(this.prisma, tenantId, process.env.DEFAULT_UNIT_CODE);
    const receptionistId = await resolveUserId(
      this.prisma,
      tenantId,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        unitId,
        patientId: dto.patientId,
        professionalId: dto.professionalId,
        appointmentTypeId: dto.appointmentTypeId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        status: "SCHEDULED",
        source: "INTERNAL",
        notes: dto.notes,
        createdBy: receptionistId,
      },
    });

    return {
      id: appointment.id,
      status: appointment.status,
    };
  }

  async list(params?: {
    date?: string;
    status?: string;
    professional?: string;
    unit?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);
    const targetDate = parseTargetDate(params?.date);
    const status = normalizeAppointmentStatus(params?.status);
    const professional = normalizeTextFilter(params?.professional);
    const unit = normalizeTextFilter(params?.unit);

    const dayStart = new Date(targetDate);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(targetDate);
    dayEnd.setHours(23, 59, 59, 999);

    const baseSelect = {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      patient: { select: { fullName: true } },
      appointmentType: { select: { name: true } },
      professional: { select: { displayName: true } },
      resource: { select: { name: true } },
      unit: { select: { name: true } },
    } as const;

    let appointments = await this.prisma.appointment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        startsAt: { gte: dayStart, lte: dayEnd },
        ...(status ? { status } : {}),
        ...(professional
          ? {
              professional: {
                is: {
                  displayName: {
                    contains: professional,
                    mode: "insensitive" as const,
                  },
                },
              },
            }
          : {}),
        ...(unit
          ? {
              unit: {
                is: {
                  name: {
                    contains: unit,
                    mode: "insensitive" as const,
                  },
                },
              },
            }
          : {}),
      },
      orderBy: { startsAt: "asc" },
      select: baseSelect,
    });

    if (!appointments.length && !params?.date && !status && !professional && !unit) {
      appointments = await this.prisma.appointment.findMany({
        where: {
          tenantId,
          deletedAt: null,
          startsAt: { gte: new Date() },
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        },
        orderBy: { startsAt: "asc" },
        take: 12,
        select: baseSelect,
      });
    }

    interface AppointmentListItem {
      id: string;
      time: string;
      startsAt: string;
      endsAt: string;
      patient: string;
      type: string;
      professional: string;
      room: string;
      status: string;
    }

    interface AppointmentListResponse {
      items: AppointmentListItem[];
    }

    interface AppointmentFromQuery {
      id: string;
      startsAt: Date;
      endsAt: Date;
      status: AppointmentStatus;
      patient: { fullName: string };
      appointmentType: { name: string };
      professional: { displayName: string } | null;
      resource: { name: string } | null;
      unit: { name: string };
    }

    return {
      items: appointments.map((appointment: AppointmentFromQuery): AppointmentListItem => ({
        id: appointment.id,
        time: formatTime(appointment.startsAt),
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        patient: appointment.patient.fullName,
        type: appointment.appointmentType.name,
        professional: appointment.professional?.displayName ?? "Equipe clinica",
        room: appointment.resource?.name ?? appointment.unit.name,
        status: mapAppointmentStatusLabel(appointment.status),
      })),
    } as AppointmentListResponse;
  }

  async checkIn(id: string) {
    const tenantId = await resolveTenantId(this.prisma);
    const checkedInBy = await resolveUserId(
      this.prisma,
      tenantId,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    const blockedForCheckIn: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];

    if (blockedForCheckIn.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel registrar check-in para este agendamento.");
    }

    const alreadyCheckedInStatuses: AppointmentStatus[] = [
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.COMPLETED,
    ];

    if (alreadyCheckedInStatuses.includes(appointment.status)) {
      return {
        id: appointment.id,
        status: mapAppointmentStatusLabel(appointment.status),
      };
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.checkin.create({
        data: {
          appointmentId: appointment.id,
          checkinType: "FRONTDESK",
          checkedInBy,
        },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CHECKED_IN,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async confirm(id: string) {
    const tenantId = await resolveTenantId(this.prisma);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    if (appointment.status === AppointmentStatus.CONFIRMED) {
      return {
        id: appointment.id,
        status: mapAppointmentStatusLabel(appointment.status),
      };
    }

    const blockedForConfirmation: AppointmentStatus[] = [
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];

    if (blockedForConfirmation.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel confirmar este agendamento.");
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.appointmentConfirmation.create({
        data: {
          appointmentId: appointment.id,
          channel: ConfirmationChannel.MANUAL,
          status: ConfirmationStatus.CONFIRMED,
          respondedAt: new Date(),
        },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CONFIRMED,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async cancel(id: string, dto?: { reason?: string }) {
    const tenantId = await resolveTenantId(this.prisma);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        notes: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    if (appointment.status === AppointmentStatus.CANCELLED) {
      return {
        id: appointment.id,
        status: mapAppointmentStatusLabel(appointment.status),
      };
    }

    const blockedForCancellation: AppointmentStatus[] = [
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.NO_SHOW,
    ];

    if (blockedForCancellation.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel cancelar este agendamento.");
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.appointmentConfirmation.create({
        data: {
          appointmentId: appointment.id,
          channel: ConfirmationChannel.MANUAL,
          status: ConfirmationStatus.DECLINED,
          respondedAt: new Date(),
          metadataJson: dto?.reason ? { reason: dto.reason } : undefined,
        },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          notes: appendOperationalNote(
            appointment.notes,
            dto?.reason
              ? `Cancelamento manual: ${dto.reason}`
              : "Cancelamento manual registrado na agenda."
          ),
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async reschedule(id: string, dto: { startsAt: string; endsAt: string; reason?: string }) {
    const tenantId = await resolveTenantId(this.prisma);

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        status: true,
        notes: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    const blockedForReschedule: AppointmentStatus[] = [
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.COMPLETED,
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
    ];

    if (blockedForReschedule.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel remarcar este agendamento.");
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException("Periodo de remarcacao invalido.");
    }

    const updatedAppointment = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        startsAt,
        endsAt,
        status: AppointmentStatus.SCHEDULED,
        notes: appendOperationalNote(
          appointment.notes,
          dto.reason
            ? `Remarcacao manual: ${dto.reason}`
            : "Remarcacao manual registrada na agenda."
        ),
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
      startsAt: updatedAppointment.startsAt.toISOString(),
      endsAt: updatedAppointment.endsAt.toISOString(),
    };
  }

  async markNoShow(id: string, dto?: { reason?: string }) {
    const tenantId = await resolveTenantId(this.prisma);
    const recordedBy = await resolveUserId(
      this.prisma,
      tenantId,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        patientId: true,
        status: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    const blockedForNoShow: AppointmentStatus[] = [
      AppointmentStatus.CHECKED_IN,
      AppointmentStatus.IN_PROGRESS,
      AppointmentStatus.COMPLETED,
    ];

    if (blockedForNoShow.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel registrar no-show para este agendamento.");
    }

    if (appointment.status === AppointmentStatus.NO_SHOW) {
      return {
        id: appointment.id,
        status: mapAppointmentStatusLabel(appointment.status),
      };
    }

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.noShowRecord.upsert({
        where: {
          appointmentId: appointment.id,
        },
        update: {
          recordedBy,
          reason: dto?.reason,
        },
        create: {
          appointmentId: appointment.id,
          patientId: appointment.patientId,
          recordedBy,
          reason: dto?.reason,
        },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.NO_SHOW,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }
}

function parseTargetDate(value?: string) {
  if (!value) {
    return new Date();
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeAppointmentStatus(value?: string) {
  const normalizedValue = normalizeTextFilter(value)?.toLowerCase();

  switch (normalizedValue) {
    case "agendado":
    case "scheduled":
      return AppointmentStatus.SCHEDULED;
    case "confirmado":
    case "confirmed":
      return AppointmentStatus.CONFIRMED;
    case "check-in":
    case "checkin":
    case "checked_in":
      return AppointmentStatus.CHECKED_IN;
    case "em atendimento":
    case "in progress":
    case "in_progress":
      return AppointmentStatus.IN_PROGRESS;
    case "concluido":
    case "concluida":
    case "completed":
      return AppointmentStatus.COMPLETED;
    case "cancelado":
    case "cancelada":
    case "cancelled":
      return AppointmentStatus.CANCELLED;
    case "no-show":
    case "noshow":
    case "no_show":
      return AppointmentStatus.NO_SHOW;
    default:
      return undefined;
  }
}

function normalizeTextFilter(value?: string) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

function appendOperationalNote(currentNotes: string | null, nextNote: string) {
  const normalizedCurrent = currentNotes?.trim();
  return normalizedCurrent ? `${normalizedCurrent}\n${nextNote}` : nextNote;
}
