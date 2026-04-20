import { Badge } from "@/components/ui/badge";

export function ClinicalTaskStatusBadge({ status }: { status: string }) {
  const tone = status === "Concluida" ? "success" : status === "Em andamento" ? "warning" : "default";

  return <Badge tone={tone}>{status}</Badge>;
}
