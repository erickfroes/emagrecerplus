import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return <div className={cn("surface-card p-5", className)}>{children}</div>;
}