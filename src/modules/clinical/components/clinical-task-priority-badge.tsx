import { Badge } from "@/components/ui/badge";

export function ClinicalTaskPriorityBadge({ priority }: { priority: string }) {
  const tone = priority === "Alta" ? "danger" : priority === "Media" ? "warning" : "default";

  return <Badge tone={tone}>{priority}</Badge>;
}
