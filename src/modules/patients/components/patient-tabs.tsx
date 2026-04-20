"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type TabItem = {
  id: string;
  label: string;
  content: ReactNode;
};

export function PatientTabs({ items }: { items: TabItem[] }) {
  const [activeTab, setActiveTab] = useState(items[0]?.id ?? "");
  const currentTab = items.find((item) => item.id === activeTab) ?? items[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item.id}
            className={cn(
              "rounded-2xl border px-4 py-2 text-sm font-medium transition",
              item.id === currentTab.id
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-border bg-surface text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => setActiveTab(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div>{currentTab.content}</div>
    </div>
  );
}
