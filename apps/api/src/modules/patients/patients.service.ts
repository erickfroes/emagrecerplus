import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  AppointmentStatus,
  ClinicalTaskStatus,
  RecordStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import {
  calculateAge,
  formatDueDate,
  formatShortDateTime,
  humanizeCode,
  mapCarePlanStatusLabel,
  mapEncounterTypeLabel,
  mapRecordStatusLabel,
  mapTaskPriorityLabel,
  mapTaskStatusLabel,
} from "../../common/presenters.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import {
  resolveActorUserIdForRequest,
  resolveTenantIdForRequest,
  resolveUnitIdForRequest,
} from "../../common/auth/request-context.ts";
import { syncPatientRuntimeProjection } from "../../common/runtime/runtime-patient-projection.ts";
import { upsertRuntimePatientFromLegacy } from "../../common/runtime/runtime-patient-writes.ts";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

type HabitTrend = "up" | "down" | "stable";
type TimelineKind = "consulta" | "anamnese" | "soap" | "prescricao" | "evento";

type PatientTagRow = { tag: { name: string } };
type PatientFlagRow = { flagType: string };
type PatientAppointmentRow = { startsAt: Date };
type PatientAgendaRow = {
  id: string;
  startsAt: Date;
  status: AppointmentStatus;
  appointmentType: { name: string };
  professional: { displayName: string } | null;
};
type CarePlanItemRow = {
  id: string;
  title: string;
  status: string | null;
  targetDate: Date | null;
  completedAt: Date | null;
};
type CarePlanRow = {
  currentStatus: string | null;
  startDate: Date | null;
  endDate: Date | null;
  items: CarePlanItemRow[];
};
type PatientTaskRow = {
  id: string;
  title: string;
  priority: Parameters<typeof mapTaskPriorityLabel>[0];
  status: Parameters<typeof mapTaskStatusLabel>[0];
  dueAt: Date | null;
  assignedUser: { fullName: string } | null;
};
type RuntimeAppointmentRow = {
  id: string;
  startsAt: string | null;
  status: string | null;
  appointmentTypeName: string | null;
  professionalName: string | null;
};
type RuntimeEncounterRow = {
  id: string;
  openedAt: string | null;
  encounterType: string | null;
  professionalName: string | null;
  appointmentTypeName: string | null;
  anamnesis: {
    chiefComplaint: string | null;
    notes: string | null;
    updatedAt: string | null;
  } | null;
  consultationNotes: Array<{
    id: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    createdAt: string | null;
    signedAt: string | null;
  }>;
  prescriptionRecords: Array<{
    id: string;
    prescriptionType: string | null;
    summary: string | null;
    issuedAt: string | null;
  }>;
  adverseEvents: Array<{
    id: string;
    eventType: string | null;
    description: string | null;
    createdAt: string | null;
  }>;
};
type RuntimeCarePlanRow = {
  currentStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  items: Array<{
    id: string;
    title: string;
    status: string | null;
    targetDate: string | null;
    completedAt: string | null;
  }>;
};
type RuntimeTaskRow = {
  id: string;
  title: string;
  priority: string | null;
  status: string | null;
  dueAt: string | null;
  ownerName: string | null;
};
type PatientTimelineRow = {
  id: string;
  openedAt: Date;
  encounterType: string;
  professional: { displayName: string } | null;
  appointment: { appointmentType: { name: string | null } } | null;
  anamnesis: {
    chiefComplaint: string | null;
    notes: string | null;
    updatedAt: Date;
  } | null;
  consultationNotes: Array<{
    id: string;
    subjective: string | null;
    objective: string | null;
    assessment: string | null;
    plan: string | null;
    createdAt: Date;
    signedAt: Date | null;
  }>;
  prescriptionRecords: Array<{
    id: string;
    prescriptionType: string;
    summary: string | null;
    issuedAt: Date;
  }>;
  adverseEvents: Array<{
    id: string;
    eventType: string;
    description: string;
    createdAt: Date;
  }>;
};
type PatientHabitCard = {
  id: string;
  label: string;
  value: string;
  helper: string;
  trend: HabitTrend;
};
type PatientDetailResponse = {
  id: string;
  name: string;
  age: number;
  email: string | null;
  phone: string | null;
  tags: string[];
  flags: string[];
  summary: {
    mainGoal: string | null;
    lastConsultation: string | null;
    nextConsultation: string | null;
    activeFlags: string[];
    openTasks: number;
    adherence: string;
  };
  agenda: Array<{
    id: string;
    dateTime: string;
    type: string;
    professional: string;
    status: "Confirmado" | "Agendado" | "Concluido";
  }>;
  timeline: Array<{
    id: string;
    type: TimelineKind;
    title: string;
    description: string;
    dateLabel: string;
  }>;
  carePlan: Array<{
    id: string;
    title: string;
    status: string;
    dueDate: string;
  }>;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueDate: string;
    owner: string;
  }>;
  habits: PatientHabitCard[];
  operationalAlerts?: unknown[];
  commercialContext?: unknown;
};
type RuntimePatient360Payload = {
  patient: {
    id: string;
    runtimeId: string | null;
    name: string | null;
    birthDate: string | null;
    email: string | null;
    phone: string | null;
    mainGoal: string | null;
  };
  tags: string[];
  flags: string[];
  appointments: RuntimeAppointmentRow[];
  encounters: RuntimeEncounterRow[];
  carePlans: RuntimeCarePlanRow[];
  tasks: RuntimeTaskRow[];
  habits: {
    hydrationLogs: Array<{ loggedAt: string | null; volumeMl: number | null }>;
    mealLogs: Array<{ adherenceRating: number | null }>;
    workoutLogs: Array<{ completed: boolean | null }>;
    sleepLogs: Array<{ hoursSlept: number | null }>;
    symptomLogs: Array<{
      symptomType: string | null;
      severityScore: number | null;
      description: string | null;
    }>;
  };
  operationalAlerts?: unknown[];
  commercialContext?: unknown;
};

