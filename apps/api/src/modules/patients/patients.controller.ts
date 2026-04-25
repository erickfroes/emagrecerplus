import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { AppContext } from "../../common/auth/app-context.decorator.ts";
import { RequirePermissions } from "../../common/auth/require-permissions.decorator.ts";
import type { AppRequestContext } from "../../common/auth/app-session.ts";
import { PatientsService } from "./patients.service.ts";
import { CreatePatientDto } from "./dto/create-patient.dto.ts";
import { CreatePatientEnrollmentDto } from "./dto/create-patient-enrollment.dto.ts";

@RequirePermissions("patients:view")
@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("tag") tag?: string,
    @Query("flag") flag?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.patientsService.list({ search, status, tag, flag }, context);
  }

  @Get(":id")
  getById(
    @Param("id") id: string,
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.patientsService.getById(id, context, authorization);
  }

  @RequirePermissions("patients:write")
  @Post()
  create(@Body() dto: CreatePatientDto, @AppContext() context?: AppRequestContext) {
    return this.patientsService.create(dto, context);
  }

  @RequirePermissions("patients:view", "crm:write")
  @Post(":id/enrollments")
  createEnrollment(
    @Param("id") id: string,
    @Body() dto: CreatePatientEnrollmentDto,
    @Headers("authorization") authorization?: string,
    @AppContext() context?: AppRequestContext
  ) {
    return this.patientsService.createCommercialEnrollment(id, dto, context, authorization);
  }
}
