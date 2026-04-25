"use client";

import { useSearchParams } from "next/navigation";
import { useAuthStore } from "@/state/auth-store";

export function usePatientAppTarget() {
  const role = useAuthStore((state) => state.session?.user.role ?? null);
  const searchParams = useSearchParams();
  const previewPatientId = searchParams.get("patientId")?.trim() || null;
  const patientId = role === "patient" ? null : previewPatientId;

  return {
    role,
    patientId,
    isPatientSession: role === "patient",
    requiresPreviewPatient: role !== "patient" && !previewPatientId,
  };
}
