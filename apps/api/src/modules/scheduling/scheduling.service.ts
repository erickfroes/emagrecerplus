import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  ConfirmationChannel,
  ConfirmationStatus,
  EncounterStatus,
  EncounterType,
} from "../../../../../generated/prisma/client/enums.ts";
import { formatTime, mapAppointmentStatusLabel } from "../../common/presenters.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import {
  resolveActorUserIdForRequest,
  resolveTenantIdForRequest,
  resolveUnitIdForRequest,
} from "../../common/auth/request-context.ts";
import {
  cancelRuntimeAppointment,
  enqueueRuntimePatient,
  confirmRuntimeAppointment,
  createRuntimeAppointment,
  registerRuntimeAppointmentCheckin,
  registerRuntimeAppointmentNoShow,
  rescheduleRuntimeAppointment,
  syncRuntimeAppointmentProjection,
} from "../../common/runtime/runtime-appointment-writes.ts";
import { startRuntimeEncounterFromLegacy } from "../../common/runtime/runtime-encounter-writes.ts";
import { syncPatientRuntimeProjection } from "../../common/runtime/runtime-patient-projection.ts";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type RuntimeAppointmentListRow = {
  id: string;
  runtimeId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string | null;
  patient: string | null;
  type: string | null;
  professional: string | null;
  room: string | null;
};

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
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const unitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const receptionistId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
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

    await this.runRuntimeAppointmentOperationWithFallback(
      "create_appointment",
      appointment.id,
      appointment.patientId,
      () =>
        createRuntimeAppointment({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          legacyUnitId: appointment.unitId,
          legacyPatientId: appointment.patientId,
          legacyAppointmentTypeId: appointment.appointmentTypeId,
          startsAt: appointment.startsAt.toISOString(),
          endsAt: appointment.endsAt.toISOString(),
          legacyProfessionalId: appointment.professionalId,
          notes: appointment.notes,
          source: appointment.source.toLowerCase(),
          legacyCreatedByUserId: appointment.createdBy,
          createdAt: appointment.createdAt.toISOString(),
          updatedAt: appointment.updatedAt.toISOString(),
          deletedAt: appointment.deletedAt?.toISOString() ?? null,
          metadata: {
            flow: "appointments",
            operation: "create",
          },
        }),
      {
        flow: "appointments",
        operation: "create",
      }
    );

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
  }, context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.listFromRuntime(params, context, authorization);
    }

    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
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
        unitId: currentUnitId,
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
          unitId: currentUnitId,
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

  private async listFromRuntime(
    params?: {
      date?: string;
      status?: string;
      professional?: string;
      unit?: string;
    },
    context?: AppRequestContext,
    authorization?: string
  ) {
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    const status = normalizeAppointmentStatus(params?.status);
    const { data, error } = await requestClient.rpc("list_appointments", {
      p_date: formatRuntimeDateFilter(params?.date),
      p_status: status ? status.toLowerCase() : null,
      p_professional: normalizeTextFilter(params?.professional) ?? null,
      p_unit: normalizeTextFilter(params?.unit) ?? null,
      p_current_legacy_unit_id: context?.currentUnitId ?? null,
    });

    if (error) {
      throw new BadRequestException(`Falha ao consultar agenda no runtime: ${error.message}`);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new BadRequestException("RPC list_appointments retornou um payload invalido.");
    }

    const payload = data as { items?: unknown };
    const items = Array.isArray(payload.items) ? payload.items : [];

    return {
      items: items.flatMap((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
          return [];
        }

        const appointment = entry as RuntimeAppointmentListRow;
        const startsAt = appointment.startsAt ? new Date(appointment.startsAt) : null;
        const endsAt = appointment.endsAt ? new Date(appointment.endsAt) : null;

        if (
          !appointment.id ||
          !startsAt ||
          Number.isNaN(startsAt.getTime()) ||
          !endsAt ||
          Number.isNaN(endsAt.getTime())
        ) {
          return [];
        }

        return [
          {
            id: appointment.id,
            time: formatTime(startsAt),
            startsAt: startsAt.toISOString(),
            endsAt: endsAt.toISOString(),
            patient: appointment.patient ?? "Paciente",
            type: appointment.type ?? "Consulta",
            professional: appointment.professional ?? "Equipe clinica",
            room: appointment.room ?? "Unidade",
            status: mapRuntimeAppointmentStatusLabel(appointment.status),
          },
        ];
      }),
    };
  }

  async checkIn(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const checkedInBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
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

    const checkedInAt = new Date();

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.checkin.create({
        data: {
          appointmentId: appointment.id,
          checkinType: "FRONTDESK",
          checkedInBy,
          checkedInAt,
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

    await this.runRuntimeAppointmentOperationWithFallback(
      "register_checkin",
      appointment.id,
      appointment.patientId,
      () =>
        registerRuntimeAppointmentCheckin({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          checkedInAt: checkedInAt.toISOString(),
          legacyActorUserId: checkedInBy,
          metadata: {
            flow: "appointments",
            operation: "check_in",
          },
        }),
      {
        flow: "appointments",
        operation: "check_in",
        checkedInAt,
      }
    );

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async enqueue(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const enqueuedBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        patientId: true,
        status: true,
        notes: true,
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    if (appointment.status !== AppointmentStatus.CHECKED_IN) {
      throw new BadRequestException("O paciente precisa estar em check-in para entrar na fila.");
    }

    if (!this.isRealAuthEnabled()) {
      return {
        id: appointment.id,
        status: mapAppointmentStatusLabel(appointment.status),
        queueStatus: mapQueueStatusLabel("waiting"),
      };
    }

    const enqueuedAt = new Date();
    const queueResult = await enqueueRuntimePatient({
      legacyTenantId: tenantId,
      legacyAppointmentId: appointment.id,
      enqueuedAt: enqueuedAt.toISOString(),
      notes: appointment.notes,
      legacyActorUserId: enqueuedBy,
      metadata: {
        flow: "appointments",
        operation: "enqueue_patient",
      },
    });

    return {
      id: appointment.id,
      status: mapAppointmentStatusLabel(appointment.status),
      queueStatus: mapQueueStatusLabel(queueResult.queueStatus),
    };
  }

  async startEncounter(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        unitId: true,
        patientId: true,
        professionalId: true,
        status: true,
        startsAt: true,
        appointmentType: {
          select: {
            code: true,
            name: true,
          },
        },
        encounter: {
          select: {
            id: true,
            status: true,
            encounterType: true,
            openedAt: true,
          },
        },
      },
    });

    if (!appointment) {
      throw new NotFoundException("Agendamento nao encontrado para o tenant atual.");
    }

    if (!appointment.professionalId) {
      throw new BadRequestException("Nao e possivel iniciar atendimento sem profissional responsavel.");
    }

    const blockedStatuses: AppointmentStatus[] = [
      AppointmentStatus.CANCELLED,
      AppointmentStatus.NO_SHOW,
      AppointmentStatus.COMPLETED,
    ];

    if (blockedStatuses.includes(appointment.status)) {
      throw new BadRequestException("Nao e possivel iniciar atendimento para este agendamento.");
    }

    if (appointment.encounter?.status === EncounterStatus.CANCELLED) {
      throw new BadRequestException("O atendimento vinculado a este agendamento foi cancelado.");
    }

    if (appointment.encounter?.status === EncounterStatus.CLOSED) {
      throw new BadRequestException("Este agendamento ja possui um atendimento encerrado.");
    }

    const openedAt = appointment.encounter?.openedAt ?? new Date();
    const encounterType =
      appointment.encounter?.encounterType ??
      resolveEncounterTypeForAppointment(appointment.appointmentType.code, appointment.appointmentType.name);

    const startedEncounter = await this.prisma.$transaction(async (tx: any) => {
      const updatedAppointment =
        appointment.status === AppointmentStatus.IN_PROGRESS
          ? { id: appointment.id, status: appointment.status }
          : await tx.appointment.update({
              where: { id: appointment.id },
              data: {
                status: AppointmentStatus.IN_PROGRESS,
              },
              select: {
                id: true,
                status: true,
              },
            });

      const encounter =
        appointment.encounter ??
        (await tx.encounter.create({
          data: {
            tenantId: appointment.tenantId,
            unitId: appointment.unitId,
            patientId: appointment.patientId,
            appointmentId: appointment.id,
            professionalId: appointment.professionalId,
            encounterType,
            status: EncounterStatus.OPEN,
            openedAt,
          },
          select: {
            id: true,
            status: true,
            encounterType: true,
            openedAt: true,
          },
        }));

      return {
        appointment: updatedAppointment,
        encounter,
      };
    });

    const runtimeStartResult = await this.startRuntimeEncounterWithFallback(
      {
        legacyTenantId: tenantId,
        legacyAppointmentId: appointment.id,
        legacyEncounterId: startedEncounter.encounter.id,
        legacyUnitId: currentUnitId,
        legacyPatientId: appointment.patientId,
        legacyProfessionalId: appointment.professionalId,
        encounterType: startedEncounter.encounter.encounterType.toLowerCase(),
        openedAt: startedEncounter.encounter.openedAt.toISOString(),
        metadata: {
          flow: "appointments",
          operation: "start_encounter",
        },
      },
      appointment.patientId
    );

    return {
      appointmentId: startedEncounter.appointment.id,
      appointmentStatus: mapAppointmentStatusLabel(startedEncounter.appointment.status),
      encounterId: startedEncounter.encounter.id,
      encounterStatus: startedEncounter.encounter.status,
      queueStatus: runtimeStartResult?.queueStatus
        ? mapQueueStatusLabel(runtimeStartResult.queueStatus)
        : null,
    };
  }

  async confirm(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const confirmedBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
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

    const confirmedAt = new Date();

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.appointmentConfirmation.create({
        data: {
          appointmentId: appointment.id,
          channel: ConfirmationChannel.MANUAL,
          status: ConfirmationStatus.CONFIRMED,
          respondedAt: confirmedAt,
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

    await this.runRuntimeAppointmentOperationWithFallback(
      "confirm_appointment",
      appointment.id,
      appointment.patientId,
      () =>
        confirmRuntimeAppointment({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          confirmedAt: confirmedAt.toISOString(),
          legacyActorUserId: confirmedBy,
          metadata: {
            flow: "appointments",
            operation: "confirm",
          },
        }),
      {
        flow: "appointments",
        operation: "confirm",
        confirmedAt,
      }
    );

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async cancel(id: string, dto?: { reason?: string }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const canceledBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        patientId: true,
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

    const canceledAt = new Date();

    const nextNotes = appendOperationalNote(
      appointment.notes,
      dto?.reason
        ? `Cancelamento manual: ${dto.reason}`
        : "Cancelamento manual registrado na agenda."
    );

    const updatedAppointment = await this.prisma.$transaction(async (tx: any) => {
      await tx.appointmentConfirmation.create({
        data: {
          appointmentId: appointment.id,
          channel: ConfirmationChannel.MANUAL,
          status: ConfirmationStatus.DECLINED,
          respondedAt: canceledAt,
          metadataJson: dto?.reason ? { reason: dto.reason } : undefined,
        },
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: {
          status: AppointmentStatus.CANCELLED,
          notes: nextNotes,
        },
        select: {
          id: true,
          status: true,
        },
      });
    });

    await this.runRuntimeAppointmentOperationWithFallback(
      "cancel_appointment",
      appointment.id,
      appointment.patientId,
      () =>
        cancelRuntimeAppointment({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          canceledAt: canceledAt.toISOString(),
          notes: nextNotes,
          reason: dto?.reason ?? null,
          legacyActorUserId: canceledBy,
          metadata: {
            flow: "appointments",
            operation: "cancel",
          },
        }),
      {
        flow: "appointments",
        operation: "cancel",
        canceledAt,
      }
    );

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  async reschedule(
    id: string,
    dto: { startsAt: string; endsAt: string; reason?: string },
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const rescheduledBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
        deletedAt: null,
      },
      select: {
        id: true,
        patientId: true,
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

    const nextNotes = appendOperationalNote(
      appointment.notes,
      dto.reason
        ? `Remarcacao manual: ${dto.reason}`
        : "Remarcacao manual registrada na agenda."
    );

    const updatedAppointment = await this.prisma.appointment.update({
      where: { id: appointment.id },
      data: {
        startsAt,
        endsAt,
        status: AppointmentStatus.SCHEDULED,
        notes: nextNotes,
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });

    await this.runRuntimeAppointmentOperationWithFallback(
      "reschedule_appointment",
      appointment.id,
      appointment.patientId,
      () =>
        rescheduleRuntimeAppointment({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          startsAt: updatedAppointment.startsAt.toISOString(),
          endsAt: updatedAppointment.endsAt.toISOString(),
          notes: nextNotes,
          reason: dto.reason ?? null,
          legacyActorUserId: rescheduledBy,
          metadata: {
            flow: "appointments",
            operation: "reschedule",
          },
        }),
      {
        flow: "appointments",
        operation: "reschedule",
      }
    );

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
      startsAt: updatedAppointment.startsAt.toISOString(),
      endsAt: updatedAppointment.endsAt.toISOString(),
    };
  }

  async markNoShow(id: string, dto?: { reason?: string }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const recordedBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const appointment = await this.prisma.appointment.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
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

    await this.runRuntimeAppointmentOperationWithFallback(
      "register_no_show",
      appointment.id,
      appointment.patientId,
      () =>
        registerRuntimeAppointmentNoShow({
          legacyTenantId: tenantId,
          legacyAppointmentId: appointment.id,
          reason: dto?.reason ?? null,
          legacyActorUserId: recordedBy,
          metadata: {
            flow: "appointments",
            operation: "mark_no_show",
          },
        }),
      {
        flow: "appointments",
        operation: "mark_no_show",
      }
    );

    return {
      id: updatedAppointment.id,
      status: mapAppointmentStatusLabel(updatedAppointment.status),
    };
  }

  private async runRuntimeAppointmentOperationWithFallback(
    operationName: string,
    legacyAppointmentId: string,
    legacyPatientId: string,
    operation: () => Promise<unknown>,
    fallbackOptions: Parameters<typeof syncRuntimeAppointmentProjection>[2]
  ) {
    if (!this.isRealAuthEnabled()) {
      return;
    }

    try {
      await operation();
    } catch (error) {
      console.error(
        `[runtime:write] Falha na operacao dedicada ${operationName} para ${legacyAppointmentId}; aplicando fallback da projecao de agenda.`,
        error
      );
      await this.syncRuntimeAppointmentWithFallback(
        legacyAppointmentId,
        legacyPatientId,
        fallbackOptions
      );
    }
  }

  private async startRuntimeEncounterWithFallback(
    params: Parameters<typeof startRuntimeEncounterFromLegacy>[0],
    legacyPatientId: string
  ) {
    if (!this.isRealAuthEnabled()) {
      return null;
    }

    try {
      return await startRuntimeEncounterFromLegacy(params);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na transicao dedicada de start encounter para ${params.legacyEncounterId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
      return null;
    }
  }

  private async syncRuntimeAppointmentWithFallback(
    legacyAppointmentId: string,
    legacyPatientId: string,
    options: Parameters<typeof syncRuntimeAppointmentProjection>[2]
  ) {
    if (!this.isRealAuthEnabled()) {
      return;
    }

    try {
      await syncRuntimeAppointmentProjection(this.prisma, legacyAppointmentId, options);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na RPC dedicada de agenda para ${legacyAppointmentId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
    }
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

function formatRuntimeDateFilter(value?: string) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const year = parsed.getFullYear();
  const month = `${parsed.getMonth() + 1}`.padStart(2, "0");
  const day = `${parsed.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function mapQueueStatusLabel(value: string) {
  switch (value) {
    case "waiting":
      return "Na fila";
    case "in_attendance":
      return "Em atendimento";
    case "completed":
      return "Atendimento concluido";
    case "removed":
      return "Removido da fila";
    default:
      return value;
  }
}

function mapRuntimeAppointmentStatusLabel(status?: string | null) {
  switch (status) {
    case "confirmed":
      return "Confirmado";
    case "checked_in":
      return "Check-in";
    case "in_progress":
      return "Em atendimento";
    case "completed":
      return "Concluido";
    case "cancelled":
      return "Cancelado";
    case "no_show":
      return "No-show";
    default:
      return "Agendado";
  }
}

function resolveEncounterTypeForAppointment(code?: string | null, name?: string | null) {
  const normalized = `${code ?? ""} ${name ?? ""}`.trim().toLowerCase();

  if (normalized.includes("retorno") || normalized.includes("follow")) {
    return EncounterType.FOLLOW_UP;
  }

  if (normalized.includes("tele")) {
    return EncounterType.TELECONSULT;
  }

  if (
    normalized.includes("inicial") ||
    normalized.includes("avali") ||
    normalized.includes("primeira") ||
    normalized.includes("initial")
  ) {
    return EncounterType.INITIAL_CONSULT;
  }

  if (normalized.includes("proced")) {
    return EncounterType.PROCEDURE;
  }

  if (normalized.includes("revis")) {
    return EncounterType.REVIEW;
  }

  return EncounterType.OTHER;
}
