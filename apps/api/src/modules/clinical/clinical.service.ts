import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  AppointmentStatus,
  ClinicalTaskPriority,
  ClinicalTaskStatus,
  EncounterStatus,
  PrescriptionType,
} from "../../../../../generated/prisma/client/enums.ts";
import { mapAppointmentStatusLabel } from "../../common/presenters.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import {
  resolveActorUserIdForRequest,
  resolveTenantIdForRequest,
  resolveUnitIdForRequest,
} from "../../common/auth/request-context.ts";
import {
  completeRuntimeEncounterFromLegacy,
  syncRuntimeClinicalTaskProjection,
  syncRuntimeEncounterProjection,
} from "../../common/runtime/runtime-encounter-writes.ts";
import {
  createRuntimeDocumentPrintableArtifact,
  createRuntimeDocumentSignatureRequest,
  completeRuntimeDocumentEvidencePackage,
  dispatchRuntimeDocumentSignatureRequest,
  getRuntimeDocumentEvidencePackageSummary,
  getRuntimeDocumentLegalEvidenceDossier,
  getRuntimeDocumentOperationalDetail,
  getRuntimeDocumentSignatureProviderReadiness,
  getRuntimeEncounterDocumentSnapshot,
  issueRuntimeEncounterDocument,
  listRuntimeAccessiblePatientDocuments,
  listRuntimeDocumentTemplates,
  prepareRuntimeDocumentEvidencePackage,
  prepareRuntimeDocumentAccess,
  recordRuntimeDocumentEvidencePackageAccessEvent,
  recordRuntimeDocumentAccessEvent,
  type RuntimeDocumentEvidencePackageSummary,
  type RuntimeDocumentAccessTarget,
  type RuntimeDocumentLegalEvidenceDossier,
  type RuntimeDocumentSignatureProviderReadiness,
  type RuntimeDocumentOperationalDetail,
  type RuntimeDocumentTemplate,
} from "../../common/runtime/runtime-document-writes.ts";
import { recordRuntimePrescription } from "../../common/runtime/runtime-prescription-writes.ts";
import {
  autosaveRuntimeEncounterSection,
  clearRuntimeEncounterSoapDraft,
  getRuntimeEncounterAutosaveOverlay,
} from "../../common/runtime/runtime-encounter-drafts.ts";
import {
  scheduleRuntimeReturn,
  syncRuntimeAppointmentProjection,
} from "../../common/runtime/runtime-appointment-writes.ts";
import type { AutosaveEncounterSectionDto } from "./dto/autosave-encounter-section.dto.ts";
import type { CreateDocumentPrintableArtifactDto } from "./dto/create-document-printable-artifact.dto.ts";
import type { CreateDocumentSignatureRequestDto } from "./dto/create-document-signature-request.dto.ts";
import type { CreateEncounterDocumentDto } from "./dto/create-encounter-document.dto.ts";
import type { CreatePrescriptionRecordDto } from "./dto/create-prescription-record.dto.ts";
import type { ScheduleReturnDto } from "./dto/schedule-return.dto.ts";
import { syncPatientRuntimeProjection } from "../../common/runtime/runtime-patient-projection.ts";
import { isApiRealAuthEnabled, isRuntimeSyncEnabled } from "../../common/runtime/runtime-mode.ts";
import { supabaseAdmin } from "../../lib/supabase-admin.ts";
import { PrismaService } from "../../prisma/prisma.service.ts";

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

