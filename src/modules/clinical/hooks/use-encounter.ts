import { useQuery } from "@tanstack/react-query";
import { getEncounter } from "../api/get-encounter";

export function useEncounter(id: string) {
  return useQuery({
    queryKey: ["encounter", id],
    queryFn: () => getEncounter(id),
    enabled: Boolean(id),
  });
}