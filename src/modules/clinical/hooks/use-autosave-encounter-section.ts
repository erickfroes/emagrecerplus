"use client";

import { useMutation } from "@tanstack/react-query";
import { autosaveEncounterSection } from "../api/autosave-encounter-section";

export function useAutosaveEncounterSection(encounterId: string) {
  return useMutation({
    mutationFn: (
      payload:
        | {
            section: "anamnesis";
            savedAt?: string;
            chiefComplaint?: string;
            historyOfPresentIllness?: string;
            pastMedicalHistory?: string;
            lifestyleHistory?: string;
            notes?: string;
          }
        | {
            section: "soap_draft";
            savedAt?: string;
            subjective?: string;
            objective?: string;
            assessment?: string;
            plan?: string;
          }
    ) => autosaveEncounterSection(encounterId, payload),
  });
}
