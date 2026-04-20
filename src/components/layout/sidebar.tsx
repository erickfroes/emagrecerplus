"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/hooks/use-permissions";
import { sidebarItems } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function Sidebar() {
  const pathname = usePathname();
  const { can } = usePermissions();

  return (
    <aside className="hidden border-r border-border bg-surface/90 backdrop-blur lg:block">
      <div className="flex h-16 items-center border-b border-border px-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">EmagrecePlus</p>
          <h1 className="text-lg font-semibold text-slate-950">Admin</h1>
        </div>
      </div>

      <nav className="space-y-1 p-4">
        {sidebarItems
          .filter((item) => can(item.permission))
          .map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href.replace("/1", ""));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition",
                  active
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </aside>
  );
}
