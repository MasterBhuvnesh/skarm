"use client";

import { Columns3, GitBranch, Sparkles } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Dub-style feature selector that floats above the hero screenshot: three
 * pillar tabs where the active one lifts into an elevated card. Purely a
 * visual highlight - the mock below is illustrative.
 */
const TABS = [
  {
    id: "issues",
    label: "Issues & Boards",
    icon: Columns3,
    color: "#f2994a",
  },
  {
    id: "ai",
    label: "AI Agent",
    icon: Sparkles,
    color: "#5e6ad2",
  },
  {
    id: "integrations",
    label: "Integrations",
    icon: GitBranch,
    color: "#4cb782",
  },
] as const;

export function FeatureTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("issues");

  return (
    <div className="flex flex-wrap items-center justify-center gap-1 rounded-2xl border bg-muted/40 p-1.5 backdrop-blur">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              isActive
                ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-md"
              style={{
                backgroundColor: `${tab.color}22`,
                color: tab.color,
              }}
            >
              <tab.icon className="size-3" />
            </span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
