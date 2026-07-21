import {
  Bot,
  Box,
  ChevronDown,
  Inbox,
  LayoutGrid,
  ListFilter,
  Plus,
  RefreshCcw,
  Search,
  Target,
  UserRound,
} from "lucide-react";
import { LabelChip } from "@/components/shared/label-chip";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { StatusIcon } from "@/components/shared/status-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Kbd } from "@/components/marketing/kbd";
import { HERO_ISSUE_GROUPS, type MockIssue } from "@/components/marketing/mock-data";
import { MockFrame, MockWindowBar } from "@/components/marketing/mock-window";
import { cn } from "@/lib/utils";

/**
 * The hero product mock: a full Skarm workspace window (sidebar + grouped
 * issue list) built from the same primitives the real app uses.
 */
export function MockApp({ className }: { className?: string }) {
  return (
    <MockFrame className={className}>
      <MockWindowBar title="skarm/acme/team/eng" />
      <div className="flex h-104 text-[13px]">
        <MockSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b px-4">
            <span className="font-medium">Engineering</span>
            <span className="text-muted-foreground/60">/</span>
            <span className="text-muted-foreground">Active issues</span>
            <div className="ml-auto flex items-center gap-1.5 text-muted-foreground">
              <span className="hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs sm:flex">
                <ListFilter className="size-3" /> Filter
              </span>
              <span className="hidden items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs sm:flex">
                <LayoutGrid className="size-3" /> Board
              </span>
              <span className="flex items-center gap-1 rounded-md bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                <Plus className="size-3" /> New issue
                <Kbd className="ml-0.5 h-4 border-0 bg-primary-foreground/15 text-primary-foreground">
                  C
                </Kbd>
              </span>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {HERO_ISSUE_GROUPS.map((group) => (
              <div key={group.label}>
                <div className="flex h-8 items-center gap-2 border-b bg-muted/40 px-4">
                  <StatusIcon status={group.status} className="size-3.5" />
                  <span className="text-xs font-medium">{group.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {group.issues.length}
                  </span>
                </div>
                {group.issues.map((issue) => (
                  <MockIssueRow key={issue.id} issue={issue} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

function MockSidebar() {
  return (
    <aside className="hidden w-52 shrink-0 flex-col border-r bg-muted/20 md:flex">
      <div className="flex h-10 items-center gap-2 border-b px-3">
        <span className="flex size-5 items-center justify-center rounded bg-primary text-[10px] font-bold text-primary-foreground">
          A
        </span>
        <span className="text-xs font-semibold">Acme Inc</span>
        <ChevronDown className="size-3 text-muted-foreground" />
      </div>
      <nav className="flex flex-col gap-0.5 p-2 text-xs text-muted-foreground">
        <SidebarItem icon={<Inbox className="size-3.5" />} label="Inbox" badge="3" />
        <SidebarItem icon={<UserRound className="size-3.5" />} label="My issues" />
        <SidebarItem icon={<Search className="size-3.5" />} label="Search" kbd="/" />
        <p className="mt-3 mb-1 px-2 text-[10px] font-medium tracking-wider uppercase">
          Workspace
        </p>
        <SidebarItem icon={<Target className="size-3.5" />} label="Projects" />
        <SidebarItem icon={<RefreshCcw className="size-3.5" />} label="Cycles" />
        <SidebarItem icon={<Bot className="size-3.5" />} label="AI Agent" badge="Pro" />
        <p className="mt-3 mb-1 px-2 text-[10px] font-medium tracking-wider uppercase">
          Teams
        </p>
        <SidebarItem
          icon={<Box className="size-3.5" />}
          label="Engineering"
          active
        />
        <SidebarItem icon={<Box className="size-3.5" />} label="Design" />
        <SidebarItem icon={<Box className="size-3.5" />} label="Growth" />
      </nav>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  badge,
  kbd,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  badge?: string;
  kbd?: string;
  active?: boolean;
}) {
  return (
    <span
      className={cn(
        "flex h-7 items-center gap-2 rounded-md px-2",
        active && "bg-accent font-medium text-foreground"
      )}
    >
      {icon}
      {label}
      {badge ? (
        <span className="ml-auto rounded border px-1 text-[10px]">{badge}</span>
      ) : null}
      {kbd ? <Kbd className="ml-auto h-4">{kbd}</Kbd> : null}
    </span>
  );
}

export function MockIssueRow({ issue }: { issue: MockIssue }) {
  return (
    <div className="flex h-9 items-center gap-3 border-b px-4 transition-colors hover:bg-accent/50">
      <PriorityIcon priority={issue.priority} className="size-3.5" />
      <span className="w-14 shrink-0 font-mono text-[11px] text-muted-foreground">
        {issue.id}
      </span>
      <StatusIcon status={issue.status} className="size-3.5" />
      <span className="min-w-0 flex-1 truncate font-medium">{issue.title}</span>
      {issue.label ? (
        <LabelChip
          name={issue.label.name}
          color={issue.label.color}
          className="hidden py-0 text-[10px] lg:inline-flex"
        />
      ) : null}
      {issue.due ? (
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
          {issue.due}
        </span>
      ) : null}
      {issue.assignee ? (
        <UserAvatar name={issue.assignee} />
      ) : (
        <span className="size-5 rounded-full border border-dashed border-muted-foreground/40" />
      )}
    </div>
  );
}
