import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  type = "button",
  ...props
}: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/15 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        size === "md" && "px-4 py-2.5 text-sm",
        size === "sm" && "px-3 py-2 text-xs",
        variant === "primary" && "bg-brand text-white hover:bg-slate-800",
        variant === "secondary" && "border border-border bg-surface text-foreground hover:bg-slate-50",
        variant === "ghost" && "interactive-ghost",
        className,
      )}
      type={type}
      {...props}
    />
  );
}