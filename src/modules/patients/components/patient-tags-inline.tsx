import { Badge } from "@/components/ui/badge";

export function PatientTagsInline({ tags }: { tags: string[] }) {
  if (!tags.length) {
    return <span className="text-xs text-slate-400">Sem tags</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((tag) => (
        <Badge key={tag} tone="success">
          {tag}
        </Badge>
      ))}
    </div>
  );
}
