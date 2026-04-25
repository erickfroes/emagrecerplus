import { Body, Controller, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { AppContext } from "../../common/auth/app-context.decorator.ts";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import { SchedulingService } from "./scheduling.service.ts";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto.ts";
import { CreateAppointmentDto } from "./dto/create-appointment.dto.ts";
import { MarkNoShowDto } from "./dto/mark-no-show.dto.ts";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto.ts";

@RequirePermissions("schedule:view")
@Controller("appointments")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  list(
    @Query("date") date?: string,
    @Query("status") status?: string,
    @Query("professional") professional?: string,
    @Query("unit") unit?: string,
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.schedulingService.list({ date, status, professional, unit }, context, authorization);
  }

  @RequirePermissions("schedule:write")
  @Post()
  create(@Body() dto: CreateAppointmentDto, @AppContext() context?: AppRequestContext) {
    return this.schedulingService.create(dto, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/confirm")
  confirm(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.schedulingService.confirm(id, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/cancel")
  cancel(
    @Param("id") id: string,
    @Body() dto: CancelAppointmentDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.schedulingService.cancel(id, dto, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/reschedule")
  reschedule(
    @Param("id") id: string,
    @Body() dto: RescheduleAppointmentDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.schedulingService.reschedule(id, dto, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/check-in")
  checkIn(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.schedulingService.checkIn(id, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/enqueue")
  enqueue(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.schedulingService.enqueue(id, context);
  }

  @RequirePermissions("schedule:write", "clinical:write")
  @Patch(":id/start-encounter")
  startEncounter(@Param("id") id: string, @AppContext() context?: AppRequestContext) {
    return this.schedulingService.startEncounter(id, context);
  }

  @RequirePermissions("schedule:write")
  @Patch(":id/no-show")
  markNoShow(
    @Param("id") id: string,
    @Body() dto: MarkNoShowDto,
    @AppContext() context?: AppRequestContext
  ) {
    return this.schedulingService.markNoShow(id, dto, context);
  }
}
