import { http } from "@/lib/http";

export async function moveLeadStage(id: string, stageCode: string) {
  return http<{
    id: string;
    stageCode: string;
    stage: string;
    status: string;
  }>(`/leads/${id}/stage`, {
    method: "PATCH",
    body: {
      stageCode,
    },
  });
}
