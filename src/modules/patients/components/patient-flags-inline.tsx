import { Badge } from "@/components/ui/badge";

function formatFlag(flag: string) {
  return flag.replaceAll("_", " ");
}

export function PatientFlagsInline({ flags }: { flags: string[] }) {
  if (!flags.length) {
    return <span className="text-xs text-slate-400">Sem flags</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <Badge key={flag} tone="warning">
          {formatFlag(flag)}
        </Badge>
      ))}
    </div>
  );
}
