import { Injectable } from "@nestjs/common";
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
import { resolveTenantId } from "../../common/scope.ts";
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
  }) {
    const tenantId = await resolveTenantId(this.prisma);

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

    return {
      id: patient.id,
      name: patient.fullName,
    };
  }
  async list(params: {
    search?: string;
    status?: string;
    tag?: string;
    flag?: string;
    page?: number;
    pageSize?: number;
  }) {
    const tenantId = await resolveTenantId(this.prisma);
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

  async getById(id: string) {
    const tenantId = await resolveTenantId(this.prisma);
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

function buildTimeline(encounters: Array<{
  id: string;
  openedAt: Date;
  encounterType: string;
  professional: { displayName: string } | null;
  appointment: { appointmentType: { name: string } | null } | null;
  anamnesis: { chiefComplaint: string | null; notes: string | null; updatedAt: Date } | null;
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
}>) {
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

function buildHabitCards(patient: {
  hydrationLogs: Array<{ loggedAt: Date; volumeMl: number }>;
  mealLogs: Array<{ adherenceRating: number | null }>;
  workoutLogs: Array<{ completed: boolean }>;
  sleepLogs: Array<{ hoursSlept: number | null }>;
  symptomLogs: Array<{ symptomType: string; severityScore: number | null; description: string | null }>;
}) {
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
  ] satisfies Array<{ trend: HabitTrend } & Record<string, unknown>>;
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
