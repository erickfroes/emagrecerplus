import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "default",
}: Readonly<{ children: React.ReactNode; tone?: "default" | "success" | "warning" | "danger" }>) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
        tone === "default" && "bg-slate-100 text-slate-700",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "warning" && "bg-amber-100 text-amber-700",
        tone === "danger" && "bg-red-100 text-red-700"
      )}
    >
      {children}
    </span>
  );
}
