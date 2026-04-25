"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/state/auth-store";
import { createPrescriptionRecord, type CreatePrescriptionRecordInput } from "../api/create-prescription-record";

export function useCreatePrescriptionRecord(encounterId: string) {
  const queryClient = useQueryClient();
  const currentUnitId = useAuthStore((state) => state.session?.currentUnitId ?? null);

  return useMutation({
    mutationFn: (input: CreatePrescriptionRecordInput) => createPrescriptionRecord(encounterId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["encounter", currentUnitId, encounterId] });
    },
  });
}
