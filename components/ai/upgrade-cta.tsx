"use client";

import { Bot, FileSearch, Sparkles, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    icon: Sparkles,
    title: "Chat with your workspace",
    description: "Create, update and find issues in plain language.",
  },
  {
    icon: FileSearch,
    title: "Duplicate detection",
    description: "Semantic search flags lookalike issues before you file them.",
  },
  {
    icon: Zap,
    title: "Standup & cycle reports",
    description: "One-prompt summaries of what your team shipped.",
  },
];

/** Shown on /ai when the org's plan doesn't include the `ai_agent` feature. */
export function AiUpgradeCta() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border bg-primary/10">
          <Bot className="size-6 text-primary" />
        </div>
        <div className="flex flex-col gap-1.5">
          <h2 className="text-lg font-semibold">Meet Cohere, your AI agent</h2>
          <p className="text-sm text-muted-foreground">
            Cohere works inside your workspace - triaging, reporting and
            filing issues for you. Available on Pro and Enterprise plans.
          </p>
        </div>
        <div className="flex w-full flex-col gap-3 rounded-lg border bg-card p-4 text-left">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex items-start gap-3">
              <feature.icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{feature.title}</p>
                <p className="text-xs text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </div>
          ))}
        </div>
        <Button asChild size="sm">
          <Link href="/pricing">Upgrade to Pro</Link>
        </Button>
      </div>
    </div>
  );
}
