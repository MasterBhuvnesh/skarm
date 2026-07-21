import { ChevronRight, GitBranch, Paperclip } from "lucide-react";
import { LabelChip } from "@/components/shared/label-chip";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { MOCK_LABELS, MOCK_PEOPLE } from "@/components/marketing/mock-data";
import { MockFrame, MockWindowBar } from "@/components/marketing/mock-window";

/**
 * Issue detail mock for the "Issues" feature section: title, description,
 * sub-issues, a comment with an @mention, and the properties rail.
 */
export function MockIssueDetail({ className }: { className?: string }) {
  return (
    <MockFrame className={className}>
      <MockWindowBar>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Engineering
          <ChevronRight className="size-3" />
          <span className="font-mono">ENG-142</span>
        </span>
      </MockWindowBar>
      <div className="flex text-[13px]">
        <div className="min-w-0 flex-1 space-y-4 p-5">
          <h3 className="text-base font-semibold tracking-tight">
            Polish board drag physics on long columns
          </h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Cards should settle with a 120ms ease-out when dropped between
            columns. Today the spring overshoots when the target column is
            scrolled, which makes fractional reordering feel imprecise.
          </p>
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium text-muted-foreground">
              Sub-issues · 2/3
            </p>
            <MockSubIssue id="ENG-148" title="Clamp spring overshoot" done />
            <MockSubIssue id="ENG-149" title="Recompute drop index on scroll" done />
            <MockSubIssue id="ENG-150" title="Add reduced-motion fallback" />
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <UserAvatar name={MOCK_PEOPLE.jonas} className="size-4" />
              <span className="text-xs font-medium">{MOCK_PEOPLE.jonas}</span>
              <span className="text-[11px] text-muted-foreground">2h ago</span>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              <span className="rounded bg-blue-500/10 px-1 font-medium text-blue-500">
                @Ada
              </span>{" "}
              repro’d this on a 60-card column - fix in review, demo in the
              cycle sync.
            </p>
          </div>
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="size-1.5 rounded-full bg-yellow-500" />
            {MOCK_PEOPLE.ada} moved from Todo to In Progress · 2h ago
          </p>
        </div>
        <aside className="hidden w-44 shrink-0 space-y-3 border-l p-4 text-xs sm:block">
          <p className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
            Properties
          </p>
          <PropertyRow label="Status">
            <StatusIcon status="in_progress" className="size-3.5" />
            In Progress
          </PropertyRow>
          <PropertyRow label="Priority">
            <PriorityIcon priority="urgent" className="size-3.5" />
            Urgent
          </PropertyRow>
          <PropertyRow label="Assignee">
            <UserAvatar name={MOCK_PEOPLE.ada} className="size-4" />
            Ada
          </PropertyRow>
          <PropertyRow label="Cycle">
            <span className="font-mono text-[11px]">Cycle 14</span>
          </PropertyRow>
          <PropertyRow label="Labels">
            <LabelChip
              name={MOCK_LABELS.design.name}
              color={MOCK_LABELS.design.color}
              className="py-0 text-[10px]"
            />
          </PropertyRow>
          <PropertyRow label="Links">
            <GitBranch className="size-3.5 text-muted-foreground" />
            <Paperclip className="size-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">+2</span>
          </PropertyRow>
        </aside>
      </div>
    </MockFrame>
  );
}

function MockSubIssue({
  id,
  title,
  done,
}: {
  id: string;
  title: string;
  done?: boolean;
}) {
  return (
    <div className="flex h-7 items-center gap-2 rounded-md border px-2 text-xs">
      <StatusIcon status={done ? "done" : "todo"} className="size-3.5" />
      <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
      <span className={done ? "text-muted-foreground line-through" : undefined}>
        {title}
      </span>
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 font-medium">{children}</span>
    </div>
  );
}
