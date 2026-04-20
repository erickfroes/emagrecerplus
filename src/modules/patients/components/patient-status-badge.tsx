import { Badge } from "@/components/ui/badge";

export function PatientStatusBadge({ status }: { status: string }) {
  const tone = status.toLowerCase().includes("ativo") ? "success" : "warning";

  return <Badge tone={tone}>{status}</Badge>;
}
