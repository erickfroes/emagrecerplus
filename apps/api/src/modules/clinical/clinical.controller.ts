import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { AppContext } from "../../common/auth/app-context.decorator.ts";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import { ClinicalService } from "./clinical.service.ts";
import { AutosaveEncounterSectionDto } from "./dto/autosave-encounter-section.dto.ts";
import { CreateClinicalTaskDto } from "./dto/create-clinical-task.dto.ts";
import { CreateEncounterDocumentDto } from "./dto/create-encounter-document.dto.ts";
import { CreateDocumentPrintableArtifactDto } from "./dto/create-document-printable-artifact.dto.ts";
import { CreateDocumentSignatureRequestDto } from "./dto/create-document-signature-request.dto.ts";
import { CreatePrescriptionRecordDto } from "./dto/create-prescription-record.dto.ts";
import { SaveAnamnesisDto } from "./dto/save-anamnesis.dto.ts";
import { ScheduleReturnDto } from "./dto/schedule-return.dto.ts";
import { SaveSoapNoteDto } from "./dto/save-soap-note.dto.ts";

@RequirePermissions("clinical:view")
@Controller()
export class ClinicalController {
  constructor(private readonly clinicalService: ClinicalService) {}

  @Get("clinical/tasks")
  listTasks(
    @Query("search") search?: string,
    @Query("patient") patient?: string,
    @Query("status") status?: string,
    @Query("priority") priority?: string,
    @Query("assignedTo") assignedTo?: string,
    @Query("patientId") patientId?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.listTasks({
      search,
      patient,
      status,
      priority,
      assignedTo,
      patientId,
    }, context);
  }

  @RequirePermissions("clinical:write")
  @Post("clinical/tasks")
  createTask(@Body() dto: CreateClinicalTaskDto, @AppContext() context?: AppRequestContext) {
    return this.clinicalService.createTask(dto, context);
  }

  @Get("encounters/:id")
  getEncounterById(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.clinicalService.getEncounterById(id, context);
  }

  @Get("document-templates")
  listDocumentTemplates(
    @Query("kind") kind?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.listDocumentTemplates(kind, context);
  }

  @RequirePermissions("clinical:write")
  @Patch("encounters/:id/autosave-section")
  autosaveEncounterSection(
    @Param("id") id: string,
    @Body() dto: AutosaveEncounterSectionDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.autosaveEncounterSection(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Patch("encounters/:id/anamnesis")
  saveAnamnesis(
    @Param("id") id: string,
    @Body() dto: SaveAnamnesisDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.saveAnamnesis(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Patch("encounters/:id/soap-note")
  saveSoapNote(
    @Param("id") id: string,
    @Body() dto: SaveSoapNoteDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.saveSoapNote(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Patch("encounters/:id/complete")
  completeEncounter(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.clinicalService.completeEncounter(id, context);
  }

  @RequirePermissions("clinical:write")
  @Post("encounters/:id/prescriptions")
  createPrescription(
    @Param("id") id: string,
    @Body() dto: CreatePrescriptionRecordDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.createPrescription(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Post("encounters/:id/documents")
  createEncounterDocument(
    @Param("id") id: string,
    @Body() dto: CreateEncounterDocumentDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.createEncounterDocument(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Post("documents/:id/printable-artifacts")
  createDocumentPrintableArtifact(
    @Param("id") id: string,
    @Body() dto: CreateDocumentPrintableArtifactDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.createDocumentPrintableArtifact(id, dto, context);
  }

  @RequirePermissions("clinical:write")
  @Post("documents/:id/signature-requests")
  createDocumentSignatureRequest(
    @Param("id") id: string,
    @Body() dto: CreateDocumentSignatureRequestDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.createDocumentSignatureRequest(id, dto, context);
  }

  @Get("documents")
  listDocuments(
    @Query("patientId") patientId?: string,
    @Query("status") status?: string,
    @Query("documentType") documentType?: string,
    @Query("signatureStatus") signatureStatus?: string,
    @Query("issuedFrom") issuedFrom?: string,
    @Query("issuedTo") issuedTo?: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.listDocuments(
      {
        patientId,
        status,
        documentType,
        signatureStatus,
        issuedFrom,
        issuedTo,
        limit,
        offset,
      },
      context
    );
  }

  @Get("documents/:id")
  getDocumentDetail(
    @Param("id") id: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.getDocumentDetail(id, context);
  }

  @Get("documents/:id/evidence")
  getDocumentEvidence(
    @Param("id") id: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.getDocumentEvidence(id, context);
  }

  @HttpCode(200)
  @Post("documents/:id/evidence-package/access-link")
  createDocumentEvidencePackageAccessLink(
    @Param("id") id: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.createDocumentEvidencePackageAccessLink(id, context);
  }

  @Get("documents/:id/access-links")
  getDocumentAccessLinks(
    @Param("id") id: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.getDocumentAccessLinks(id, context);
  }

  @RequirePermissions("clinical:write", "schedule:write")
  @Post("encounters/:id/schedule-return")
  scheduleReturn(
    @Param("id") id: string,
    @Body() dto: ScheduleReturnDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.clinicalService.scheduleReturn(id, dto, context);
  }
}
