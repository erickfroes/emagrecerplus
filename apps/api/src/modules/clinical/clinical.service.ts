import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ClinicalTaskPriority,
  ClinicalTaskStatus,
} from "../../../../../generated/prisma/client/enums.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";
import { resolveTenantId, resolveUserId } from "../../common/scope.ts";

type EncounterNoteRow = {
  id: string;
  noteType: string | null;
  subjective: string | null;
  objective: string | null;
  assessment: string | null;
  plan: string | null;
  signedAt: Date | null;
};

type EncounterTaskRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt: Date | null;
};

type PatientGoalRow = {
  id: string;
  title: string;
  goalType: string;
  targetValue: string | null;
  currentValue: string | null;
  status: string | null;
  targetDate: Date | null;
};

type PrescriptionRow = {
  id: string;
  prescriptionType: string;
  summary: string | null;
  issuedAt: Date;
};

type AdverseEventRow = {
  id: string;
  eventType: string;
  severity: string;
  status: string;
  description: string;
};

type ClinicalTaskListRow = {
  id: string;
  title: string;
  priority: string;
  status: string;
  dueAt: Date | null;
  patient: { fullName: string };
  assignedUser: { fullName: string } | null;
};

@Injectable()
export class ClinicalService {
  constructor(private readonly prisma: PrismaService) {}

