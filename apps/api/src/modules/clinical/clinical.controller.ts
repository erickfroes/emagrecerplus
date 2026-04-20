import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ClinicalService } from "./clinical.service.ts";
import { CreateClinicalTaskDto } from "./dto/create-clinical-task.dto.ts";
import { SaveAnamnesisDto } from "./dto/save-anamnesis.dto.ts";
import { SaveSoapNoteDto } from "./dto/save-soap-note.dto.ts";

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
  ) {
    return this.clinicalService.listTasks({
      search,
      patient,
      status,
      priority,
      assignedTo,
      patientId,
    });
  }

  @Post("clinical/tasks")
  createTask(@Body() dto: CreateClinicalTaskDto) {
    return this.clinicalService.createTask(dto);
  }

  @Get("encounters/:id")
  getEncounterById(@Param("id") id: string) {
    return this.clinicalService.getEncounterById(id);
  }

  @Patch("encounters/:id/anamnesis")
  saveAnamnesis(@Param("id") id: string, @Body() dto: SaveAnamnesisDto) {
    return this.clinicalService.saveAnamnesis(id, dto);
  }

  @Patch("encounters/:id/soap-note")
  saveSoapNote(@Param("id") id: string, @Body() dto: SaveSoapNoteDto) {
    return this.clinicalService.saveSoapNote(id, dto);
  }
}
