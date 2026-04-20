"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MealLog, SleepLog, SymptomLog, WaterLog, WorkoutLog } from "@/modules/patient-app/types";

type PatientAppState = {
  patientName: string;
  nextAppointment: {
    dateLabel: string;
    professional: string;
    type: string;
  };
  waterLogs: WaterLog[];
  mealLogs: MealLog[];
  workoutLogs: WorkoutLog[];
  sleepLogs: SleepLog[];
  symptomLogs: SymptomLog[];
  addWaterLog: (amountMl: number) => void;
  addMealLog: (payload: Omit<MealLog, "id" | "loggedAt">) => void;
  addWorkoutLog: (payload: Omit<WorkoutLog, "id" | "loggedAt">) => void;
  addSleepLog: (payload: Omit<SleepLog, "id" | "loggedAt">) => void;
  addSymptomLog: (payload: Omit<SymptomLog, "id" | "loggedAt">) => void;
};

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export const usePatientAppStore = create<PatientAppState>()(
  persist(
    (set) => ({
      patientName: "Paciente",
      nextAppointment: {
        dateLabel: "10/05 às 09:00",
        professional: "Equipe clínica",
        type: "Retorno presencial",
      },
      waterLogs: [],
      mealLogs: [],
      workoutLogs: [],
      sleepLogs: [],
      symptomLogs: [],
      addWaterLog: (amountMl) =>
        set((state) => ({
          waterLogs: [
            {
              id: makeId("water"),
              amountMl,
              loggedAt: new Date().toISOString(),
            },
            ...state.waterLogs,
          ],
        })),
      addMealLog: (payload) =>
        set((state) => ({
          mealLogs: [
            {
              id: makeId("meal"),
              loggedAt: new Date().toISOString(),
              ...payload,
            },
            ...state.mealLogs,
          ],
        })),
      addWorkoutLog: (payload) =>
        set((state) => ({
          workoutLogs: [
            {
              id: makeId("workout"),
              loggedAt: new Date().toISOString(),
              ...payload,
            },
            ...state.workoutLogs,
          ],
        })),
      addSleepLog: (payload) =>
        set((state) => ({
          sleepLogs: [
            {
              id: makeId("sleep"),
              loggedAt: new Date().toISOString(),
              ...payload,
            },
            ...state.sleepLogs,
          ],
        })),
      addSymptomLog: (payload) =>
        set((state) => ({
          symptomLogs: [
            {
              id: makeId("symptom"),
              loggedAt: new Date().toISOString(),
              ...payload,
            },
            ...state.symptomLogs,
          ],
        })),
    }),
    {
      name: "emagreceplus-patient-app",
    }
  )
);