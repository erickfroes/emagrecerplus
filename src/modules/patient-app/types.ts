import type { PatientCommercialContext, PatientNutritionPlan } from "@/types/api";

export type WaterLog = {
  id: string;
  runtimeId: string | null;
  amountMl: number;
  loggedAt: string;
};

export type MealLog = {
  id: string;
  runtimeId: string | null;
  nutritionPlanVersionId: string | null;
  mealType: string | null;
  description: string | null;
  adherenceRating: number | null;
  notes: string | null;
  loggedAt: string;
};

export type WorkoutLog = {
  id: string;
  runtimeId: string | null;
  workoutType: string | null;
  durationMinutes: number | null;
  intensity: string | null;
  completed: boolean;
  notes: string | null;
  loggedAt: string;
};

export type SleepLog = {
  id: string;
  runtimeId: string | null;
  sleepDate: string;
  hours: number | null;
  qualityScore: number | null;
  notes: string | null;
};

export type SymptomLog = {
  id: string;
  runtimeId: string | null;
  symptomType: string;
  severityScore: number | null;
  description: string | null;
  notes: string | null;
  loggedAt: string;
};

export type DailyCheckIn = {
  id: string;
  runtimeId: string | null;
  checkinDate: string;
  mood: string | null;
  energyScore: number | null;
  sleepHours: number | null;
  hungerLevel: number | null;
  notes: string | null;
  completed: boolean;
  loggedAt: string;
};

export type PatientAppRecentActivity = {
  id: string;
  eventType: string;
  eventAt: string;
  title: string;
  description: string | null;
  sourceSchema: string | null;
  sourceTable: string | null;
  sourceId: string | null;
  payload: Record<string, unknown>;
};

export type PatientAppAccessFeature = {
  enabled: boolean;
  reason: string | null;
};

export type PatientAppAccessState = {
  hasCommercialContext: boolean;
  hasActiveEnrollment: boolean;
  status: "enabled" | "attention" | "restricted";
  financialStatus: "clear" | "pending" | "overdue";
  renewalRisk: "none" | "medium" | "high" | "expired";
  supportLevel: "standard" | "priority";
  blockerReason: string | null;
  alertMessage: string | null;
  features: {
    habitLogs: PatientAppAccessFeature;
    community: PatientAppAccessFeature;
    priorityChat: PatientAppAccessFeature;
    scheduleReturn: PatientAppAccessFeature;
    upgradeRequest: PatientAppAccessFeature;
  };
};

export type PatientAppCockpit = {
  patient: {
    id: string;
    runtimeId: string | null;
    name: string;
    mainGoal: string | null;
  };
  nextAppointment: {
    id: string;
    runtimeId: string | null;
    startsAt: string;
    status: string | null;
    type: string | null;
    professional: string | null;
  } | null;
  weeklyCounts: {
    waterCount: number;
    mealCount: number;
    workoutCount: number;
    sleepCount: number;
    symptomCount: number;
    checkinCount: number;
  };
  todayHydrationMl: number;
  todayCheckIn: DailyCheckIn | null;
  recentActivity: PatientAppRecentActivity[];
  commercialContext: PatientCommercialContext | null;
  nutritionPlan: PatientNutritionPlan | null;
  accessState: PatientAppAccessState | null;
  logs: {
    hydration: WaterLog[];
    meals: MealLog[];
    workouts: WorkoutLog[];
    sleep: SleepLog[];
    symptoms: SymptomLog[];
    checkins: DailyCheckIn[];
  };
};

export type CreateDailyCheckInInput = {
  checkinDate?: string;
  mood?: "great" | "good" | "neutral" | "bad" | "terrible";
  energyScore?: number;
  sleepHours?: number;
  hungerLevel?: number;
  notes?: string;
};

export type CreateWaterLogInput = {
  amountMl: number;
  loggedAt?: string;
};

export type CreateMealLogInput = {
  mealType: string;
  description?: string;
  adherenceRating?: number;
  notes?: string;
  loggedAt?: string;
};

export type CreateWorkoutLogInput = {
  workoutType: string;
  durationMinutes?: number;
  intensity?: string;
  completed?: boolean;
  notes?: string;
  loggedAt?: string;
};

export type CreateSleepLogInput = {
  sleepDate: string;
  hours?: number;
  qualityScore?: number;
  notes?: string;
};

export type CreateSymptomLogInput = {
  symptomType: string;
  severityScore?: number;
  description?: string;
  notes?: string;
  loggedAt?: string;
};
