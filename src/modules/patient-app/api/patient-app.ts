import { http } from "@/lib/http";
import type {
  CreateDailyCheckInInput,
  CreateMealLogInput,
  CreateSleepLogInput,
  CreateSymptomLogInput,
  CreateWaterLogInput,
  CreateWorkoutLogInput,
  PatientAppCockpit,
} from "@/modules/patient-app/types";

function withPatientId(path: string, patientId?: string | null) {
  if (!patientId) {
    return path;
  }

  const suffix = path.includes("?") ? "&" : "?";
  return `${path}${suffix}patientId=${encodeURIComponent(patientId)}`;
}

export function getPatientAppCockpit(patientId?: string | null) {
  return http<PatientAppCockpit>(withPatientId("/patient-app/cockpit", patientId));
}

export function createPatientAppDailyCheckin(
  input: CreateDailyCheckInInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/daily-checkins", patientId), {
    method: "POST",
    body: input,
  });
}

export function createPatientAppWaterLog(
  input: CreateWaterLogInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/water-logs", patientId), {
    method: "POST",
    body: input,
  });
}

export function createPatientAppMealLog(
  input: CreateMealLogInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/meal-logs", patientId), {
    method: "POST",
    body: input,
  });
}

export function createPatientAppWorkoutLog(
  input: CreateWorkoutLogInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/workout-logs", patientId), {
    method: "POST",
    body: input,
  });
}

export function createPatientAppSleepLog(
  input: CreateSleepLogInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/sleep-logs", patientId), {
    method: "POST",
    body: input,
  });
}

export function createPatientAppSymptomLog(
  input: CreateSymptomLogInput,
  patientId?: string | null
) {
  return http(withPatientId("/patient-app/symptom-logs", patientId), {
    method: "POST",
    body: input,
  });
}
