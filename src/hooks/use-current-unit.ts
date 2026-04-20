"use client";

import { useAuth } from "@/hooks/use-auth";

export function useCurrentUnit() {
  const { units, currentUnitId, setCurrentUnit } = useAuth();

  const currentUnit = units.find((unit) => unit.id === currentUnitId) ?? units[0] ?? null;

  return {
    currentUnit,
    units,
    setCurrentUnit,
  };
}