@Injectable()
export class PatientsService {
  constructor(private readonly prisma: PrismaService) { }
  async create(dto: {
    fullName: string;
    cpf?: string;
    birthDate?: string;
    primaryPhone?: string;
    primaryEmail?: string;
    goalsSummary?: string;
    lifestyleSummary?: string;
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const actorUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_RECEPTION_EMAIL
    );

    const patient = await this.prisma.patient.create({
      data: {
        tenantId,
        fullName: dto.fullName,
        cpf: dto.cpf,
        birthDate: dto.birthDate ? new Date(dto.birthDate) : undefined,
        primaryPhone: dto.primaryPhone,
        primaryEmail: dto.primaryEmail,
        status: RecordStatus.ACTIVE,
        profile:
          dto.goalsSummary || dto.lifestyleSummary
            ? {
              create: {
                goalsSummary: dto.goalsSummary,
                lifestyleSummary: dto.lifestyleSummary,
              },
            }
            : undefined,
      },
      include: {
        profile: true,
      },
    });

    try {
      await upsertRuntimePatientFromLegacy({
        legacyTenantId: tenantId,
        legacyPatientId: patient.id,
        fullName: patient.fullName,
        cpf: patient.cpf,
        birthDate: patient.birthDate?.toISOString().slice(0, 10) ?? null,
        primaryPhone: patient.primaryPhone,
        primaryEmail: patient.primaryEmail,
        goalsSummary: patient.profile?.goalsSummary ?? null,
        lifestyleSummary: patient.profile?.lifestyleSummary ?? null,
        legacyCreatedByUserId: actorUserId,
        metadata: {
          source: "api_runtime_create",
        },
      });
    } catch (error) {
      console.error(
        `[runtime:write] Falha na RPC dedicada de create patient para ${patient.id}; aplicando fallback de sync incremental.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, patient.id);
    }

    return {
      id: patient.id,
      name: patient.fullName,
    };
  }

  async createCommercialEnrollment(
    id: string,
    dto: {
      programId: string;
      packageId: string;
      startDate?: string;
      endDate?: string;
      enrollmentStatus?: string;
      source?: string;
      notes?: string;
      metadata?: Record<string, unknown>;
    },
    context?: AppRequestContext,
    authorization?: string
  ) {
    if (!this.isRealAuthEnabled()) {
      throw new BadRequestException(
        "Matriculas comerciais no runtime exigem auth real habilitada."
      );
    }

    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!patient) {
      throw new NotFoundException("Paciente nao encontrado para o tenant atual.");
    }

    await this.ensureRuntimePatientProjection(id, context);

    const accessToken = this.extractBearerToken(authorization);
    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    const { data, error } = await requestClient.rpc("enroll_patient_program", {
      p_patient_id: id,
      p_program_id: dto.programId,
      p_package_id: dto.packageId,
      p_start_date: dto.startDate ?? null,
      p_end_date: dto.endDate ?? null,
      p_enrollment_status: dto.enrollmentStatus ?? "active",
      p_source: dto.source ?? "patient_admin_console",
      p_notes: dto.notes ?? null,
      p_metadata: {
        source: "patients_api_enrollment",
        ...(dto.metadata ?? {}),
      },
    });

    if (error) {
      throw new BadRequestException(
        `Falha ao criar matricula comercial no runtime: ${error.message}`
      );
    }

    if (!isJsonRecord(data)) {
      throw new BadRequestException(
        "RPC enroll_patient_program retornou um payload invalido."
      );
    }

    return data;
  }

  async list(params: {
    search?: string;
    status?: string;
    tag?: string;
    flag?: string;
    page?: number;
    pageSize?: number;
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = context?.currentUnitId;
    const page = sanitizeNumber(params.page, 1);
    const pageSize = Math.min(sanitizeNumber(params.pageSize, 20), 50);
    const search = params.search?.trim();
    const status = normalizePatientStatus(params.status);
    const tag = normalizeTextFilter(params.tag);
    const flag = normalizeTextFilter(params.flag);
    const now = new Date();

    const where = {
      tenantId,
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(search
        ? {
          OR: [
            { fullName: { contains: search, mode: "insensitive" as const } },
            { cpf: { contains: search } },
            { primaryPhone: { contains: search } },
            { primaryEmail: { contains: search, mode: "insensitive" as const } },
          ],
        }
        : {}),
      ...(tag
        ? {
          patientTags: {
            some: {
              tag: {
                is: {
                  name: {
                    contains: tag,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          },
        }
        : {}),
      ...(flag
        ? {
          flags: {
            some: {
              active: true,
              flagType: {
                contains: flag,
                mode: "insensitive" as const,
              },
            },
          },
        }
        : {}),
    };

    const [total, patients] = await Promise.all([
      this.prisma.patient.count({ where }),
      this.prisma.patient.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fullName: true,
          primaryPhone: true,
          primaryEmail: true,
          status: true,
          patientTags: {
            select: {
              tag: {
                select: {
                  name: true,
                },
              },
            },
          },
          flags: {
            where: { active: true },
            orderBy: { createdAt: "desc" },
            select: {
              flagType: true,
            },
          },
        },
      }),
    ]);

    const appointments = patients.length
      ? await this.prisma.appointment.findMany({
        where: {
          patientId: { in: patients.map((patient: { id: string }) => patient.id) },
          deletedAt: null,
          ...(currentUnitId ? { unitId: currentUnitId } : {}),
          status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
        },
        orderBy: { startsAt: "asc" },
        select: {
          patientId: true,
          startsAt: true,
        },
      })
      : [];

    const appointmentsByPatient = new Map<string, Date[]>();
    for (const appointment of appointments) {
      const current = appointmentsByPatient.get(appointment.patientId) ?? [];
      current.push(appointment.startsAt);
      appointmentsByPatient.set(appointment.patientId, current);
    }

    interface PatientListRow {
      id: string;
      fullName: string;
      primaryPhone: string | null;
      primaryEmail: string | null;
      status: RecordStatus;
      patientTags: Array<{ tag: { name: string } }>;
      flags: Array<{ flagType: string }>;
    }

    interface PatientListItem {
      id: string;
      name: string;
      phone: string | null;
      email: string | null;
      status: string;
      tags: string[];
      flags: string[];
      lastConsultation: string | null;
      nextAppointment: string | null;
    }

    interface PatientListResponse {
      items: PatientListItem[];
      total: number;
      page: number;
      pageSize: number;
    }

    const response: PatientListResponse = {
      items: patients.map((patient: PatientListRow): PatientListItem => {
      const patientAppointments: Date[] = appointmentsByPatient.get(patient.id) ?? [];
      const lastConsultation: Date | null =
        [...patientAppointments].reverse().find((date) => date < now) ?? null;
      const nextAppointment: Date | null =
        patientAppointments.find((date) => date >= now) ?? null;

      return {
        id: patient.id,
        name: patient.fullName,
        phone: patient.primaryPhone,
        email: patient.primaryEmail,
        status: mapRecordStatusLabel(patient.status),
        tags: patient.patientTags.map((item: PatientTagRow) => item.tag.name),
        flags: patient.flags.map((flag: PatientFlagRow) => flag.flagType),
        lastConsultation: lastConsultation?.toISOString() ?? null,
        nextAppointment: nextAppointment?.toISOString() ?? null,
      };
      }),
      total,
      page,
      pageSize,
    };

    return response;
  }

  async getById(id: string, context?: AppRequestContext, authorization?: string) {
    if (this.isRealAuthEnabled()) {
      return this.getByIdFromRuntime(id, context, authorization);
    }

    return this.getByIdFromLegacyPrisma(id, context);
  }

  private async getByIdFromRuntime(
    id: string,
    context?: AppRequestContext,
    authorization?: string
  ): Promise<PatientDetailResponse> {
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    const requestClient = createSupabaseRequestClient(accessToken);
    let runtimePayload = await this.fetchRuntimePatient360Payload(requestClient, id, context);

    if (!this.isRuntimePatient360PayloadReady(runtimePayload)) {
      await this.ensureRuntimePatientProjection(id, context);
      runtimePayload = await this.fetchRuntimePatient360Payload(requestClient, id, context);
    }

    if (!this.isRuntimePatient360PayloadReady(runtimePayload)) {
      throw new BadRequestException(
        "Paciente ainda nao materializado no runtime Supabase para leitura do detalhe."
      );
    }

    return this.mapRuntimePatientDetail(runtimePayload as RuntimePatient360Payload);
  }

  private async getByIdFromLegacyPrisma(
    id: string,
    context?: AppRequestContext
  ): Promise<PatientDetailResponse> {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const now = new Date();

    const patient = await this.prisma.patient.findFirstOrThrow({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
        fullName: true,
        birthDate: true,
        primaryEmail: true,
        primaryPhone: true,
        profile: {
          select: {
            goalsSummary: true,
          },
        },
        patientTags: {
          select: {
            tag: {
              select: {
                name: true,
              },
            },
          },
        },
        flags: {
          where: { active: true },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            flagType: true,
          },
        },
        appointments: {
          where: {
            unitId: currentUnitId,
            deletedAt: null,
            status: { notIn: [AppointmentStatus.CANCELLED, AppointmentStatus.NO_SHOW] },
          },
          orderBy: { startsAt: "asc" },
          select: {
            id: true,
            startsAt: true,
            status: true,
            appointmentType: { select: { name: true } },
            professional: { select: { displayName: true } },
          },
        },
        encounters: {
          where: {
            unitId: currentUnitId,
          },
          orderBy: { openedAt: "desc" },
          select: {
            id: true,
            openedAt: true,
            encounterType: true,
            professional: { select: { displayName: true } },
            appointment: {
              select: {
                appointmentType: { select: { name: true } },
              },
            },
            anamnesis: {
              select: {
                chiefComplaint: true,
                notes: true,
                updatedAt: true,
              },
            },
            consultationNotes: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                subjective: true,
                objective: true,
                assessment: true,
                plan: true,
                createdAt: true,
                signedAt: true,
              },
            },
            prescriptionRecords: {
              orderBy: { issuedAt: "desc" },
              select: {
                id: true,
                prescriptionType: true,
                summary: true,
                issuedAt: true,
              },
            },
            adverseEvents: {
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                eventType: true,
                description: true,
                createdAt: true,
              },
            },
          },
        },
        carePlans: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          select: {
            currentStatus: true,
            startDate: true,
            endDate: true,
            items: {
              orderBy: { title: "asc" },
              select: {
                id: true,
                title: true,
                status: true,
                targetDate: true,
                completedAt: true,
              },
            },
          },
        },
        clinicalTasks: {
          where: {
            deletedAt: null,
            status: {
              in: [ClinicalTaskStatus.OPEN, ClinicalTaskStatus.IN_PROGRESS],
            },
          },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
          select: {
            id: true,
            title: true,
            priority: true,
            status: true,
            dueAt: true,
            assignedUser: {
              select: {
                fullName: true,
              },
            },
          },
        },
        hydrationLogs: {
          orderBy: { loggedAt: "desc" },
          take: 7,
          select: {
            id: true,
            loggedAt: true,
            volumeMl: true,
          },
        },
        mealLogs: {
          orderBy: { loggedAt: "desc" },
          take: 7,
          select: {
            adherenceRating: true,
          },
        },
        workoutLogs: {
          orderBy: { loggedAt: "desc" },
          take: 7,
          select: {
            completed: true,
          },
        },
        sleepLogs: {
          orderBy: { sleepDate: "desc" },
          take: 7,
          select: {
            hoursSlept: true,
          },
        },
        symptomLogs: {
          orderBy: { loggedAt: "desc" },
          take: 1,
          select: {
            symptomType: true,
            severityScore: true,
            description: true,
          },
        },
      },
    });

    const lastConsultation =
      [...patient.appointments].reverse().find((appointment: PatientAppointmentRow) => appointment.startsAt < now) ?? null;
    const nextConsultation = patient.appointments.find(
      (appointment: PatientAppointmentRow) => appointment.startsAt >= now
    ) ?? null;
    const flags = patient.flags.map((flag: PatientFlagRow) => flag.flagType);
    const habits = buildHabitCards(patient);

    return {
      id: patient.id,
      name: patient.fullName,
      age: calculateAge(patient.birthDate),
      email: patient.primaryEmail,
      phone: patient.primaryPhone,
      tags: patient.patientTags.map((item: PatientTagRow) => item.tag.name),
      flags,
      summary: {
        mainGoal: patient.profile?.goalsSummary ?? null,
        lastConsultation: lastConsultation?.startsAt.toISOString() ?? null,
        nextConsultation: nextConsultation?.startsAt.toISOString() ?? null,
        activeFlags: flags,
        openTasks: patient.clinicalTasks.length,
        adherence: buildAdherenceSummary(patient, habits),
      },
      agenda: patient.appointments
        .filter((appointment: PatientAgendaRow) => appointment.startsAt >= now)
        .slice(0, 10)
        .map((appointment: PatientAgendaRow) => ({
          id: appointment.id,
          dateTime: formatShortDateTime(appointment.startsAt),
          type: appointment.appointmentType.name,
          professional: appointment.professional?.displayName ?? "Equipe clinica",
          status: appointment.status === AppointmentStatus.CONFIRMED ? "Confirmado" : "Agendado",
        })),
      timeline: buildTimeline(patient.encounters),
      carePlan: patient.carePlans.flatMap((plan: CarePlanRow) =>
        plan.items.map((item: CarePlanItemRow) => ({
          id: item.id,
          title: item.title,
          status:
            item.completedAt && item.status !== "OVERDUE"
              ? "Concluido"
              : mapCarePlanStatusLabel(item.status ?? plan.currentStatus),
          dueDate: formatDueDate(item.targetDate ?? item.completedAt ?? plan.endDate ?? plan.startDate),
        }))
      ),
      tasks: patient.clinicalTasks.map((task: PatientTaskRow) => ({
        id: task.id,
        title: task.title,
        priority: mapTaskPriorityLabel(task.priority),
        status: mapTaskStatusLabel(task.status),
        dueDate: formatDueDate(task.dueAt),
        owner: task.assignedUser?.fullName ?? "Time clinico",
      })),
      habits,
    };
  }

  private isRealAuthEnabled() {
    return (process.env.API_AUTH_MODE ?? process.env.NEXT_PUBLIC_AUTH_MODE ?? "mock") === "real";
  }

  private async fetchRuntimePatient360Payload(
    requestClient: ReturnType<typeof createSupabaseRequestClient>,
    patientId: string,
    context?: AppRequestContext
  ) {
    const { data, error } = await requestClient.rpc("patient_360", {
      p_patient_id: patientId,
      p_current_legacy_unit_id: context?.currentUnitId ?? null,
    });

    if (error) {
      throw new BadRequestException(`Falha ao consultar Paciente 360: ${error.message}`);
    }

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new BadRequestException("RPC patient_360 retornou um payload invalido.");
    }

    return data as Record<string, unknown>;
  }

  private isRuntimePatient360PayloadReady(payload: Record<string, unknown>) {
    return (
      payload.ready === true &&
      "patient" in payload &&
      Boolean(payload.patient) &&
      typeof payload.patient === "object"
    );
  }

  private async ensureRuntimePatientProjection(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);

    const patient = await this.prisma.patient.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!patient) {
      throw new NotFoundException("Paciente nao encontrado para o tenant atual.");
    }

    await syncPatientRuntimeProjection(this.prisma, patient.id);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
  }

  private mapRuntimePatientDetail(runtimePayload: RuntimePatient360Payload): PatientDetailResponse {
    const payload = runtimePayload;
    const patient = payload.patient;
    const now = new Date();

    const appointments: Array<{
      id: string;
      startsAt: Date;
      status: string | null;
      appointmentTypeName: string | null;
      professionalName: string | null;
    }> = [];
    for (const appointment of payload.appointments ?? []) {
      const startsAt = parseRuntimeDate(appointment.startsAt);
      if (!startsAt) {
        continue;
      }

      appointments.push({
        id: appointment.id,
        startsAt,
        status: appointment.status,
        appointmentTypeName: appointment.appointmentTypeName,
        professionalName: appointment.professionalName,
      });
    }
    appointments.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());

    const encounters: PatientTimelineRow[] = [];
    for (const encounter of payload.encounters ?? []) {
      const openedAt = parseRuntimeDate(encounter.openedAt);
      if (!openedAt) {
        continue;
      }

      encounters.push({
        id: encounter.id,
        openedAt,
        encounterType: normalizeRuntimeCode(encounter.encounterType, "OTHER"),
        professional: encounter.professionalName
          ? { displayName: encounter.professionalName }
          : null,
        appointment: encounter.appointmentTypeName
          ? {
            appointmentType: {
              name: encounter.appointmentTypeName,
            },
          }
          : null,
        anamnesis: encounter.anamnesis
          ? {
            chiefComplaint: encounter.anamnesis.chiefComplaint,
            notes: encounter.anamnesis.notes,
            updatedAt: parseRuntimeDate(encounter.anamnesis.updatedAt) ?? openedAt,
          }
          : null,
        consultationNotes: (encounter.consultationNotes ?? []).map((note) => ({
          id: note.id,
          subjective: note.subjective,
          objective: note.objective,
          assessment: note.assessment,
          plan: note.plan,
          createdAt: parseRuntimeDate(note.createdAt) ?? openedAt,
          signedAt: parseRuntimeDate(note.signedAt),
        })),
        prescriptionRecords: (encounter.prescriptionRecords ?? []).map((record) => ({
          id: record.id,
          prescriptionType: normalizeRuntimeCode(record.prescriptionType, "OTHER"),
          summary: record.summary,
          issuedAt: parseRuntimeDate(record.issuedAt) ?? openedAt,
        })),
        adverseEvents: (encounter.adverseEvents ?? []).map((event) => ({
          id: event.id,
          eventType: event.eventType ?? "event",
          description: event.description ?? "",
          createdAt: parseRuntimeDate(event.createdAt) ?? openedAt,
        })),
      });
    }

    const carePlans = (payload.carePlans ?? []).map((plan) => ({
      currentStatus: plan.currentStatus,
      startDate: parseRuntimeDate(plan.startDate),
      endDate: parseRuntimeDate(plan.endDate),
      items: (plan.items ?? []).map((item) => ({
        id: item.id,
        title: item.title,
        status: item.status,
        targetDate: parseRuntimeDate(item.targetDate),
        completedAt: parseRuntimeDate(item.completedAt),
      })),
    }));

    const tasks = (payload.tasks ?? []).map((task) => ({
      id: task.id,
      title: task.title,
      priority: normalizeRuntimeCode(task.priority, "MEDIUM") as Parameters<typeof mapTaskPriorityLabel>[0],
      status: normalizeRuntimeCode(task.status, "OPEN") as Parameters<typeof mapTaskStatusLabel>[0],
      dueAt: parseRuntimeDate(task.dueAt),
      assignedUser: task.ownerName ? { fullName: task.ownerName } : null,
    }));

    const habits = buildHabitCards({
      hydrationLogs: (payload.habits?.hydrationLogs ?? [])
        .map((log) => ({
          loggedAt: parseRuntimeDate(log.loggedAt),
          volumeMl: typeof log.volumeMl === "number" ? log.volumeMl : 0,
        }))
        .filter(
          (log): log is { loggedAt: Date; volumeMl: number } =>
            Boolean(log.loggedAt) && Number.isFinite(log.volumeMl)
        ),
      mealLogs: (payload.habits?.mealLogs ?? []).map((log) => ({
        adherenceRating: typeof log.adherenceRating === "number" ? log.adherenceRating : null,
      })),
      workoutLogs: (payload.habits?.workoutLogs ?? []).map((log) => ({
        completed: Boolean(log.completed),
      })),
      sleepLogs: (payload.habits?.sleepLogs ?? []).map((log) => ({
        hoursSlept: typeof log.hoursSlept === "number" ? log.hoursSlept : null,
      })),
      symptomLogs: (payload.habits?.symptomLogs ?? []).map((log) => ({
        symptomType: log.symptomType ?? "",
        severityScore: typeof log.severityScore === "number" ? log.severityScore : null,
        description: log.description,
      })),
    });

    const lastConsultation =
      [...appointments].reverse().find((appointment) => appointment.startsAt < now) ?? null;
    const nextConsultation =
      appointments.find((appointment) => appointment.startsAt >= now) ?? null;
    const flags = payload.flags ?? [];

    return {
      id: patient.id,
      name: patient.name ?? "Paciente",
      age: calculateAge(parseRuntimeDate(patient.birthDate)),
      email: patient.email ?? null,
      phone: patient.phone ?? null,
      tags: payload.tags ?? [],
      flags,
      summary: {
        mainGoal: patient.mainGoal ?? null,
        lastConsultation: lastConsultation?.startsAt.toISOString() ?? null,
        nextConsultation: nextConsultation?.startsAt.toISOString() ?? null,
        activeFlags: flags,
        openTasks: tasks.length,
        adherence: buildAdherenceSummary(
          {
            flags: flags.map((flag) => ({ flagType: flag })),
            mealLogs: (payload.habits?.mealLogs ?? []).map((log) => ({
              adherenceRating: typeof log.adherenceRating === "number" ? log.adherenceRating : null,
            })),
            hydrationLogs: (payload.habits?.hydrationLogs ?? [])
              .map((log) => ({
                loggedAt: parseRuntimeDate(log.loggedAt),
                volumeMl: typeof log.volumeMl === "number" ? log.volumeMl : 0,
              }))
              .filter(
                (log): log is { loggedAt: Date; volumeMl: number } =>
                  Boolean(log.loggedAt) && Number.isFinite(log.volumeMl)
              ),
          },
          habits
        ),
      },
      agenda: appointments
        .filter((appointment) => appointment.startsAt >= now)
        .slice(0, 10)
        .map((appointment) => ({
          id: appointment.id,
          dateTime: formatShortDateTime(appointment.startsAt),
          type: appointment.appointmentTypeName ?? "Consulta",
          professional: appointment.professionalName ?? "Equipe clinica",
          status: appointment.status === "confirmed" ? "Confirmado" : "Agendado",
        })),
      timeline: buildTimeline(encounters),
      carePlan: carePlans.flatMap((plan) =>
        plan.items.map((item) => ({
          id: item.id,
          title: item.title,
          status:
            item.completedAt && item.status !== "OVERDUE"
              ? "Concluido"
              : mapCarePlanStatusLabel(
                normalizeRuntimeCode(item.status ?? plan.currentStatus, "IN_PROGRESS")
              ),
          dueDate: formatDueDate(item.targetDate ?? item.completedAt ?? plan.endDate ?? plan.startDate),
        }))
      ),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        priority: mapTaskPriorityLabel(task.priority),
        status: mapTaskStatusLabel(task.status),
        dueDate: formatDueDate(task.dueAt),
        owner: task.assignedUser?.fullName ?? "Time clinico",
      })),
      habits,
      operationalAlerts: payload.operationalAlerts ?? [],
      commercialContext: payload.commercialContext ?? null,
    };
  }
}

function sanitizeNumber(value: number | undefined, fallback: number) {
  if (!value || Number.isNaN(value) || value <= 0) {
    return fallback;
  }

  return Math.floor(value);
}

function normalizePatientStatus(value?: string) {
  const normalizedValue = normalizeTextFilter(value)?.toLowerCase();

  switch (normalizedValue) {
    case "ativo":
    case "ativa":
    case "active":
      return RecordStatus.ACTIVE;
    case "inativo":
    case "inativa":
    case "inactive":
      return RecordStatus.INACTIVE;
    case "arquivado":
    case "arquivada":
    case "archived":
      return RecordStatus.ARCHIVED;
    default:
      return undefined;
  }
}

function normalizeTextFilter(value?: string) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

function parseRuntimeDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRuntimeCode(value: string | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  return value.trim().replaceAll("-", "_").toUpperCase();
}

function buildTimeline(encounters: PatientTimelineRow[]) {
  const items = encounters.flatMap((encounter) => {
    const result: Array<{
      id: string;
      type: TimelineKind;
      title: string;
      description: string;
      date: Date;
    }> = [
        {
          id: `encounter-${encounter.id}`,
          type: "consulta" as const,
          title:
            encounter.appointment?.appointmentType?.name ??
            mapEncounterTypeLabel(
              encounter.encounterType as Parameters<typeof mapEncounterTypeLabel>[0]
            ),
          description: `Atendimento com ${encounter.professional?.displayName ?? "Equipe clinica"}.`,
          date: encounter.openedAt,
        },
      ];

    if (encounter.anamnesis) {
      result.push({
        id: `anamnesis-${encounter.id}`,
        type: "anamnese" as const,
        title: "Anamnese estruturada",
        description:
          encounter.anamnesis.chiefComplaint ??
          encounter.anamnesis.notes ??
          "Registro de anamnese adicionado ao prontuario.",
        date: encounter.anamnesis.updatedAt,
      });
    }

    for (const note of encounter.consultationNotes) {
      result.push({
        id: `note-${note.id}`,
        type: "soap" as const,
        title: "Nota SOAP",
        description:
          note.assessment ?? note.plan ?? note.objective ?? note.subjective ?? "Evolucao clinica registrada.",
        date: note.signedAt ?? note.createdAt,
      });
    }

    for (const prescription of encounter.prescriptionRecords) {
      result.push({
        id: `prescription-${prescription.id}`,
        type: "prescricao" as const,
        title: "Prescricao registrada",
        description: prescription.summary ?? humanizeCode(prescription.prescriptionType) ?? "Orientacao registrada.",
        date: prescription.issuedAt,
      });
    }

    for (const event of encounter.adverseEvents) {
      result.push({
        id: `event-${event.id}`,
        type: "evento" as const,
        title: "Evento adverso",
        description: event.description || (humanizeCode(event.eventType) ?? "Intercorrencia acompanhada."),
        date: event.createdAt,
      });
    }

    return result;
  });

  return items
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 12)
    .map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description,
      dateLabel: formatShortDateTime(item.date),
    }));
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function buildHabitCards(patient: {
  hydrationLogs: Array<{ loggedAt: Date; volumeMl: number }>;
  mealLogs: Array<{ adherenceRating: number | null }>;
  workoutLogs: Array<{ completed: boolean }>;
  sleepLogs: Array<{ hoursSlept: number | null }>;
  symptomLogs: Array<{ symptomType: string; severityScore: number | null; description: string | null }>;
}): PatientHabitCard[] {
  const hydrationAverage = averageHydration(patient.hydrationLogs);
  const mealsAverage = averageNumber(patient.mealLogs.map((log) => log.adherenceRating));
  const workoutCompleted = patient.workoutLogs.filter((log) => log.completed).length;
  const sleepAverage = averageNumber(patient.sleepLogs.map((log) => log.hoursSlept));
  const latestSymptom = patient.symptomLogs[0] ?? null;

  return [
    {
      id: "habit-water",
      label: "Agua",
      value: hydrationAverage ? `${formatDecimal(hydrationAverage / 1000)}L` : "0,0L",
      helper:
        hydrationAverage >= 2200
          ? "Meta diaria em bom nivel"
          : hydrationAverage >= 1500
            ? "Consistencia mediana na semana"
            : "Abaixo da meta semanal",
      trend: (hydrationAverage >= 2200 ? "up" : hydrationAverage >= 1500 ? "stable" : "down") as HabitTrend,
    },
    {
      id: "habit-meals",
      label: "Refeicoes",
      value: mealsAverage ? `${Math.round(mealsAverage)}/10` : "Sem dados",
      helper:
        mealsAverage >= 8
          ? "Aderencia alimentar forte"
          : mealsAverage >= 6
            ? "Aderencia intermediaria"
            : "Precisando de reforco alimentar",
      trend: (mealsAverage >= 8 ? "up" : mealsAverage >= 6 ? "stable" : "down") as HabitTrend,
    },
    {
      id: "habit-workouts",
      label: "Treino",
      value: `${workoutCompleted}/5`,
      helper:
        workoutCompleted >= 4
          ? "Meta semanal quase completa"
          : workoutCompleted >= 2
            ? "Ritmo regular nesta semana"
            : "Baixa frequencia recente",
      trend: (workoutCompleted >= 4 ? "up" : workoutCompleted >= 2 ? "stable" : "down") as HabitTrend,
    },
    {
      id: "habit-sleep",
      label: "Sono",
      value: sleepAverage ? formatHoursValue(sleepAverage) : "Sem dados",
      helper:
        sleepAverage >= 7
          ? "Qualidade de descanso adequada"
          : sleepAverage >= 6
            ? "Sono razoavel no periodo"
            : "Sono abaixo do ideal",
      trend: (sleepAverage >= 7 ? "up" : sleepAverage >= 6 ? "stable" : "down") as HabitTrend,
    },
    {
      id: "habit-symptoms",
      label: "Sintomas",
      value: describeSymptomLoad(latestSymptom?.severityScore ?? null),
      helper:
        latestSymptom?.description ??
        humanizeCode(latestSymptom?.symptomType) ??
        "Sem sintomas relevantes registrados",
      trend: (
        (latestSymptom?.severityScore ?? 0) >= 6
          ? "down"
          : (latestSymptom?.severityScore ?? 0) >= 3
            ? "stable"
            : "up"
      ) as HabitTrend,
    },
  ];
}

function buildAdherenceSummary(
  patient: {
    flags: Array<{ flagType: string }>;
    mealLogs: Array<{ adherenceRating: number | null }>;
    hydrationLogs: Array<{ loggedAt: Date; volumeMl: number }>;
  },
  habits: Array<{ trend: HabitTrend }>
) {
  const hasDropoutRisk = patient.flags.some((flag) => flag.flagType === "dropout_risk");
  const mealsAverage = averageNumber(patient.mealLogs.map((log) => log.adherenceRating));
  const hydrationAverage = averageHydration(patient.hydrationLogs);
  const negativeSignals = habits.filter((habit) => habit.trend === "down").length;

  if (hasDropoutRisk || negativeSignals >= 3) {
    return "Oscilacao importante nas ultimas duas semanas.";
  }

  if (mealsAverage >= 8.5 && hydrationAverage >= 2500) {
    return "Excelente consistencia de treino e registro.";
  }

  if (mealsAverage >= 7) {
    return "Boa adesao nos ultimos 30 dias.";
  }

  return "Aderencia abaixo do esperado no periodo recente.";
}

function averageHydration(logs: Array<{ loggedAt: Date; volumeMl: number }>) {
  if (!logs.length) {
    return 0;
  }

  const grouped = new Map<string, number>();
  for (const log of logs) {
    const key = log.loggedAt.toISOString().slice(0, 10);
    grouped.set(key, (grouped.get(key) ?? 0) + log.volumeMl);
  }

  const totals = [...grouped.values()];
  return totals.reduce((sum, value) => sum + value, 0) / totals.length;
}

function averageNumber(values: Array<number | null | undefined>) {
  const filtered = values.filter((value): value is number => typeof value === "number");
  if (!filtered.length) {
    return 0;
  }

  return filtered.reduce((sum, value) => sum + value, 0) / filtered.length;
}

function formatDecimal(value: number) {
  return value.toFixed(1).replace(".", ",");
}

function formatHoursValue(value: number) {
  const totalMinutes = Math.round(value * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function describeSymptomLoad(score: number | null) {
  if (!score) {
    return "Baixos";
  }

  if (score >= 7) {
    return "Altos";
  }

  if (score >= 4) {
    return "Moderados";
  }

  return "Baixos";
}
