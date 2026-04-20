export type WaterLog = {
  id: string;
  amountMl: number;
  loggedAt: string;
};

export type MealLog = {
  id: string;
  mealType: string;
  description: string;
  adherence: string;
  loggedAt: string;
};

export type WorkoutLog = {
  id: string;
  workoutType: string;
  durationMinutes: number;
  intensity: string;
  completed: boolean;
  loggedAt: string;
};

export type SleepLog = {
  id: string;
  hours: number;
  quality: string;
  loggedAt: string;
};

export type SymptomLog = {
  id: string;
  symptomType: string;
  severity: string;
  description: string;
  loggedAt: string;
};
