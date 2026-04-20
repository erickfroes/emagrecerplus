import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PatientsService } from "./patients.service.ts";
import { CreatePatientDto } from "./dto/create-patient.dto.ts";

@Controller("patients")
export class PatientsController {
  constructor(private readonly patientsService: PatientsService) {}

  @Get()
  list(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("tag") tag?: string,
    @Query("flag") flag?: string,
  ) {
    return this.patientsService.list({ search, status, tag, flag });
  }

  @Get(":id")
  getById(@Param("id") id: string) {
    return this.patientsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreatePatientDto) {
    return this.patientsService.create(dto);
  }
}
