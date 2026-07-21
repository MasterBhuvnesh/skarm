import { Check, CornerDownLeft, Sparkles } from "lucide-react";
import { StatusIcon } from "@/components/shared/status-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MOCK_PEOPLE } from "@/components/marketing/mock-data";
import { MockFrame, MockWindowBar } from "@/components/marketing/mock-window";

/**
 * AI agent chat mock: a question, the agent's tool calls, a cycle summary,
 * and an issue the agent filed — mirroring the real /ai experience.
 */
export function MockAiChat({ className }: { className?: string }) {
  return (
    <MockFrame className={className}>
      <MockWindowBar>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Sparkles className="size-3" />
          Agent
        </span>
        <span className="ml-auto rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">
          Pro
        </span>
      </MockWindowBar>
      <div className="space-y-4 p-4 text-[13px]">
        <div className="flex items-start gap-2.5">
          <UserAvatar name={MOCK_PEOPLE.ivy} className="mt-0.5 size-5" />
          <div>
            <p className="text-xs font-medium">{MOCK_PEOPLE.ivy}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              What shipped in Cycle 14, and what’s at risk before Friday?
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border bg-muted">
            <Sparkles className="size-3 text-muted-foreground" />
          </span>
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              <ToolChip name="cycle_summary" />
              <ToolChip name="search_issues" />
              <ToolChip name="create_issue" />
            </div>
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">
                  Shipped (8)
                </span>{" "}
                — keyboard triage, auth redirect fix, board virtualization,
                and 5 more.
              </p>
              <p>
                <span className="font-medium text-foreground">
                  At risk (2)
                </span>{" "}
                — ENG-147 Skarm index migration has no reviewer; ENG-146 is
                blocked on a data backfill.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-2.5 py-2">
              <StatusIcon status="todo" className="size-3.5" />
              <span className="font-mono text-[10px] text-muted-foreground">
                ENG-151
              </span>
              <span className="truncate text-xs font-medium">
                Assign reviewer for Skarm index migration
              </span>
              <span className="ml-auto shrink-0 rounded border px-1 text-[9px] text-muted-foreground">
                filed by Agent
              </span>
            </div>
          </div>
        </div>

        <div className="flex h-9 items-center gap-2 rounded-lg border bg-background px-3 text-xs text-muted-foreground">
          Draft the standup for #engineering…
          <span className="ml-auto flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]">
            <CornerDownLeft className="size-3" /> Send
          </span>
        </div>
      </div>
    </MockFrame>
  );
}

function ToolChip({ name }: { name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
      <Check className="size-2.5 text-emerald-500" />
      {name}
    </span>
  );
}