type MockEncounterDocument = {
  id: string;
  runtimeId: string;
  documentType: string;
  status: string;
  title: string;
  summary: string | null;
  documentNumber: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  signedAt: string | null;
  template: {
    id: string;
    title: string;
    templateKind: string;
    status: string;
  } | null;
  currentVersion: {
    id: string;
    runtimeId: string;
    versionNumber: number;
    status: string;
    title: string;
    summary: string | null;
    content: Record<string, unknown>;
    renderedHtml: string | null;
    storageObjectPath: string | null;
    signedStorageObjectPath: string | null;
    issuedAt: string | null;
    signedAt: string | null;
  } | null;
  signatureRequests: Array<{
    id: string;
    runtimeId: string;
    signerType: string;
    signerName: string | null;
    signerEmail: string | null;
    providerCode: string;
    requestStatus: string;
    requestedAt: string | null;
    expiresAt: string | null;
    completedAt: string | null;
  }>;
  printableArtifacts: Array<{
    id: string;
    runtimeId: string;
    artifactKind: string;
    renderStatus: string;
    storageObjectPath: string | null;
    renderedAt: string | null;
    failureReason: string | null;
  }>;
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

type DocumentAccessLink = {
  id: string;
  artifactKind: string | null;
  downloadUrl: string;
  expiresAt: string;
  fileName: string;
  label: string;
  openUrl: string;
  renderStatus: string | null;
};

type DocumentEvidencePackageAccessLink = {
  documentId: string;
  generatedAt: string;
  expiresAt: string;
  package: RuntimeDocumentEvidencePackageSummary;
  download: {
    downloadUrl: string;
    expiresAt: string;
    fileName: string;
    label: string;
  };
};

type ListDocumentsQuery = {
  patientId?: string;
  status?: string;
  documentType?: string;
  signatureStatus?: string;
  issuedFrom?: string;
  issuedTo?: string;
  limit?: string | number;
  offset?: string | number;
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
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = context?.currentUnitId;

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
          ...(currentUnitId ? { unitId: currentUnitId } : {}),
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
      (await resolveActorUserIdForRequest(
        this.prisma,
        context,
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

    await this.syncRuntimeTaskWithFallback(task.id, dto.patientId, {
      flow: "clinical",
      operation: "create_task",
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
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    const encounter = await this.prisma.encounter.findFirstOrThrow({
      where: {
        id: encounterId,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        patientId: true,
      },
    });

    const anamnesis = await this.prisma.anamnesis.upsert({
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

    await this.syncRuntimeEncounterWithFallback(encounter.id, encounter.patientId, {
      flow: "clinical",
      operation: "save_anamnesis",
    });

    return anamnesis;
  }

  async autosaveEncounterSection(
    encounterId: string,
    dto: AutosaveEncounterSectionDto,
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const actorUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id: encounterId,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!encounter) {
      throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
    }

    if (encounter.status === EncounterStatus.CANCELLED || encounter.status === EncounterStatus.CLOSED) {
      throw new BadRequestException("Nao e possivel salvar rascunho para um atendimento encerrado.");
    }

    const payload =
      dto.section === "anamnesis"
        ? {
            chiefComplaint: dto.chiefComplaint ?? "",
            historyOfPresentIllness: dto.historyOfPresentIllness ?? "",
            pastMedicalHistory: dto.pastMedicalHistory ?? "",
            lifestyleHistory: dto.lifestyleHistory ?? "",
            notes: dto.notes ?? "",
          }
        : {
            subjective: dto.subjective ?? "",
            objective: dto.objective ?? "",
            assessment: dto.assessment ?? "",
            plan: dto.plan ?? "",
          };

    const savedAt = dto.savedAt ? new Date(dto.savedAt) : new Date();
    if (Number.isNaN(savedAt.getTime())) {
      throw new BadRequestException("Timestamp de autosave invalido.");
    }

    const result = await autosaveRuntimeEncounterSection({
      legacyTenantId: tenantId,
      legacyEncounterId: encounter.id,
      section: dto.section,
      payload,
      legacyActorUserId: actorUserId,
      savedAt: savedAt.toISOString(),
      metadata: {
        flow: "clinical",
        operation: "autosave_encounter_section",
      },
    });

    return result;
  }

  async saveSoapNote(encounterId: string, dto: {
    noteType?: string;
    subjective?: string;
    objective?: string;
    assessment?: string;
    plan?: string;
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    const encounter = await this.prisma.encounter.findFirstOrThrow({
      where: {
        id: encounterId,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        patientId: true,
      },
    });

    const signerId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    const note = await this.prisma.consultationNote.create({
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

    await this.syncRuntimeEncounterWithFallback(encounter.id, encounter.patientId, {
      flow: "clinical",
      operation: "save_soap_note",
    });

    await this.clearRuntimeSoapDraftSilently(tenantId, encounter.id);

    return note;
  }

  async listDocumentTemplates(kind?: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    if (!this.isRealAuthEnabled()) {
      return buildMockDocumentTemplates(kind);
    }

    return listRuntimeDocumentTemplates({
      legacyTenantId: tenantId,
      legacyUnitId: currentUnitId,
      templateKind: normalizeDocumentType(kind),
    });
  }

  async getEncounterById(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    if (this.isRealAuthEnabled()) {
      const scopedEncounter = await this.prisma.encounter.findFirst({
        where: {
          id,
          tenantId,
          unitId: currentUnitId,
        },
        select: {
          id: true,
        },
      });

      if (!scopedEncounter) {
        throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
      }

      const runtimeEncounter = await this.getStructuredRuntimeEncounterWithFallback(tenantId, id);
      if (runtimeEncounter) {
        return runtimeEncounter;
      }
    }

    const encounter = await this.prisma.encounter.findFirstOrThrow({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
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

    const runtimeOverlay = await this.getRuntimeEncounterAutosaveOverlaySafely(tenantId, encounter.id);
    const anamnesis = runtimeOverlay.anamnesis ?? (encounter.anamnesis
      ? {
          chiefComplaint: encounter.anamnesis.chiefComplaint,
          historyOfPresentIllness: encounter.anamnesis.historyOfPresentIllness,
          pastMedicalHistory: encounter.anamnesis.pastMedicalHistory,
          lifestyleHistory: encounter.anamnesis.lifestyleHistory,
          notes: encounter.anamnesis.notes,
        }
      : null);

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
      nutritionPlan: null,
      medicalRecord: null,
      sections: buildLegacyEncounterSections({
        hasAnamnesis: Boolean(anamnesis),
        hasSoapDraft: Boolean(runtimeOverlay.soapDraft),
        hasOfficialSoap: encounter.consultationNotes.some(
          (note) => note.noteType?.toLowerCase() !== "soap_draft"
        ),
        goalCount: patientGoals.length,
        carePlanCount: 0,
        prescriptionCount: encounter.prescriptionRecords.length,
      }),
      anamnesis,
      soapDraft: runtimeOverlay.soapDraft,
      notes: encounter.consultationNotes
        .filter((note) => note.noteType?.toLowerCase() !== "soap_draft")
        .map((note: EncounterNoteRow) => ({
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
      carePlan: [],
      documents: [],
      prescriptions: encounter.prescriptionRecords.map((item: PrescriptionRow) => ({
        id: item.id,
        prescriptionType: item.prescriptionType,
        summary: item.summary,
        issuedAt: item.issuedAt.toISOString(),
        items: [],
      })),
      adverseEvents: encounter.adverseEvents.map((event: AdverseEventRow) => ({
        id: event.id,
        eventType: event.eventType,
        severity: event.severity,
        status: event.status,
        description: event.description,
      })),
      problemList: [],
    };
  }

  async createPrescription(
    encounterId: string,
    dto: CreatePrescriptionRecordDto,
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const issuedBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id: encounterId,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        patientId: true,
      },
    });

    if (!encounter) {
      throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
    }

    const normalizedItems = dto.items
      .map((item, index) => ({
        itemType: normalizePrescriptionItemType(item.itemType),
        title: item.title.trim(),
        dosage: normalizeNullableText(item.dosage),
        frequency: normalizeNullableText(item.frequency),
        route: normalizeNullableText(item.route),
        durationDays: item.durationDays ?? null,
        quantity: item.quantity ?? null,
        unit: normalizeNullableText(item.unit),
        instructions: normalizeNullableText(item.instructions),
        position: index + 1,
      }))
      .filter((item) => item.title.length > 0);

    if (!normalizedItems.length) {
      throw new BadRequestException("Informe ao menos um item para registrar a prescricao.");
    }

    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : new Date();
    if (Number.isNaN(issuedAt.getTime())) {
      throw new BadRequestException("A data de emissao da prescricao e invalida.");
    }

    const prescriptionType = normalizePrescriptionType(dto.prescriptionType);
    const summary = buildPrescriptionSummary(dto.summary, normalizedItems);
    const sharedPrescriptionId = randomUUID();

    let runtimeResult:
      | {
          id: string;
          runtimeId: string;
          prescriptionType: string;
          summary: string | null;
          issuedAt: string;
          items: Array<{
            id: string;
            runtimeId: string;
            itemType: string;
            title: string;
            dosage: string | null;
            frequency: string | null;
            route: string | null;
            durationDays: number | null;
            quantity: number | null;
            unit: string | null;
            instructions: string | null;
            position: number | null;
          }>;
        }
      | null = null;

    if (this.isRealAuthEnabled()) {
      try {
        runtimeResult = await recordRuntimePrescription({
          legacyTenantId: tenantId,
          legacyEncounterId: encounter.id,
          legacyPrescriptionId: sharedPrescriptionId,
          prescriptionType,
          summary,
          legacyIssuedByUserId: issuedBy,
          issuedAt: issuedAt.toISOString(),
          items: normalizedItems,
          metadata: {
            flow: "clinical",
            operation: "create_prescription",
          },
        });
      } catch (error) {
        console.error(
          `[runtime:write] Falha na gravacao estruturada de prescricao para encounter ${encounter.id}; aplicando fallback de sync do resumo legado.`,
          error
        );
      }
    }

    await this.prisma.prescriptionRecord.create({
      data: {
        id: sharedPrescriptionId,
        encounterId: encounter.id,
        patientId: encounter.patientId,
        prescriptionType: mapRuntimePrescriptionTypeToLegacy(prescriptionType),
        summary,
        issuedBy,
        issuedAt,
      },
    });

    if (!runtimeResult && this.isRealAuthEnabled()) {
      await this.syncRuntimeEncounterWithFallback(encounter.id, encounter.patientId, {
        flow: "clinical",
        operation: "create_prescription",
      });
    }

    return runtimeResult ?? {
      id: sharedPrescriptionId,
      runtimeId: sharedPrescriptionId,
      prescriptionType: prescriptionType.toUpperCase(),
      summary,
      issuedAt: issuedAt.toISOString(),
      items: normalizedItems.map((item, index) => ({
        id: `legacy-item-${sharedPrescriptionId}-${index + 1}`,
        runtimeId: `legacy-item-${sharedPrescriptionId}-${index + 1}`,
        itemType: item.itemType.toUpperCase(),
        title: item.title,
        dosage: item.dosage,
        frequency: item.frequency,
        route: item.route,
        durationDays: item.durationDays,
        quantity: item.quantity,
        unit: item.unit,
        instructions: item.instructions,
        position: item.position,
      })),
    };
  }

  async createEncounterDocument(
    encounterId: string,
    dto: CreateEncounterDocumentDto,
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const createdByUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id: encounterId,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        patientId: true,
      },
    });

    if (!encounter) {
      throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
    }

    const documentType = normalizeDocumentType(dto.documentType);
    const issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    const title = normalizeNullableText(dto.title);
    const summary = normalizeNullableText(dto.summary);
    const content = dto.content ?? {};

    if (!this.isRealAuthEnabled()) {
      return buildMockEncounterDocument({
        encounterId,
        templateId: dto.templateId ?? null,
        documentType,
        title,
        summary,
        issuedAt,
        expiresAt,
        content,
      });
    }

    try {
      return await issueRuntimeEncounterDocument({
        legacyTenantId: tenantId,
        legacyEncounterId: encounter.id,
        legacyUnitId: currentUnitId,
        documentTemplateId: dto.templateId ?? null,
        documentType,
        title,
        summary,
        issuedAt: issuedAt.toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
        content,
        metadata: {
          flow: "clinical",
          operation: "issue_document",
        },
        legacyCreatedByUserId: createdByUserId,
      });
    } catch (error) {
      console.error(
        `[runtime:write] Falha ao emitir documento estruturado para encounter ${encounter.id}.`,
        error
      );
      throw new BadRequestException("Nao foi possivel emitir o documento estruturado.");
    }
  }

  async createDocumentPrintableArtifact(
    documentId: string,
    dto: CreateDocumentPrintableArtifactDto,
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const actorUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );
    const artifactKind = normalizePrintableArtifactKind(dto.artifactKind);

    if (!this.isRealAuthEnabled()) {
      return buildMockEncounterDocumentPrintableArtifact({
        documentReference: documentId,
        artifactKind,
      });
    }

    try {
      return await createRuntimeDocumentPrintableArtifact({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        artifactKind,
        metadata: {
          flow: "clinical",
          operation: "generate_printable_artifact",
        },
        legacyCreatedByUserId: actorUserId,
      });
    } catch (error) {
      console.error(
        `[runtime:write] Falha ao gerar artefato imprimivel para documento ${documentId}.`,
        error
      );
      throw new BadRequestException("Nao foi possivel gerar o artefato imprimivel.");
    }
  }

  async createDocumentSignatureRequest(
    documentId: string,
    dto: CreateDocumentSignatureRequestDto,
    context?: AppRequestContext
  ) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const actorUserId = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
      throw new BadRequestException("A data de expiracao da assinatura e invalida.");
    }

    const signerType = normalizeSignerType(dto.signerType);
    const providerCode = normalizeSignatureProviderCode(dto.providerCode);
    const signerName = normalizeNullableText(dto.signerName);
    const signerEmail = normalizeNullableEmail(dto.signerEmail);

    if (!this.isRealAuthEnabled()) {
      return buildMockEncounterDocumentSignatureRequest({
        documentReference: documentId,
        signerType,
        signerName,
        signerEmail,
        providerCode,
        expiresAt,
      });
    }

    try {
      const createdDocument = await createRuntimeDocumentSignatureRequest({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        signerType,
        signerName,
        signerEmail,
        providerCode,
        expiresAt: expiresAt?.toISOString() ?? null,
        metadata: {
          flow: "clinical",
          operation: "request_document_signature",
        },
        legacyCreatedByUserId: actorUserId,
      });

      const signatureRequest = createdDocument.signatureRequests[0] ?? null;
      const signatureRequestId = signatureRequest?.runtimeId || signatureRequest?.id;

      if (!signatureRequestId) {
        return createdDocument;
      }

      try {
        return await dispatchRuntimeDocumentSignatureRequest({
          legacyTenantId: tenantId,
          legacyUnitId: currentUnitId,
          documentReference: documentId,
          signatureRequestId,
          providerCode,
        });
      } catch (dispatchError) {
        console.error(
          `[runtime:write] Falha ao despachar assinatura para documento ${documentId}.`,
          dispatchError
        );
        return createdDocument;
      }
    } catch (error) {
      console.error(
        `[runtime:write] Falha ao solicitar assinatura para documento ${documentId}.`,
        error
      );
      throw new BadRequestException("Nao foi possivel solicitar a assinatura do documento.");
    }
  }

  async listDocuments(params: ListDocumentsQuery, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    const limit = normalizeDocumentListNumber(params.limit, 50, 1, 100);
    const offset = normalizeDocumentListNumber(params.offset, 0, 0, 10000);
    const issuedFrom = normalizeDocumentListDate(params.issuedFrom, "issuedFrom", "from");
    const issuedTo = normalizeDocumentListDate(params.issuedTo, "issuedTo", "to");

    if (issuedFrom && issuedTo && Date.parse(issuedFrom) > Date.parse(issuedTo)) {
      throw new BadRequestException("issuedFrom deve ser anterior ou igual a issuedTo.");
    }

    if (!this.isRealAuthEnabled()) {
      return {
        items: [],
        total: 0,
        limit,
        offset,
      };
    }

    try {
      return await listRuntimeAccessiblePatientDocuments({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        patientId: params.patientId,
        status: params.status,
        documentType: params.documentType,
        signatureStatus: params.signatureStatus,
        issuedFrom,
        issuedTo,
        limit,
        offset,
      });
    } catch (error) {
      console.error("[runtime:read] Falha ao listar documentos acessiveis.", error);
      throw new BadRequestException("Nao foi possivel listar os documentos acessiveis.");
    }
  }

  async getDocumentDetail(documentId: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    if (!this.isRealAuthEnabled()) {
      return buildMockDocumentOperationalDetail(documentId);
    }

    try {
      return await getRuntimeDocumentOperationalDetail({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        accessEventLimit: 20,
      });
    } catch (error) {
      console.error(`[runtime:read] Falha ao consultar detalhe operacional do documento ${documentId}.`, error);
      if (isDocumentScopeError(error)) {
        throw new NotFoundException("Documento nao encontrado para a sessao atual.");
      }
      throw new BadRequestException("Nao foi possivel consultar o detalhe do documento.");
    }
  }

  async getDocumentEvidence(documentId: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    if (!this.isRealAuthEnabled()) {
      return {
        ...buildMockDocumentLegalEvidenceDossier(documentId),
        evidencePackage: buildMockDocumentEvidencePackageSummary(documentId, "not_generated"),
      };
    }

    try {
      const actorUserId = await resolveActorUserIdForRequest(this.prisma, context);
      const evidence = await getRuntimeDocumentLegalEvidenceDossier({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        accessEventLimit: 10,
        legacyActorUserId: actorUserId,
        reconsolidate: true,
        auditAccess: true,
      });
      const evidencePackage = await getRuntimeDocumentEvidencePackageSummary({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        eventLimit: 10,
      });
      const providerReadiness = await getRuntimeDocumentSignatureProviderReadiness({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
      });

      return {
        ...evidence,
        evidencePackage,
        providerReadiness,
      };
    } catch (error) {
      if (isDocumentScopeError(error)) {
        throw new NotFoundException("Documento nao encontrado para a sessao atual.");
      }
      console.error(`[runtime:read] Falha ao consultar evidencia juridica do documento ${documentId}.`, error);
      throw new BadRequestException("Nao foi possivel consultar a evidencia juridica do documento.");
    }
  }

  async createDocumentEvidencePackageAccessLink(
    documentId: string,
    context?: AppRequestContext
  ): Promise<DocumentEvidencePackageAccessLink> {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const actorUserId = await resolveActorUserIdForRequest(this.prisma, context);
    const expiresInSeconds = 60 * 10;
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + expiresInSeconds * 1000).toISOString();

    if (!this.isRealAuthEnabled()) {
      const mockPackage = buildMockDocumentEvidencePackageSummary(documentId, "generated");
      const mockPayload = buildDocumentEvidencePackagePayload({
        evidence: {
          ...buildMockDocumentLegalEvidenceDossier(documentId),
          evidencePackage: mockPackage,
        },
        generatedAt: generatedAt.toISOString(),
      });
      const mockJson = stableStringify(mockPayload);
      const finalChecksum = sha256Hex(Buffer.from(mockJson, "utf8"));
      const finalPackage = {
        ...mockPackage,
        checksum: finalChecksum,
        byteSize: Buffer.byteLength(mockJson, "utf8"),
        generatedAt: generatedAt.toISOString(),
      };

      return {
        documentId,
        generatedAt: generatedAt.toISOString(),
        expiresAt,
        package: finalPackage,
        download: {
          downloadUrl: `data:application/json;charset=utf-8,${encodeURIComponent(mockJson)}`,
          expiresAt,
          fileName: finalPackage.fileName ?? "dossie-evidencia.json",
          label: "Pacote de evidencia",
        },
      };
    }

    try {
      const evidence = await getRuntimeDocumentLegalEvidenceDossier({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        accessEventLimit: 20,
        legacyActorUserId: actorUserId,
        reconsolidate: true,
        auditAccess: false,
      });

      if (evidence.evidenceStatus === "missing") {
        throw new BadRequestException("Este documento ainda nao possui evidencia juridica para empacotar.");
      }

      const packagePreparation = await prepareRuntimeDocumentEvidencePackage({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        legacyActorUserId: actorUserId,
        metadata: {
          evidenceStatus: evidence.evidenceStatus,
          verificationStatus: evidence.verificationStatus,
        },
      });
      const packagePayload = buildDocumentEvidencePackagePayload({
        evidence: {
          ...evidence,
          evidencePackage: undefined,
        },
        generatedAt: generatedAt.toISOString(),
      });
      const payloadHash = sha256Hex(Buffer.from(stableStringify(packagePayload), "utf8"));
      const finalPayload = {
        ...packagePayload,
        package: {
          ...packagePayload.package,
          payloadHash,
        },
      };
      const packageJson = stableStringify(finalPayload);
      const packageBytes = Buffer.from(packageJson, "utf8");
      const checksum = sha256Hex(packageBytes);

      const uploadResult = await supabaseAdmin.storage
        .from(packagePreparation.storageBucket)
        .upload(packagePreparation.storageObjectPath, packageBytes, {
          contentType: packagePreparation.contentType,
          upsert: false,
        });

      if (uploadResult.error) {
        await completeRuntimeDocumentEvidencePackage({
          legacyTenantId: tenantId,
          legacyUnitId: currentUnitId,
          documentReference: documentId,
          packageReference: packagePreparation.id,
          packageStatus: "failed",
          failureReason: uploadResult.error.message,
          legacyActorUserId: actorUserId,
          metadata: {
            phase: "storage_upload",
          },
        }).catch((auditError) => {
          console.error("[runtime:write] Falha ao auditar erro de pacote de evidencia.", auditError);
        });

        throw new Error(`Falha ao armazenar pacote de evidencia: ${uploadResult.error.message}`);
      }

      const completedPackage = await completeRuntimeDocumentEvidencePackage({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
        packageReference: packagePreparation.id,
        packageStatus: "generated",
        checksum,
        byteSize: packageBytes.byteLength,
        legacyActorUserId: actorUserId,
        metadata: {
          payloadHash,
          evidenceStatus: evidence.evidenceStatus,
          verificationStatus: evidence.verificationStatus,
        },
      });

      const signedUrlResult = await supabaseAdmin.storage
        .from(packagePreparation.storageBucket)
        .createSignedUrl(packagePreparation.storageObjectPath, expiresInSeconds, {
          download: completedPackage.fileName ?? packagePreparation.fileName,
        });

      if (signedUrlResult.error) {
        await recordRuntimeDocumentEvidencePackageAccessEvent({
          accessStatus: "storage_error",
          documentReference: documentId,
          legacyActorUserId: actorUserId,
          legacyTenantId: tenantId,
          legacyUnitId: currentUnitId,
          packageReference: packagePreparation.id,
          signedUrlExpiresAt: expiresAt,
          metadata: {
            phase: "signed_url",
            checksum,
          },
        }).catch((auditError) => {
          console.error("[runtime:read] Falha ao auditar erro de storage do pacote de evidencia.", auditError);
        });

        throw new Error(`Falha ao gerar signed URL do pacote de evidencia: ${signedUrlResult.error.message}`);
      }

      await recordRuntimeDocumentEvidencePackageAccessEvent({
        accessStatus: "granted",
        documentReference: documentId,
        legacyActorUserId: actorUserId,
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        packageReference: packagePreparation.id,
        signedUrlExpiresAt: expiresAt,
        metadata: {
          checksum,
          byteSize: packageBytes.byteLength,
        },
      });

      return {
        documentId,
        generatedAt: generatedAt.toISOString(),
        expiresAt,
        package: completedPackage,
        download: {
          downloadUrl: signedUrlResult.data.signedUrl,
          expiresAt,
          fileName: completedPackage.fileName ?? packagePreparation.fileName,
          label: "Pacote de evidencia",
        },
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      if (isDocumentScopeError(error)) {
        throw new NotFoundException("Documento nao encontrado para a sessao atual.");
      }
      console.error(`[runtime:write] Falha ao gerar pacote de evidencia do documento ${documentId}.`, error);
      throw new BadRequestException("Nao foi possivel gerar o pacote de evidencia juridica.");
    }
  }

  async getDocumentAccessLinks(documentId: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const expiresInSeconds = 60 * 10;
    const generatedAt = new Date();
    const expiresAt = new Date(generatedAt.getTime() + expiresInSeconds * 1000).toISOString();

    if (!this.isRealAuthEnabled()) {
      const mockDocument = buildMockEncounterDocumentPrintableArtifact({
        documentReference: documentId,
        artifactKind: "preview",
      });
      return {
        documentId: mockDocument.id,
        generatedAt: generatedAt.toISOString(),
        expiresAt,
        currentVersion: buildMockDocumentAccessLink(mockDocument),
        artifacts: mockDocument.printableArtifacts
          .map((artifact) => buildMockArtifactAccessLink(mockDocument, artifact))
          .filter((artifact): artifact is DocumentAccessLink => Boolean(artifact)),
      };
    }

    try {
      const document = await getRuntimeEncounterDocumentSnapshot({
        legacyTenantId: tenantId,
        legacyUnitId: currentUnitId,
        documentReference: documentId,
      });
      const actorUserId = await resolveActorUserIdForRequest(this.prisma, context);

      const currentVersionPath =
        document.currentVersion?.signedStorageObjectPath ?? document.currentVersion?.storageObjectPath;
      const currentVersionLink = currentVersionPath
        ? await this.createAuditedSignedDocumentAccessLink({
            artifactReference: null,
            documentReference: document.id,
            expiresAt,
            expiresInSeconds,
            label: document.signedAt ? "Documento assinado" : "Versao atual",
            legacyActorUserId: actorUserId,
            legacyTenantId: tenantId,
            legacyUnitId: currentUnitId,
            preferredFileNameLabel: "documento",
            responseArtifactKind: "document_version",
            responseArtifactId: document.currentVersion?.id ?? document.id,
            responseRenderStatus: document.currentVersion?.status ?? document.status,
          })
        : null;

      const artifactLinks = (
        await Promise.all(
          document.printableArtifacts.map(async (artifact) => {
            if (!artifact.storageObjectPath) {
              return null;
            }

            return this.createAuditedSignedDocumentAccessLink({
              artifactReference: artifact.id,
              documentReference: document.id,
              expiresAt,
              expiresInSeconds,
              label: buildDocumentArtifactLabel(artifact.artifactKind),
              legacyActorUserId: actorUserId,
              legacyTenantId: tenantId,
              legacyUnitId: currentUnitId,
              preferredFileNameLabel: "artefato",
              responseArtifactKind: artifact.artifactKind,
              responseArtifactId: artifact.id,
              responseRenderStatus: artifact.renderStatus,
            });
          })
        )
      ).filter((artifact): artifact is DocumentAccessLink => Boolean(artifact));

      return {
        documentId: document.id,
        generatedAt: generatedAt.toISOString(),
        expiresAt,
        currentVersion: currentVersionLink,
        artifacts: artifactLinks,
      };
    } catch (error) {
      console.error(
        `[runtime:read] Falha ao resolver access links do documento ${documentId}.`,
        error
      );
      throw new BadRequestException("Nao foi possivel preparar o acesso seguro ao documento.");
    }
  }

  async completeEncounter(id: string, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        patientId: true,
        status: true,
        closedAt: true,
        appointmentId: true,
        appointment: {
          select: {
            status: true,
          },
        },
      },
    });

    if (!encounter) {
      throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
    }

    if (encounter.status === EncounterStatus.CANCELLED) {
      throw new BadRequestException("Nao e possivel concluir um atendimento cancelado.");
    }

    const closedAt = encounter.closedAt ?? new Date();

    const completedEncounter = await this.prisma.$transaction(async (tx: any) => {
      const updatedEncounter =
        encounter.status === EncounterStatus.CLOSED
          ? {
              id: encounter.id,
              status: encounter.status,
              closedAt,
            }
          : await tx.encounter.update({
              where: { id: encounter.id },
              data: {
                status: EncounterStatus.CLOSED,
                closedAt,
              },
              select: {
                id: true,
                status: true,
                closedAt: true,
              },
            });

      let updatedAppointmentStatus: AppointmentStatus | null = encounter.appointment?.status ?? null;

      if (
        encounter.appointmentId &&
        updatedAppointmentStatus !== AppointmentStatus.CANCELLED &&
        updatedAppointmentStatus !== AppointmentStatus.NO_SHOW &&
        updatedAppointmentStatus !== AppointmentStatus.COMPLETED
      ) {
        const updatedAppointment = await tx.appointment.update({
          where: { id: encounter.appointmentId },
          data: {
            status: AppointmentStatus.COMPLETED,
          },
          select: {
            status: true,
          },
        });

        updatedAppointmentStatus = updatedAppointment.status;
      }

      return {
        encounter: updatedEncounter,
        appointmentStatus: updatedAppointmentStatus,
      };
    });

    const runtimeCompleteResult = await this.completeRuntimeEncounterWithFallback(
      {
        legacyTenantId: tenantId,
        legacyEncounterId: encounter.id,
        closedAt: completedEncounter.encounter.closedAt.toISOString(),
        metadata: {
          flow: "clinical",
          operation: "complete_encounter",
        },
      },
      encounter.patientId
    );

    return {
      id: completedEncounter.encounter.id,
      status: completedEncounter.encounter.status,
      closedAt: completedEncounter.encounter.closedAt.toISOString(),
      appointmentStatus: completedEncounter.appointmentStatus
        ? mapAppointmentStatusLabel(completedEncounter.appointmentStatus)
        : null,
      queueStatus: runtimeCompleteResult?.queueStatus
        ? mapQueueStatusLabel(runtimeCompleteResult.queueStatus)
        : null,
    };
  }

  async scheduleReturn(id: string, dto: ScheduleReturnDto, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = await resolveUnitIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_UNIT_CODE
    );
    const scheduledBy = await resolveActorUserIdForRequest(
      this.prisma,
      context,
      process.env.DEFAULT_CLINICAL_USER_EMAIL
    );

    const encounter = await this.prisma.encounter.findFirst({
      where: {
        id,
        tenantId,
        unitId: currentUnitId,
      },
      select: {
        id: true,
        tenantId: true,
        unitId: true,
        patientId: true,
        professionalId: true,
        status: true,
        appointment: {
          select: {
            id: true,
            startsAt: true,
            endsAt: true,
            appointmentTypeId: true,
            professionalId: true,
            appointmentType: {
              select: {
                id: true,
                code: true,
                name: true,
                defaultDurationMinutes: true,
                active: true,
                generatesEncounter: true,
              },
            },
          },
        },
      },
    });

    if (!encounter) {
      throw new NotFoundException("Atendimento nao encontrado para o tenant atual.");
    }

    if (encounter.status === EncounterStatus.CANCELLED) {
      throw new BadRequestException("Nao e possivel agendar retorno para um atendimento cancelado.");
    }

    const appointmentType = await this.resolveReturnAppointmentType(tenantId, encounter, dto.appointmentTypeId);
    const professionalId = dto.professionalId ?? encounter.professionalId ?? encounter.appointment?.professionalId ?? null;

    if (!professionalId) {
      throw new BadRequestException("Nao e possivel agendar retorno sem profissional responsavel.");
    }

    if (dto.professionalId) {
      const professional = await this.prisma.professional.findFirst({
        where: {
          id: dto.professionalId,
          tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!professional) {
        throw new NotFoundException("Profissional nao encontrado para o tenant atual.");
      }
    }

    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException("Data de retorno invalida.");
    }

    const defaultDurationMinutes =
      appointmentType.defaultDurationMinutes ||
      (encounter.appointment
        ? Math.max(
            15,
            Math.round(
              (encounter.appointment.endsAt.getTime() - encounter.appointment.startsAt.getTime()) / (60 * 1000)
            )
          )
        : 30);

    const endsAt = dto.endsAt
      ? new Date(dto.endsAt)
      : new Date(startsAt.getTime() + defaultDurationMinutes * 60 * 1000);

    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new BadRequestException("Periodo de retorno invalido.");
    }

    const notes = buildScheduleReturnNotes(dto.notes, encounter.id);

    const appointment = await this.prisma.appointment.create({
      data: {
        tenantId,
        unitId: encounter.unitId,
        patientId: encounter.patientId,
        professionalId,
        appointmentTypeId: appointmentType.id,
        startsAt,
        endsAt,
        status: AppointmentStatus.SCHEDULED,
        source: "INTERNAL",
        notes,
        createdBy: scheduledBy,
      },
      select: {
        id: true,
        status: true,
        startsAt: true,
        endsAt: true,
      },
    });

    await this.scheduleRuntimeReturnWithFallback(
      {
        legacyTenantId: tenantId,
        legacyEncounterId: encounter.id,
        legacyReturnAppointmentId: appointment.id,
        legacyUnitId: encounter.unitId,
        legacyPatientId: encounter.patientId,
        legacyAppointmentTypeId: appointmentType.id,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
        notes,
        legacyProfessionalId: professionalId,
        legacyActorUserId: scheduledBy,
        metadata: {
          flow: "clinical",
          operation: "schedule_return",
        },
      },
      appointment.id,
      encounter.patientId
    );

    return {
      id: appointment.id,
      encounterId: encounter.id,
      status: mapAppointmentStatusLabel(appointment.status),
      startsAt: appointment.startsAt.toISOString(),
      endsAt: appointment.endsAt.toISOString(),
    };
  }

  async listTasks(params?: {
    search?: string;
    patient?: string;
    status?: string;
    priority?: string;
    assignedTo?: string;
    patientId?: string;
  }, context?: AppRequestContext) {
    const tenantId = await resolveTenantIdForRequest(this.prisma, context);
    const currentUnitId = context?.currentUnitId;
    const search = normalizeTextFilter(params?.search);
    const patient = normalizeTextFilter(params?.patient);
    const priority = normalizeTaskPriorityFilter(params?.priority);
    const status = normalizeTaskStatusFilter(params?.status);

    const tasks = await this.prisma.clinicalTask.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(currentUnitId
          ? {
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
            }
          : {}),
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

  private async createAuditedSignedDocumentAccessLink(params: {
    artifactReference: string | null;
    documentReference: string;
    expiresAt: string;
    expiresInSeconds: number;
    label: string;
    legacyActorUserId: string | null;
    legacyTenantId: string;
    legacyUnitId: string;
    preferredFileNameLabel: string;
    responseArtifactId: string;
    responseArtifactKind: string | null;
    responseRenderStatus: string | null;
  }): Promise<DocumentAccessLink> {
    const accessTarget = await prepareRuntimeDocumentAccess({
      legacyTenantId: params.legacyTenantId,
      legacyUnitId: params.legacyUnitId,
      documentReference: params.documentReference,
      artifactReference: params.artifactReference,
    });
    const fileName = buildDocumentArtifactFileName(
      accessTarget.documentTitle,
      accessTarget.artifactKind ?? accessTarget.documentType,
      accessTarget.storageObjectPath,
      params.preferredFileNameLabel
    );
    const [openResult, downloadResult] = await Promise.all([
      supabaseAdmin.storage.from(accessTarget.storageBucket).createSignedUrl(
        accessTarget.storageObjectPath,
        params.expiresInSeconds
      ),
      supabaseAdmin.storage.from(accessTarget.storageBucket).createSignedUrl(
        accessTarget.storageObjectPath,
        params.expiresInSeconds,
        { download: fileName }
      ),
    ]);

    if (openResult.error) {
      await this.recordDocumentAccessStorageError(accessTarget, params, "open");
      throw new Error(
        `Falha ao gerar signed URL inline para ${accessTarget.storageObjectPath}: ${openResult.error.message}`
      );
    }

    if (downloadResult.error) {
      await this.recordDocumentAccessStorageError(accessTarget, params, "download");
      throw new Error(
        `Falha ao gerar signed URL de download para ${accessTarget.storageObjectPath}: ${downloadResult.error.message}`
      );
    }

    await recordRuntimeDocumentAccessEvent({
      accessAction: "open",
      accessStatus: "granted",
      artifactReference: accessTarget.printableArtifactId,
      documentReference: accessTarget.documentId,
      documentVersionReference: accessTarget.documentVersionId,
      legacyActorUserId: params.legacyActorUserId,
      legacyTenantId: params.legacyTenantId,
      legacyUnitId: params.legacyUnitId,
      signedUrlExpiresAt: params.expiresAt,
      storageBucket: accessTarget.storageBucket,
      storageObjectPath: accessTarget.storageObjectPath,
      metadata: {
        targetKind: accessTarget.targetKind,
        artifactKind: accessTarget.artifactKind,
      },
    });

    await recordRuntimeDocumentAccessEvent({
      accessAction: "download",
      accessStatus: "granted",
      artifactReference: accessTarget.printableArtifactId,
      documentReference: accessTarget.documentId,
      documentVersionReference: accessTarget.documentVersionId,
      legacyActorUserId: params.legacyActorUserId,
      legacyTenantId: params.legacyTenantId,
      legacyUnitId: params.legacyUnitId,
      signedUrlExpiresAt: params.expiresAt,
      storageBucket: accessTarget.storageBucket,
      storageObjectPath: accessTarget.storageObjectPath,
      metadata: {
        targetKind: accessTarget.targetKind,
        artifactKind: accessTarget.artifactKind,
      },
    });

    return {
      id: params.responseArtifactId || accessTarget.id,
      artifactKind: params.responseArtifactKind ?? accessTarget.artifactKind,
      downloadUrl: downloadResult.data.signedUrl,
      expiresAt: params.expiresAt,
      fileName,
      label: params.label,
      openUrl: openResult.data.signedUrl,
      renderStatus: params.responseRenderStatus ?? accessTarget.renderStatus,
    };
  }

  private async recordDocumentAccessStorageError(
    accessTarget: RuntimeDocumentAccessTarget,
    params: {
      expiresAt: string;
      legacyActorUserId: string | null;
      legacyTenantId: string;
      legacyUnitId: string;
    },
    accessAction: "open" | "download"
  ) {
    try {
      await recordRuntimeDocumentAccessEvent({
        accessAction,
        accessStatus: "storage_error",
        artifactReference: accessTarget.printableArtifactId,
        documentReference: accessTarget.documentId,
        documentVersionReference: accessTarget.documentVersionId,
        legacyActorUserId: params.legacyActorUserId,
        legacyTenantId: params.legacyTenantId,
        legacyUnitId: params.legacyUnitId,
        signedUrlExpiresAt: params.expiresAt,
        storageBucket: accessTarget.storageBucket,
        storageObjectPath: accessTarget.storageObjectPath,
        metadata: {
          targetKind: accessTarget.targetKind,
          artifactKind: accessTarget.artifactKind,
        },
      });
    } catch (auditError) {
      console.error("[runtime:read] Falha ao auditar erro de storage do broker documental.", auditError);
    }
  }

  private isRealAuthEnabled() {
    return isApiRealAuthEnabled();
  }

  private isRuntimeSyncEnabled() {
    return isRuntimeSyncEnabled();
  }

  private async getStructuredRuntimeEncounterWithFallback(
    legacyTenantId: string,
    legacyEncounterId: string
  ) {
    const directSnapshot = await this.fetchStructuredRuntimeEncounterSnapshot(
      legacyTenantId,
      legacyEncounterId
    );

    if (directSnapshot) {
      return directSnapshot;
    }

    try {
      await syncRuntimeEncounterProjection(this.prisma, legacyEncounterId, {
        flow: "clinical",
        operation: "read_structured_encounter_bootstrap",
      });
    } catch (error) {
      console.error(
        `[runtime:read] Falha ao bootstrapar encounter ${legacyEncounterId} antes da leitura estruturada; mantendo fallback legado.`,
        error
      );
      return null;
    }

    return this.fetchStructuredRuntimeEncounterSnapshot(legacyTenantId, legacyEncounterId);
  }

  private async fetchStructuredRuntimeEncounterSnapshot(
    legacyTenantId: string,
    legacyEncounterId: string
  ) {
    try {
      const { data, error } = await supabaseAdmin.rpc("get_structured_encounter_snapshot", {
        p_legacy_tenant_id: legacyTenantId,
        p_legacy_encounter_id: legacyEncounterId,
      });

      if (error) {
        console.error(
          `[runtime:read] Falha ao consultar snapshot estruturado do encounter ${legacyEncounterId}; mantendo fallback legado.`,
          error
        );
        return null;
      }

      if (!data || typeof data !== "object" || Array.isArray(data)) {
        return null;
      }

      const payload = data as Record<string, unknown>;
      if (payload.ready !== true) {
        return null;
      }

      const encounter = payload.encounter;
      if (!encounter || typeof encounter !== "object" || Array.isArray(encounter)) {
        return null;
      }

      return encounter;
    } catch (error) {
      console.error(
        `[runtime:read] Falha inesperada ao carregar snapshot estruturado do encounter ${legacyEncounterId}; mantendo fallback legado.`,
        error
      );
      return null;
    }
  }

  private async syncRuntimeEncounterWithFallback(
    legacyEncounterId: string,
    legacyPatientId: string,
    options: Parameters<typeof syncRuntimeEncounterProjection>[2]
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return;
    }

    try {
      await syncRuntimeEncounterProjection(this.prisma, legacyEncounterId, options);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na projecao dedicada de encounter para ${legacyEncounterId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
    }
  }

  private async completeRuntimeEncounterWithFallback(
    params: Parameters<typeof completeRuntimeEncounterFromLegacy>[0],
    legacyPatientId: string
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return null;
    }

    try {
      return await completeRuntimeEncounterFromLegacy(params);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na transicao dedicada de complete encounter para ${params.legacyEncounterId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
      return null;
    }
  }

  private async scheduleRuntimeReturnWithFallback(
    params: Parameters<typeof scheduleRuntimeReturn>[0],
    legacyAppointmentId: string,
    legacyPatientId: string
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return null;
    }

    try {
      return await scheduleRuntimeReturn(params);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na operacao dedicada de schedule return para ${params.legacyEncounterId}; aplicando fallback da projecao de agenda.`,
        error
      );
      await this.syncRuntimeAppointmentWithFallback(legacyAppointmentId, legacyPatientId, {
        flow: "clinical",
        operation: "schedule_return",
      });
      return null;
    }
  }

  private async syncRuntimeAppointmentWithFallback(
    legacyAppointmentId: string,
    legacyPatientId: string,
    options: Parameters<typeof syncRuntimeAppointmentProjection>[2]
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return;
    }

    try {
      await syncRuntimeAppointmentProjection(this.prisma, legacyAppointmentId, options);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na projecao dedicada de agenda para ${legacyAppointmentId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
    }
  }

  private async getRuntimeEncounterAutosaveOverlaySafely(
    legacyTenantId: string,
    legacyEncounterId: string
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return {
        anamnesis: null,
        soapDraft: null,
      };
    }

    try {
      return await getRuntimeEncounterAutosaveOverlay({
        legacyTenantId,
        legacyEncounterId,
      });
    } catch (error) {
      console.error(
        `[runtime:read] Falha ao carregar overlay de autosave para encounter ${legacyEncounterId}; retornando detalhe legado.`,
        error
      );
      return {
        anamnesis: null,
        soapDraft: null,
      };
    }
  }

  private async clearRuntimeSoapDraftSilently(legacyTenantId: string, legacyEncounterId: string) {
    if (!this.isRuntimeSyncEnabled()) {
      return;
    }

    try {
      await clearRuntimeEncounterSoapDraft({
        legacyTenantId,
        legacyEncounterId,
      });
    } catch (error) {
      console.error(
        `[runtime:write] Falha ao limpar draft SOAP do encounter ${legacyEncounterId}; mantendo fluxo principal concluido.`,
        error
      );
    }
  }

  private async syncRuntimeTaskWithFallback(
    legacyTaskId: string,
    legacyPatientId: string,
    options: Parameters<typeof syncRuntimeClinicalTaskProjection>[2]
  ) {
    if (!this.isRuntimeSyncEnabled()) {
      return;
    }

    try {
      await syncRuntimeClinicalTaskProjection(this.prisma, legacyTaskId, options);
    } catch (error) {
      console.error(
        `[runtime:write] Falha na projecao dedicada de tarefa clinica para ${legacyTaskId}; aplicando fallback de sync incremental do paciente.`,
        error
      );
      await syncPatientRuntimeProjection(this.prisma, legacyPatientId);
    }
  }

  private async resolveReturnAppointmentType(
    tenantId: string,
    encounter: {
      appointment: {
        appointmentTypeId: string;
        appointmentType: {
          id: string;
          code: string;
          name: string;
          defaultDurationMinutes: number;
          active: boolean;
          generatesEncounter: boolean;
        } | null;
      } | null;
    },
    requestedAppointmentTypeId?: string
  ) {
    if (requestedAppointmentTypeId) {
      const explicitType = await this.prisma.appointmentType.findFirst({
        where: {
          id: requestedAppointmentTypeId,
          tenantId,
          active: true,
        },
        select: {
          id: true,
          code: true,
          name: true,
          defaultDurationMinutes: true,
          active: true,
          generatesEncounter: true,
        },
      });

      if (!explicitType) {
        throw new NotFoundException("Tipo de agendamento de retorno nao encontrado.");
      }

      return explicitType;
    }

    const activeTypes = await this.prisma.appointmentType.findMany({
      where: {
        tenantId,
        active: true,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        id: true,
        code: true,
        name: true,
        defaultDurationMinutes: true,
        active: true,
        generatesEncounter: true,
      },
    });

    if (!activeTypes.length) {
      throw new NotFoundException("Nenhum tipo de agendamento ativo foi encontrado para o tenant atual.");
    }

    const currentAppointmentType = encounter.appointment?.appointmentTypeId
      ? activeTypes.find((appointmentType) => appointmentType.id === encounter.appointment?.appointmentTypeId) ?? null
      : null;

    if (
      currentAppointmentType &&
      looksLikeReturnAppointmentType(currentAppointmentType.code, currentAppointmentType.name)
    ) {
      return currentAppointmentType;
    }

    const explicitReturnType = activeTypes.find((appointmentType) =>
      looksLikeReturnAppointmentType(appointmentType.code, appointmentType.name)
    );

    if (explicitReturnType) {
      return explicitReturnType;
    }

    if (currentAppointmentType) {
      return currentAppointmentType;
    }

    return activeTypes.find((appointmentType) => appointmentType.generatesEncounter) ?? activeTypes[0];
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

function normalizeOperationalText(value?: string | null) {
  return value
    ?.normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase() ?? "";
}

function looksLikeReturnAppointmentType(code?: string | null, name?: string | null) {
  const normalized = `${normalizeOperationalText(code)} ${normalizeOperationalText(name)}`.trim();

  return (
    normalized.includes("retorno") ||
    normalized.includes("follow") ||
    normalized.includes("review") ||
    normalized.includes("revis")
  );
}

function buildScheduleReturnNotes(notes: string | undefined, encounterId: string) {
  const detail = "Retorno agendado a partir do atendimento clinico.";
  const reference = `Origem do retorno: encounter ${encounterId}.`;
  return [notes?.trim(), detail, reference].filter(Boolean).join("\n");
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

function buildLegacyEncounterSections(params: {
  hasAnamnesis: boolean;
  hasSoapDraft: boolean;
  hasOfficialSoap: boolean;
  goalCount: number;
  carePlanCount: number;
  prescriptionCount: number;
}) {
  return [
    {
      id: "legacy-anamnesis",
      code: "anamnesis",
      label: "Anamnese",
      position: 1,
      completionState: params.hasAnamnesis ? "completed" : "pending",
      isRequired: true,
      summary: params.hasAnamnesis ? "Anamnese registrada." : "Sem anamnese estruturada.",
      completedAt: null,
    },
    {
      id: "legacy-soap",
      code: "soap",
      label: "Evolucao SOAP",
      position: 2,
      completionState: params.hasOfficialSoap
        ? "completed"
        : params.hasSoapDraft
          ? "in_progress"
          : "pending",
      isRequired: true,
      summary: params.hasOfficialSoap
        ? "SOAP oficial registrado."
        : params.hasSoapDraft
          ? "Rascunho SOAP em andamento."
          : "Sem SOAP oficial.",
      completedAt: null,
    },
    {
      id: "legacy-problem-list",
      code: "problem_list",
      label: "Problemas",
      position: 3,
      completionState: "pending",
      isRequired: false,
      summary: "Sem lista de problemas estruturada no fallback legado.",
      completedAt: null,
    },
    {
      id: "legacy-goals",
      code: "goals",
      label: "Metas",
      position: 4,
      completionState: params.goalCount > 0 ? "completed" : "pending",
      isRequired: false,
      summary: params.goalCount > 0 ? `${params.goalCount} meta(s) ativa(s).` : "Sem metas clinicas.",
      completedAt: null,
    },
    {
      id: "legacy-care-plan",
      code: "care_plan",
      label: "Plano de cuidado",
      position: 5,
      completionState: params.carePlanCount > 0 ? "completed" : "pending",
      isRequired: false,
      summary:
        params.carePlanCount > 0
          ? `${params.carePlanCount} item(ns) estruturado(s).`
          : "Sem plano de cuidado ativo.",
      completedAt: null,
    },
    {
      id: "legacy-prescriptions",
      code: "prescriptions",
      label: "Prescricoes",
      position: 6,
      completionState: params.prescriptionCount > 0 ? "completed" : "pending",
      isRequired: false,
      summary:
        params.prescriptionCount > 0
          ? `${params.prescriptionCount} registro(s) emitido(s).`
          : "Sem prescricoes ou orientacoes.",
      completedAt: null,
    },
  ];
}

function normalizeNullableText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizePrescriptionType(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "prescription":
      return "prescription";
    case "orientation":
      return "orientation";
    case "supplement_plan":
    case "supplement-plan":
    case "supplement":
      return "supplement_plan";
    case "training_guidance":
    case "training-guidance":
    case "training":
      return "training_guidance";
    default:
      return "other";
  }
}

function normalizePrescriptionItemType(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "medication":
      return "medication";
    case "supplement":
      return "supplement";
    case "orientation":
      return "orientation";
    case "exam":
      return "exam";
    case "compound":
      return "compound";
    default:
      return "other";
  }
}

function buildPrescriptionSummary(
  rawSummary: string | null | undefined,
  items: Array<{ title: string }>
) {
  const explicitSummary = normalizeNullableText(rawSummary);
  if (explicitSummary) {
    return explicitSummary;
  }

  const titles = items
    .map((item) => item.title.trim())
    .filter(Boolean)
    .slice(0, 3);

  if (!titles.length) {
    return null;
  }

  return titles.join("; ");
}

function mapRuntimePrescriptionTypeToLegacy(value: string): PrescriptionType {
  switch (value) {
    case "prescription":
      return PrescriptionType.PRESCRIPTION;
    case "orientation":
      return PrescriptionType.ORIENTATION;
    case "supplement_plan":
      return PrescriptionType.SUPPLEMENT_PLAN;
    case "training_guidance":
      return PrescriptionType.TRAINING_GUIDANCE;
    default:
      return PrescriptionType.OTHER;
  }
}

function normalizeDocumentType(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "report":
      return "report";
    case "consent":
      return "consent";
    case "prescription":
      return "prescription";
    case "orientation":
      return "orientation";
    case "exam_request":
    case "exam-request":
      return "exam_request";
    case "certificate":
      return "certificate";
    default:
      return "custom";
  }
}

function normalizePrintableArtifactKind(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "preview":
      return "preview";
    case "html":
      return "html";
    case "pdf":
      return "pdf";
    case "print_package":
    case "print-package":
      return "print_package";
    default:
      return "preview";
  }
}

function normalizeSignerType(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "patient":
      return "patient";
    case "professional":
      return "professional";
    case "guardian":
      return "guardian";
    case "witness":
      return "witness";
    default:
      return "other";
  }
}

function normalizeSignatureProviderCode(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized || "mock";
}

function normalizeNullableEmail(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : null;
}

function buildMockDocumentTemplates(kind?: string): RuntimeDocumentTemplate[] {
  const templates: RuntimeDocumentTemplate[] = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Relatorio de evolucao",
      description: "Modelo enxuto para registrar impressao clinica e conduta.",
      templateKind: "report",
      templateScope: "tenant",
      status: "active",
      currentVersion: {
        id: "11111111-1111-4111-8111-111111111101",
        runtimeId: "11111111-1111-4111-8111-111111111101",
        versionNumber: 1,
        status: "published",
        title: "Relatorio de evolucao",
        summary: "Versao inicial do relatorio clinico.",
        content: {
          sections: ["resumo", "conduta", "orientacoes"],
        },
        renderSchema: {},
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveTo: null,
        publishedAt: new Date().toISOString(),
      },
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      title: "Orientacoes de alta",
      description: "Modelo rapido para orientacoes pos-consulta.",
      templateKind: "orientation",
      templateScope: "tenant",
      status: "active",
      currentVersion: {
        id: "22222222-2222-4222-8222-222222222202",
        runtimeId: "22222222-2222-4222-8222-222222222202",
        versionNumber: 1,
        status: "published",
        title: "Orientacoes de alta",
        summary: "Checklist padrao de cuidados domiciliares.",
        content: {
          sections: ["medicacoes", "cuidados", "retorno"],
        },
        renderSchema: {},
        effectiveFrom: new Date().toISOString().slice(0, 10),
        effectiveTo: null,
        publishedAt: new Date().toISOString(),
      },
    },
  ];

  const normalizedKind = normalizeDocumentType(kind);
  if (!kind) {
    return templates;
  }

  return templates.filter((template) => template.templateKind === normalizedKind);
}

function buildMockEncounterDocument(params: {
  encounterId: string;
  templateId: string | null;
  documentType: string;
  title: string | null;
  summary: string | null;
  issuedAt: Date;
  expiresAt: Date | null;
  content: Record<string, unknown>;
}): MockEncounterDocument {
  const baseId = randomUUID();
  const versionId = randomUUID();

  return {
    id: baseId,
    runtimeId: baseId,
    documentType: params.documentType,
    status: "issued",
    title: params.title ?? "Documento emitido",
    summary: params.summary,
    documentNumber: null,
    issuedAt: params.issuedAt.toISOString(),
    expiresAt: params.expiresAt?.toISOString() ?? null,
    signedAt: null,
    template: params.templateId
      ? {
          id: params.templateId,
          title: "Template selecionado",
          templateKind: params.documentType,
          status: "active",
        }
      : null,
    currentVersion: {
      id: versionId,
      runtimeId: versionId,
      versionNumber: 1,
      status: "issued",
      title: params.title ?? "Documento emitido",
      summary: params.summary,
      content: params.content,
      renderedHtml: null,
      storageObjectPath: null,
      signedStorageObjectPath: null,
      issuedAt: params.issuedAt.toISOString(),
      signedAt: null,
    },
    signatureRequests: [],
    printableArtifacts: [],
  };
}

function buildMockEncounterDocumentPrintableArtifact(params: {
  documentReference: string;
  artifactKind: string;
}): MockEncounterDocument {
  const document = buildMockEncounterDocument({
    encounterId: `mock-encounter-${params.documentReference}`,
    templateId: null,
    documentType: "report",
    title: "Documento emitido",
    summary: "Documento de exemplo em modo mock.",
    issuedAt: new Date(),
    expiresAt: null,
    content: {
      mock: true,
      documentReference: params.documentReference,
      artifactKind: params.artifactKind,
    },
  });
  const artifactId = randomUUID();

  return {
    ...document,
    id: params.documentReference,
    runtimeId: params.documentReference,
    currentVersion: document.currentVersion
      ? {
          ...document.currentVersion,
          renderedHtml: "<html><body><h1>Documento mock</h1></body></html>",
        }
      : null,
    printableArtifacts: [
      {
        id: artifactId,
        runtimeId: artifactId,
        artifactKind: params.artifactKind,
        renderStatus: params.artifactKind === "preview" || params.artifactKind === "html" ? "rendered" : "pending",
        storageObjectPath: null,
        renderedAt:
          params.artifactKind === "preview" || params.artifactKind === "html"
            ? new Date().toISOString()
            : null,
        failureReason: null,
      },
    ],
  };
}

function buildMockEncounterDocumentSignatureRequest(params: {
  documentReference: string;
  signerType: string;
  signerName: string | null;
  signerEmail: string | null;
  providerCode: string;
  expiresAt: Date | null;
}): MockEncounterDocument {
  const document = buildMockEncounterDocumentPrintableArtifact({
    documentReference: params.documentReference,
    artifactKind: "preview",
  });
  const signatureRequestId = randomUUID();

  return {
    ...document,
    signatureRequests: [
      {
        id: signatureRequestId,
        runtimeId: signatureRequestId,
        signerType: params.signerType,
        signerName: params.signerName,
        signerEmail: params.signerEmail,
        providerCode: params.providerCode,
        requestStatus: "sent",
        requestedAt: new Date().toISOString(),
        expiresAt: params.expiresAt?.toISOString() ?? null,
        completedAt: null,
      },
    ],
  };
}

function buildMockDocumentOperationalDetail(documentReference: string): RuntimeDocumentOperationalDetail {
  const document = buildMockEncounterDocumentSignatureRequest({
    documentReference,
    signerType: "patient",
    signerName: "Paciente mock",
    signerEmail: "paciente.mock@emagreceplus.local",
    providerCode: "mock",
    expiresAt: null,
  });
  const now = new Date().toISOString();

  return {
    id: document.id,
    runtimeId: document.runtimeId,
    documentType: document.documentType,
    status: document.status,
    title: document.title,
    summary: document.summary,
    documentNumber: document.documentNumber,
    issuedAt: document.issuedAt,
    expiresAt: document.expiresAt,
    signedAt: document.signedAt,
    patient: {
      id: "mock-patient",
      runtimeId: "mock-patient",
      name: "Paciente mock",
    },
    encounter: {
      id: `mock-encounter-${documentReference}`,
      runtimeId: `mock-encounter-${documentReference}`,
      encounterType: "follow_up",
      status: "open",
      openedAt: document.issuedAt,
      closedAt: null,
    },
    template: document.template,
    author: {
      runtimeId: "mock-author",
      name: "Equipe clinica mock",
      email: null,
    },
    professional: {
      id: "mock-professional",
      runtimeId: "mock-professional",
      name: "Profissional mock",
      professionalType: "nutritionist",
      licenseNumber: null,
    },
    currentVersion: document.currentVersion
      ? {
          id: document.currentVersion.id,
          runtimeId: document.currentVersion.runtimeId,
          versionNumber: document.currentVersion.versionNumber,
          status: document.currentVersion.status,
          title: document.currentVersion.title,
          summary: document.currentVersion.summary,
          issuedAt: document.currentVersion.issuedAt,
          signedAt: document.currentVersion.signedAt,
          checksum: null,
          hasStorageObject: Boolean(
            document.currentVersion.storageObjectPath || document.currentVersion.signedStorageObjectPath
          ),
        }
      : null,
    printableArtifacts: document.printableArtifacts.map((artifact) => ({
      id: artifact.id,
      runtimeId: artifact.runtimeId,
      artifactKind: artifact.artifactKind,
      renderStatus: artifact.renderStatus,
      renderedAt: artifact.renderedAt,
      failureReason: artifact.failureReason,
      checksum: null,
      hasStorageObject: Boolean(artifact.storageObjectPath),
    })),
    signatureRequests: document.signatureRequests.map((request) => ({
      ...request,
      externalRequestId: null,
      latestDispatch: {
        id: "mock-dispatch",
        providerCode: request.providerCode,
        dispatchStatus: "sent",
        externalRequestId: null,
        attemptedAt: request.requestedAt,
        completedAt: request.requestedAt,
        errorMessage: null,
      },
    })),
    signatureEvents: [
      {
        id: "mock-signature-event",
        runtimeId: "mock-signature-event",
        signatureRequestId: document.signatureRequests[0]?.id ?? null,
        eventType: "signature_dispatch",
        source: "mock",
        externalEventId: null,
        eventAt: now,
        createdAt: now,
      },
    ],
    dispatchEvents: [
      {
        id: "mock-dispatch",
        signatureRequestId: document.signatureRequests[0]?.id ?? null,
        providerCode: "mock",
        dispatchStatus: "sent",
        externalRequestId: null,
        attemptedAt: now,
        completedAt: now,
        errorMessage: null,
      },
    ],
    prescriptions: [],
    accessEvents: [],
  };
}

function buildMockDocumentLegalEvidenceDossier(documentReference: string): RuntimeDocumentLegalEvidenceDossier {
  const now = new Date().toISOString();

  return {
    id: `mock-evidence-${documentReference}`,
    runtimeId: `mock-evidence-${documentReference}`,
    documentId: documentReference,
    runtimeDocumentId: documentReference,
    documentVersionId: `mock-version-${documentReference}`,
    runtimeDocumentVersionId: `mock-version-${documentReference}`,
    printableArtifactId: null,
    runtimePrintableArtifactId: null,
    signatureRequestId: null,
    runtimeSignatureRequestId: null,
    evidenceStatus: "partial",
    verificationStatus: "not_required",
    providerCode: "mock",
    externalRequestId: null,
    externalEnvelopeId: null,
    hashAlgorithm: "sha256",
    documentHash: null,
    printableArtifactHash: null,
    signedArtifactHash: null,
    manifestHash: null,
    verifiedAt: null,
    failedAt: null,
    failureReason: null,
    consolidatedAt: now,
    createdAt: now,
    updatedAt: now,
    document: {
      id: documentReference,
      runtimeId: documentReference,
      documentType: "report",
      status: "issued",
      title: "Documento mock",
      issuedAt: now,
      signedAt: null,
    },
    patient: {
      id: "mock-patient",
      runtimeId: "mock-patient",
      name: "Paciente mock",
    },
    professional: {
      id: "mock-professional",
      runtimeId: "mock-professional",
      name: "Profissional mock",
      professionalType: "nutritionist",
      licenseNumber: null,
    },
    author: {
      runtimeId: "mock-author",
      name: "Equipe clinica mock",
      email: null,
    },
    encounter: null,
    template: null,
    version: {
      id: `mock-version-${documentReference}`,
      runtimeId: `mock-version-${documentReference}`,
      versionNumber: 1,
      status: "issued",
      hasStorageObject: false,
      hasSignedStorageObject: false,
    },
    printableArtifact: null,
    signature: null,
    signatories: [],
    provider: {
      providerCode: "mock",
    },
    hashes: {
      algorithm: "sha256",
    },
    events: {
      signature: [],
      dispatch: [],
    },
    timestamps: {
      documentIssuedAt: now,
      consolidatedAt: now,
    },
    statusReasons: [
      "missing_printable_artifact",
      "missing_artifact_hash",
      "missing_signature_request",
    ],
    accessAudit: [],
    evidenceAccessAudit: [],
    accessAuditSummary: {
      eventCount: 0,
      capturedAt: now,
    },
    providerContract: {
      realProviderImplemented: false,
      expectedVerificationFields: [
        "providerCode",
        "externalRequestId",
        "externalEnvelopeId",
        "webhookSignature",
        "artifactHash",
        "verificationPayload",
      ],
    },
    providerReadiness: buildMockDocumentSignatureProviderReadiness(documentReference),
  };
}

function buildMockDocumentSignatureProviderReadiness(
  documentReference: string
): RuntimeDocumentSignatureProviderReadiness {
  return {
    documentId: documentReference,
    runtimeDocumentId: documentReference,
    signatureRequestId: null,
    runtimeSignatureRequestId: null,
    providerCode: "mock",
    providerMode: "simulated",
    adapterCode: "mock",
    providerStatus: "mock_ready",
    externalDocumentId: null,
    externalEnvelopeId: null,
    providerEventHash: null,
    rawEventHash: null,
    providerPayloadHash: null,
    hmacStrategy: null,
    hmacValid: false,
    verificationMethod: null,
    verificationStatus: "not_required",
    verificationFailureReason: null,
    verifiedAt: null,
    providerRealAdapterImplemented: false,
    credentialsPending: false,
    latestDispatch: null,
    latestEvent: null,
  };
}

function buildMockDocumentEvidencePackageSummary(
  documentReference: string,
  packageStatus: RuntimeDocumentEvidencePackageSummary["packageStatus"]
): RuntimeDocumentEvidencePackageSummary {
  const now = new Date().toISOString();

  return {
    id: packageStatus === "not_generated" ? null : `mock-evidence-package-${documentReference}`,
    runtimeId: packageStatus === "not_generated" ? null : `mock-evidence-package-${documentReference}`,
    documentId: documentReference,
    runtimeDocumentId: documentReference,
    evidenceId: `mock-evidence-${documentReference}`,
    runtimeEvidenceId: `mock-evidence-${documentReference}`,
    documentVersionId: `mock-version-${documentReference}`,
    runtimeDocumentVersionId: `mock-version-${documentReference}`,
    signatureRequestId: null,
    runtimeSignatureRequestId: null,
    packageKind: "legal_evidence_json",
    packageStatus,
    contentType: "application/json",
    fileName: `dossie-evidencia-${documentReference}.json`,
    checksum: null,
    byteSize: null,
    generatedAt: packageStatus === "generated" ? now : null,
    failedAt: packageStatus === "failed" ? now : null,
    failureReason: packageStatus === "failed" ? "Falha mock ao gerar pacote" : null,
    createdAt: packageStatus === "not_generated" ? null : now,
    updatedAt: packageStatus === "not_generated" ? null : now,
    metadata: {
      schemaVersion: "document-legal-evidence-package.v1",
    },
    events:
      packageStatus === "generated"
        ? [
            {
              id: `mock-evidence-package-event-${documentReference}`,
              runtimeId: `mock-evidence-package-event-${documentReference}`,
              eventAction: "download",
              eventStatus: "granted",
              signedUrlExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
              createdAt: now,
              actor: null,
            },
          ]
        : [],
  };
}

function buildDocumentEvidencePackagePayload(params: {
  evidence: RuntimeDocumentLegalEvidenceDossier;
  generatedAt: string;
}) {
  const evidence = params.evidence;

  return {
    schemaVersion: "document-legal-evidence-package.v1",
    generatedAt: params.generatedAt,
    package: {
      kind: "legal_evidence_json",
      contentType: "application/json",
      hashAlgorithm: "sha256",
      evidenceStatus: evidence.evidenceStatus,
      verificationStatus: evidence.verificationStatus,
      providerRealImplemented: false,
      providerVerificationRequired: evidence.verificationStatus === "pending",
    },
    evidence: {
      id: evidence.id,
      documentId: evidence.documentId,
      documentVersionId: evidence.documentVersionId,
      printableArtifactId: evidence.printableArtifactId,
      signatureRequestId: evidence.signatureRequestId,
      evidenceStatus: evidence.evidenceStatus,
      verificationStatus: evidence.verificationStatus,
      providerCode: evidence.providerCode,
      externalRequestId: evidence.externalRequestId,
      externalEnvelopeId: evidence.externalEnvelopeId,
      hashAlgorithm: evidence.hashAlgorithm,
      documentHash: evidence.documentHash,
      printableArtifactHash: evidence.printableArtifactHash,
      signedArtifactHash: evidence.signedArtifactHash,
      manifestHash: evidence.manifestHash,
      verifiedAt: evidence.verifiedAt,
      failedAt: evidence.failedAt,
      failureReason: evidence.failureReason,
      consolidatedAt: evidence.consolidatedAt,
      document: evidence.document,
      version: evidence.version,
      printableArtifact: evidence.printableArtifact,
      patient: evidence.patient,
      professional: evidence.professional,
      author: evidence.author,
      encounter: evidence.encounter,
      template: evidence.template,
      signature: evidence.signature,
      signatories: evidence.signatories,
      provider: evidence.provider,
      hashes: evidence.hashes,
      events: evidence.events,
      timestamps: evidence.timestamps,
      statusReasons: evidence.statusReasons,
      accessAudit: evidence.accessAudit,
      evidenceAccessAudit: evidence.evidenceAccessAudit,
      accessAuditSummary: evidence.accessAuditSummary,
      providerContract: evidence.providerContract,
      providerReadiness: evidence.providerReadiness,
    },
  };
}

function stableStringify(value: unknown) {
  return `${JSON.stringify(toStableJsonValue(value), null, 2)}\n`;
}

function toStableJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((accumulator, key) => {
      const entryValue = record[key];

      if (entryValue !== undefined) {
        accumulator[key] = toStableJsonValue(entryValue);
      }

      return accumulator;
    }, {});
}

function sha256Hex(value: Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function isDocumentScopeError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");

  return /not found|outside the current unit scope|denied/i.test(message);
}

function normalizeDocumentListNumber(
  value: string | number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeDocumentListDate(
  value: string | undefined,
  fieldName: string,
  boundary: "from" | "to"
) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const dateOnlyMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = dateOnlyMatch
    ? buildStrictDateOnly(dateOnlyMatch, boundary)
    : new Date(normalized);

  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException(`${fieldName} deve ser uma data valida.`);
  }

  return parsed.toISOString();
}

function buildStrictDateOnly(
  match: RegExpMatchArray,
  boundary: "from" | "to"
) {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return new Date(Number.NaN);
  }

  if (boundary === "to") {
    parsed.setUTCHours(23, 59, 59, 999);
  }

  return parsed;
}

function buildMockDocumentAccessLink(
  document: MockEncounterDocument
): DocumentAccessLink | null {
  const storageObjectPath =
    document.currentVersion?.signedStorageObjectPath ?? document.currentVersion?.storageObjectPath;
  const renderedHtml = document.currentVersion?.renderedHtml;

  if (!storageObjectPath && !renderedHtml) {
    return null;
  }

  const openUrl = buildMockHtmlDataUrl(
    renderedHtml ??
      `<html><body><h1>${document.title}</h1><p>${document.summary ?? ""}</p></body></html>`
  );

  return {
    id: document.currentVersion?.id ?? document.id,
    artifactKind: "document_version",
    downloadUrl: openUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    fileName: buildDocumentArtifactFileName(
      document.title,
      document.documentType,
      storageObjectPath,
      "documento"
    ),
    label: document.signedAt ? "Documento assinado" : "Versao atual",
    openUrl,
    renderStatus: document.currentVersion?.status ?? document.status,
  };
}

function buildMockArtifactAccessLink(
  document: MockEncounterDocument,
  artifact: MockEncounterDocument["printableArtifacts"][number]
): DocumentAccessLink | null {
  const renderedHtml = document.currentVersion?.renderedHtml;
  if (!artifact.storageObjectPath && !renderedHtml) {
    return null;
  }

  const openUrl = buildMockHtmlDataUrl(
    renderedHtml ?? `<html><body><h1>${document.title}</h1></body></html>`
  );

  return {
    id: artifact.id,
    artifactKind: artifact.artifactKind,
    downloadUrl: openUrl,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    fileName: buildDocumentArtifactFileName(
      document.title,
      artifact.artifactKind,
      artifact.storageObjectPath,
      "artefato"
    ),
    label: buildDocumentArtifactLabel(artifact.artifactKind),
    openUrl,
    renderStatus: artifact.renderStatus,
  };
}

function buildMockHtmlDataUrl(value: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(value)}`;
}

function buildDocumentArtifactLabel(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "preview":
      return "Preview HTML";
    case "html":
      return "Documento HTML";
    case "pdf":
      return "PDF";
    case "print_package":
    case "print-package":
      return "Pacote de impressao";
    case "document_version":
      return "Versao atual";
    default:
      return "Artefato documental";
  }
}

function buildDocumentArtifactFileName(
  documentTitle: string,
  artifactKind: string | null | undefined,
  storageObjectPath: string | null | undefined,
  fallbackPrefix: string
) {
  const baseName = slugifyDocumentFileName(documentTitle) || fallbackPrefix;
  const explicitExtension = extractStorageObjectExtension(storageObjectPath);
  const fallbackExtension = resolveArtifactFallbackExtension(artifactKind);
  return `${baseName}.${explicitExtension ?? fallbackExtension}`;
}

function resolveArtifactFallbackExtension(value: string | null | undefined) {
  switch ((value ?? "").trim().toLowerCase()) {
    case "pdf":
      return "pdf";
    case "print_package":
    case "print-package":
      return "zip";
    default:
      return "html";
  }
}

function extractStorageObjectExtension(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) {
    return null;
  }

  const lastSegment = normalized.split("/").at(-1) ?? normalized;
  const match = lastSegment.match(/\.([a-z0-9]+)$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function slugifyDocumentFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
