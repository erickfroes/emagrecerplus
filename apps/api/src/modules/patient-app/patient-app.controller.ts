import { Body, Controller, Get, Headers, Post, Query } from "@nestjs/common";
import { CreatePatientAppDailyCheckinDto } from "./dto/create-patient-app-daily-checkin.dto.ts";
import { CreatePatientAppMealLogDto } from "./dto/create-patient-app-meal-log.dto.ts";
import { CreatePatientAppSleepLogDto } from "./dto/create-patient-app-sleep-log.dto.ts";
import { CreatePatientAppSymptomLogDto } from "./dto/create-patient-app-symptom-log.dto.ts";
import { CreatePatientAppWaterLogDto } from "./dto/create-patient-app-water-log.dto.ts";
import { CreatePatientAppWorkoutLogDto } from "./dto/create-patient-app-workout-log.dto.ts";
import { PatientAppService } from "./patient-app.service.ts";

@Controller("patient-app")
export class PatientAppController {
  constructor(private readonly patientAppService: PatientAppService) {}

  @Get("cockpit")
  getCockpit(
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.getCockpit(authorization, patientId);
  }

  @Post("daily-checkins")
  createDailyCheckin(
    @Body() dto: CreatePatientAppDailyCheckinDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createDailyCheckin(dto, authorization, patientId);
  }

  @Post("water-logs")
  createWaterLog(
    @Body() dto: CreatePatientAppWaterLogDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createWaterLog(dto, authorization, patientId);
  }

  @Post("meal-logs")
  createMealLog(
    @Body() dto: CreatePatientAppMealLogDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createMealLog(dto, authorization, patientId);
  }

  @Post("workout-logs")
  createWorkoutLog(
    @Body() dto: CreatePatientAppWorkoutLogDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createWorkoutLog(dto, authorization, patientId);
  }

  @Post("sleep-logs")
  createSleepLog(
    @Body() dto: CreatePatientAppSleepLogDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createSleepLog(dto, authorization, patientId);
  }

  @Post("symptom-logs")
  createSymptomLog(
    @Body() dto: CreatePatientAppSymptomLogDto,
    @Headers("authorization") authorization?: string,
    @Query("patientId") patientId?: string
  ) {
    return this.patientAppService.createSymptomLog(dto, authorization, patientId);
  }
}
