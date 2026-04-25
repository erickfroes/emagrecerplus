import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { AppContext } from "../../common/auth/app-context.decorator.ts";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import { CrmService } from "./crm.service.ts";
import { CreateLeadActivityDto } from "./dto/create-lead-activity.dto.ts";
import { CreateLeadDto } from "./dto/create-lead.dto.ts";
import { MoveLeadStageDto } from "./dto/move-lead-stage.dto.ts";
import { UpdateLeadActivityDto } from "./dto/update-lead-activity.dto.ts";

@RequirePermissions("crm:view")
@Controller("leads")
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  @Get("kanban")
  getKanban(
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.getKanban(context, authorization);
  }

  @Get("catalog")
  getCatalogSnapshot(
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.getCatalogSnapshot(context, authorization);
  }

  @Get(":id/activities")
  listActivities(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.listActivities(id, context, authorization);
  }

  @RequirePermissions("crm:write")
  @Post()
  create(@Body() dto: CreateLeadDto, @AppContext() context?: AppRequestContext) {
    return this.crmService.create(dto, context);
  }

  @RequirePermissions("crm:write")
  @Post(":id/activities")
  createActivity(
    @Param("id") id: string,
    @Body() dto: CreateLeadActivityDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.createActivity(id, dto, context);
  }

  @RequirePermissions("crm:write")
  @Patch(":id/stage")
  moveStage(
    @Param("id") id: string,
    @Body() dto: MoveLeadStageDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.moveStage(id, dto, context);
  }

  @RequirePermissions("crm:write")
  @Patch(":leadId/activities/:activityId")
  updateActivity(
    @Param("leadId") leadId: string,
    @Param("activityId") activityId: string,
    @Body() dto: UpdateLeadActivityDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.crmService.updateActivity(leadId, activityId, dto, context);
  }

  @RequirePermissions("crm:write")
  @Post(":id/convert")
  convert(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.crmService.convert(id, context);
  }
}
