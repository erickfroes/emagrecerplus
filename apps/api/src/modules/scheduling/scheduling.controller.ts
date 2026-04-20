import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { SchedulingService } from "./scheduling.service.ts";
import { CancelAppointmentDto } from "./dto/cancel-appointment.dto.ts";
import { CreateAppointmentDto } from "./dto/create-appointment.dto.ts";
import { MarkNoShowDto } from "./dto/mark-no-show.dto.ts";
import { RescheduleAppointmentDto } from "./dto/reschedule-appointment.dto.ts";

@Controller("appointments")
export class SchedulingController {
  constructor(private readonly schedulingService: SchedulingService) {}

  @Get()
  list(
    @Query("date") date?: string,
    @Query("status") status?: string,
    @Query("professional") professional?: string,
    @Query("unit") unit?: string,
  ) {
    return this.schedulingService.list({ date, status, professional, unit });
  }

  @Post()
  create(@Body() dto: CreateAppointmentDto) {
    return this.schedulingService.create(dto);
  }

  @Patch(":id/confirm")
  confirm(@Param("id") id: string) {
    return this.schedulingService.confirm(id);
  }

  @Patch(":id/cancel")
  cancel(@Param("id") id: string, @Body() dto: CancelAppointmentDto) {
    return this.schedulingService.cancel(id, dto);
  }

  @Patch(":id/reschedule")
  reschedule(@Param("id") id: string, @Body() dto: RescheduleAppointmentDto) {
    return this.schedulingService.reschedule(id, dto);
  }

  @Patch(":id/check-in")
  checkIn(@Param("id") id: string) {
    return this.schedulingService.checkIn(id);
  }

  @Patch(":id/no-show")
  markNoShow(@Param("id") id: string, @Body() dto: MarkNoShowDto) {
    return this.schedulingService.markNoShow(id, dto);
  }
}
