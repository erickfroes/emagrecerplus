"use client";

import { useQuery } from "@tanstack/react-query";
import { getPatientAppCockpit } from "@/modules/patient-app/api/patient-app";
import { usePatientAppTarget } from "@/modules/patient-app/hooks/use-patient-app-target";

export function usePatientAppCockpit() {
  const target = usePatientAppTarget();
  const queryKey = ["patient-app-cockpit", target.patientId ?? "current"];

  const query = useQuery({
    queryKey,
    queryFn: () => getPatientAppCockpit(target.patientId),
    enabled: target.isPatientSession || Boolean(target.patientId),
  });

  return {
    ...query,
    target,
    queryKey,
  };
}