  async createTask(dto: {
    patientId: string;
    title: string;
    encounterId?: string;
    assignedToUserId?: string;
    taskType?: string;
    description?: string;
    priority?: string;
    dueAt?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);

    const patient = await this.prisma.patient.findFirst({
      where: {
        id: dto.patientId,
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

    if (dto.encounterId) {
      const encounter = await this.prisma.encounter.findFirst({
        where: {
          id: dto.encounterId,
          tenantId,
          patientId: dto.patientId,
        },
        select: { id: true },
      });

      if (!encounter) {
        throw new NotFoundException("Atendimento nao encontrado para o paciente informado.");
      }
    }

    if (dto.assignedToUserId) {
      const assignedUser = await this.prisma.user.findFirst({
        where: {
          id: dto.assignedToUserId,
          tenantId,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!assignedUser) {
        throw new NotFoundException("Usuario responsavel nao encontrado para o tenant atual.");
      }
    }

    const assignedToUserId =
      dto.assignedToUserId ??
      (await resolveUserId(
        this.prisma,
        tenantId,
        process.env.DEFAULT_CLINICAL_USER_EMAIL
      ));

    const task = await this.prisma.clinicalTask.create({
      data: {
        tenantId,
        patientId: dto.patientId,
        encounterId: dto.encounterId,
        assignedToUserId,
        taskType: dto.taskType?.trim() || "FOLLOW_UP",
        title: dto.title.trim(),
        description: dto.description,
        priority: normalizeTaskPriority(dto.priority),
        dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
      },
      select: {
        id: true,
        title: true,
        status: true,
      },
    });

    return {
      id: task.id,
      title: task.title,
      status: task.status,
    };
  }

  async saveAnamnesis(encounterId: string, dto: {
    chiefComplaint?: string;
    historyOfPresentIllness?: string;
    pastMedicalHistory?: string;
    lifestyleHistory?: string;
    notes?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);

    await this.prisma.encounter.findFirstOrThrow({
      where: {
        id: encounterId,
        tenantId,
      },
      select: { id: true },
    });

    return this.prisma.anamnesis.upsert({
      where: { encounterId },
      update: {
        chiefComplaint: dto.chiefComplaint,
        historyOfPresentIllness: dto.historyOfPresentIllness,
        pastMedicalHistory: dto.pastMedicalHistory,
        lifestyleHistory: dto.lifestyleHistory,
        notes: dto.notes,
      },
      create: {
        encounterId,
        chiefComplaint: dto.chiefComplaint,
        historyOfPresentIllness: dto.historyOfPresentIllness,
        pastMedicalHistory: dto.pastMedicalHistory,
        lifestyleHistory: dto.lifestyleHistory,
        notes: dto.notes,
      },
    });
  }

  async saveSoapNote(encounterId: string, dto: {
    noteType?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);

    const encounter = await this.prisma.encounter.findFirstOrThrow({
      where: {
        id: encounterId,
        tenantId,
      },
      select: {
        id: true,
        tenantId: true,
      },
    });

    const signerId = await resolveUserId(
      this.prisma,
      encounter.tenantId,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    return this.prisma.consultationNote.create({
      data: {
        encounterId,
        noteType: dto.noteType ?? "SOAP",
        subjective: dto.subjective,
        objective: dto.objective,
        assessment: dto.assessment,
        plan: dto.plan,
        signedBy: signerId,
        signedAt: new Date(),
      },
    });
  }

  async getEncounterById(id: string) {
    const tenantId = await resolveTenantId(this.prisma);

    const encounter = await this.prisma.encounter.findFirstOrThrow({
      where: {
        id,
        tenantId,
      },
      include: {
        patient: true,
        professional: true,
        appointment: {
          include: {
            appointmentType: true,
          },
        },
        anamnesis: true,
        consultationNotes: {
          orderBy: { createdAt: "asc" },
        },
        clinicalTasks: {
          where: { deletedAt: null },
          orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
        },
        prescriptionRecords: {
          orderBy: { issuedAt: "desc" },
        },
        adverseEvents: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    const patientGoals = await this.prisma.patientGoal.findMany({
      where: {
        patientId: encounter.patientId,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    return {
      id: encounter.id,
      patient: {
        id: encounter.patient.id,
        name: encounter.patient.fullName,
      },
      professional: {
        id: encounter.professional.id,
        name: encounter.professional.displayName,
      },
      appointment: encounter.appointment
        ? {
            id: encounter.appointment.id,
            type: encounter.appointment.appointmentType.name,
            startsAt: encounter.appointment.startsAt.toISOString(),
            status: encounter.appointment.status,
          }
        : null,
      encounterType: encounter.encounterType,
      status: encounter.status,
      anamnesis: encounter.anamnesis
        ? {
            chiefComplaint: encounter.anamnesis.chiefComplaint,
            historyOfPresentIllness: encounter.anamnesis.historyOfPresentIllness,
            pastMedicalHistory: encounter.anamnesis.pastMedicalHistory,
            lifestyleHistory: encounter.anamnesis.lifestyleHistory,
            notes: encounter.anamnesis.notes,
          }
        : null,
      notes: encounter.consultationNotes.map((note: EncounterNoteRow) => ({
        id: note.id,
        noteType: note.noteType,
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
        signedAt: note.signedAt?.toISOString() ?? null,
      })),
      tasks: encounter.clinicalTasks.map((task: EncounterTaskRow) => ({
        id: task.id,
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
      goals: patientGoals.map((goal: PatientGoalRow) => ({
        id: goal.id,
        title: goal.title,
        goalType: goal.goalType,
        targetValue: goal.targetValue,
        currentValue: goal.currentValue,
        status: goal.status,
        targetDate: goal.targetDate?.toISOString() ?? null,
      })),
      prescriptions: encounter.prescriptionRecords.map((item: PrescriptionRow) => ({
        id: item.id,
        prescriptionType: item.prescriptionType,
        summary: item.summary,
        issuedAt: item.issuedAt.toISOString(),
      })),
      adverseEvents: encounter.adverseEvents.map((event: AdverseEventRow) => ({
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        status: event.status,
        description: event.description,
      })),
    };
  }

  async listTasks(params?: {
    search?: string;
    patient?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    patientId?: string;
  }) {
    const tenantId = await resolveTenantId(this.prisma);
    const search = normalizeTextFilter(params?.search);
    const patient = normalizeTextFilter(params?.patient);
    const priority = normalizeTaskPriorityFilter(params?.priority);
    const status = normalizeTaskStatusFilter(params?.status);

    const tasks = await this.prisma.clinicalTask.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(search
          ? {
              title: {
                contains: search,
                mode: "insensitive" as const,
              },
            }
          : {}),
        ...(patient
          ? {
              patient: {
                is: {
                  fullName: {
                    contains: patient,
                    mode: "insensitive" as const,
                  },
                },
              },
            }
          : {}),
        ...(status ? { status } : {}),
        ...(priority ? { priority } : {}),
        ...(params?.assignedTo ? { assignedToUserId: params.assignedTo } : {}),
        ...(params?.patientId ? { patientId: params.patientId } : {}),
      },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      include: {
        patient: true,
        assignedUser: true,
      },
      take: 100,
    });

    return {
      items: tasks.map((task: ClinicalTaskListRow) => ({
        id: task.id,
        title: task.title,
        patient: task.patient.fullName,
        priority: task.priority,
        status: task.status,
        assignedTo: task.assignedUser?.fullName ?? "-",
        dueAt: task.dueAt?.toISOString() ?? null,
      })),
    };
  }
}

function normalizeTaskPriority(value?: string) {
  const normalizedValue = value?.trim().toUpperCase();

  switch (normalizedValue) {
    case "LOW":
      return ClinicalTaskPriority.LOW;
    case "HIGH":
      return ClinicalTaskPriority.HIGH;
    case "URGENT":
      return ClinicalTaskPriority.URGENT;
    case undefined:
    case "":
    case "MEDIUM":
      return ClinicalTaskPriority.MEDIUM;
    default:
      throw new BadRequestException("Prioridade de tarefa clinica invalida.");
  }
}

function normalizeTaskPriorityFilter(value?: string) {
  const normalizedValue = normalizeTextFilter(value)?.toLowerCase();

  switch (normalizedValue) {
    case "baixa":
    case "low":
      return ClinicalTaskPriority.LOW;
    case "media":
    case "medium":
      return ClinicalTaskPriority.MEDIUM;
    case "alta":
    case "high":
      return ClinicalTaskPriority.HIGH;
    case "urgente":
    case "urgent":
      return ClinicalTaskPriority.URGENT;
    default:
      return undefined;
  }
}

function normalizeTaskStatusFilter(value?: string) {
  const normalizedValue = normalizeTextFilter(value)?.toLowerCase();

  switch (normalizedValue) {
    case "aberta":
    case "aberto":
    case "open":
      return ClinicalTaskStatus.OPEN;
    case "em andamento":
    case "in progress":
    case "in_progress":
      return ClinicalTaskStatus.IN_PROGRESS;
    case "concluida":
    case "concluido":
    case "done":
      return ClinicalTaskStatus.DONE;
    case "cancelada":
    case "cancelado":
    case "cancelled":
      return ClinicalTaskStatus.CANCELLED;
    default:
      return undefined;
  }
}

function normalizeTextFilter(value?: string) {
  const normalizedValue = value?.trim();
  return normalizedValue ? normalizedValue : undefined;
}
