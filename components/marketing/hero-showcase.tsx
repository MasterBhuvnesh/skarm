"use client";

import { Columns3, GitBranch, Sparkles } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { MockApp } from "@/components/marketing/mock-app";
import { cn } from "@/lib/utils";

/**
 * The hero product showcase: a subtly-lighter panel holding the app mock,
 * with a "connected tab" top edge — the panel surface runs straight, then
 * curves up around the three pillar tabs (Dub-style), then continues. The
 * curve is the boundary between the page background and the panel colour,
 * drawn with radial-gradient concave corners so it stays crisp at any width.
 */
const TABS = [
  { id: "issues", label: "Issues & Boards", icon: Columns3, color: "#f2994a" },
  { id: "ai", label: "AI Agent", icon: Sparkles, color: "#5e6ad2" },
  {
    id: "integrations",
    label: "Integrations",
    icon: GitBranch,
    color: "#4cb782",
  },
] as const;

/** Concave-corner radius linking the tab bar to the panel edge. */
const R = 22;

export function HeroShowcase() {
  const [active, setActive] = useState<(typeof TABS)[number]["id"]>("issues");

  const notch = (corner: "left" | "right"): CSSProperties => ({
    width: R,
    height: R,
    background: `radial-gradient(circle at top ${corner}, transparent ${R}px, var(--panel) ${R + 0.5}px)`,
  });

  return (
    <div
      className="relative mt-16 w-full"
      style={
        {
          "--panel":
            "color-mix(in oklab, var(--background), var(--foreground) 4%)",
        } as CSSProperties
      }
    >
      <div className="relative bg-[var(--panel)] px-3 pt-12 pb-6 sm:px-6 sm:pb-12">
        {/* Tab bar, rising above the panel's top edge, centered */}
        <div className="absolute top-0 left-1/2 flex -translate-x-1/2 -translate-y-full items-end">
          <span aria-hidden style={notch("left")} />
          <div className="flex items-center gap-0.5 rounded-t-xl bg-[var(--panel)] px-1 pt-1 sm:gap-1 sm:rounded-t-2xl sm:px-1.5 sm:pt-1.5">
            {TABS.map((tab) => {
              const isActive = tab.id === active;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActive(tab.id)}
                  className={cn(
                    "flex items-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-all sm:gap-2 sm:rounded-xl sm:px-3 sm:py-2 sm:text-sm",
                    isActive
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <span
                    className="flex size-4 shrink-0 items-center justify-center rounded sm:size-5 sm:rounded-md"
                    style={{
                      backgroundColor: `${tab.color}22`,
                      color: tab.color,
                    }}
                  >
                    <tab.icon className="size-2.5 sm:size-3" />
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>
          <span aria-hidden style={notch("right")} />
        </div>

        <div className="mx-auto w-full max-w-6xl">
          <MockApp />
        </div>
      </div>
    </div>
  );
}
