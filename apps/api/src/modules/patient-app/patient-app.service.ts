import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { createSupabaseRequestClient } from "../../lib/supabase-request.ts";
import { CreatePatientAppDailyCheckinDto } from "./dto/create-patient-app-daily-checkin.dto.ts";
import { CreatePatientAppMealLogDto } from "./dto/create-patient-app-meal-log.dto.ts";
import { CreatePatientAppSleepLogDto } from "./dto/create-patient-app-sleep-log.dto.ts";
import { CreatePatientAppSymptomLogDto } from "./dto/create-patient-app-symptom-log.dto.ts";
import { CreatePatientAppWaterLogDto } from "./dto/create-patient-app-water-log.dto.ts";
import { CreatePatientAppWorkoutLogDto } from "./dto/create-patient-app-workout-log.dto.ts";

@Injectable()
export class PatientAppService {
  getCockpit(authorization?: string, patientId?: string) {
    return this.callRpc(
      "patient_app_cockpit",
      {
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao consultar cockpit do paciente"
    );
  }

  createDailyCheckin(
    dto: CreatePatientAppDailyCheckinDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_daily_checkin",
      {
        p_checkin_date: dto.checkinDate ?? null,
        p_mood: dto.mood ?? null,
        p_energy_score: dto.energyScore ?? null,
        p_sleep_hours: dto.sleepHours ?? null,
        p_hunger_level: dto.hungerLevel ?? null,
        p_notes: dto.notes ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar check-in diario"
    );
  }

  createWaterLog(
    dto: CreatePatientAppWaterLogDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_hydration",
      {
        p_volume_ml: dto.amountMl,
        p_logged_at: dto.loggedAt ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar hidratacao"
    );
  }

  createMealLog(
    dto: CreatePatientAppMealLogDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_meal",
      {
        p_meal_type: dto.mealType,
        p_description: dto.description ?? null,
        p_adherence_rating: dto.adherenceRating ?? null,
        p_notes: dto.notes ?? null,
        p_logged_at: dto.loggedAt ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar refeicao"
    );
  }

  createWorkoutLog(
    dto: CreatePatientAppWorkoutLogDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_workout",
      {
        p_workout_type: dto.workoutType,
        p_duration_minutes: dto.durationMinutes ?? null,
        p_intensity: dto.intensity ?? null,
        p_completed: dto.completed ?? true,
        p_notes: dto.notes ?? null,
        p_logged_at: dto.loggedAt ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar treino"
    );
  }

  createSleepLog(
    dto: CreatePatientAppSleepLogDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_sleep",
      {
        p_sleep_date: dto.sleepDate,
        p_hours_slept: dto.hours ?? null,
        p_sleep_quality_score: dto.qualityScore ?? null,
        p_notes: dto.notes ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar sono"
    );
  }

  createSymptomLog(
    dto: CreatePatientAppSymptomLogDto,
    authorization?: string,
    patientId?: string
  ) {
    return this.callRpc(
      "log_patient_app_symptom",
      {
        p_symptom_type: dto.symptomType,
        p_severity_score: dto.severityScore ?? null,
        p_description: dto.description ?? null,
        p_notes: dto.notes ?? null,
        p_logged_at: dto.loggedAt ?? null,
        p_patient_id: this.normalizePatientReference(patientId),
      },
      authorization,
      "Falha ao registrar sintoma"
    );
  }

  private async callRpc<T>(
    name: string,
    args: Record<string, unknown>,
    authorization: string | undefined,
    errorLabel: string
  ) {
    const client = this.createClientFromAuthorization(authorization);
    const { data, error } = await client.rpc(name, args);

    if (error) {
      throw new BadRequestException(`${errorLabel}: ${error.message}`);
    }

    return data as T;
  }

  private createClientFromAuthorization(authorization?: string) {
    const accessToken = this.extractBearerToken(authorization);

    if (!accessToken) {
      throw new UnauthorizedException("Token ausente.");
    }

    return createSupabaseRequestClient(accessToken);
  }

  private extractBearerToken(authorization?: string) {
    if (!authorization || !authorization.startsWith("Bearer ")) {
      return null;
    }

    return authorization.slice("Bearer ".length).trim() || null;
  }

  private normalizePatientReference(patientId?: string) {
    const normalized = patientId?.trim();
    return normalized ? normalized : null;
  }
}
