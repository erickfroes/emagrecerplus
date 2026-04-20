import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CrmService } from "./crm.service.ts";
import { CreateLeadActivityDto } from "./dto/create-lead-activity.dto.ts";
import { CreateLeadDto } from "./dto/create-lead.dto.ts";
import { MoveLeadStageDto } from "./dto/move-lead-stage.dto.ts";
import { UpdateLeadActivityDto } from "./dto/update-lead-activity.dto.ts";

@Controller("leads")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get("kanban")
  getKanban() {
    return this.crmService.getKanban();
  }

  @Get(":id/activities")
  listActivities(@Param("id") id: string) {
    return this.crmService.listActivities(id);
  }

  @Post()
  create(@Body() dto: CreateLeadDto) {
    return this.crmService.create(dto);
  }

  @Post(":id/activities")
  createActivity(@Param("id") id: string, @Body() dto: CreateLeadActivityDto) {
    return this.crmService.createActivity(id, dto);
  }

  @Patch(":id/stage")
  moveStage(@Param("id") id: string, @Body() dto: MoveLeadStageDto) {
    return this.crmService.moveStage(id, dto);
  }

  @Patch(":leadId/activities/:activityId")
  updateActivity(
    @Param("leadId") leadId: string,
    @Param("activityId") activityId: string,
    @Body() dto: UpdateLeadActivityDto
  ) {
    return this.crmService.updateActivity(leadId, activityId, dto);
  }

  @Post(":id/convert")
  convert(@Param("id") id: string) {
    return this.crmService.convert(id);
  }
}
