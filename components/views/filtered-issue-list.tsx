"use client";

import { Doc } from "@/convex/_generated/dataModel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IssueRow } from "@/components/issues/issue-row";
import { STATUSES } from "@/components/shared/issue-meta";
import { StatusIcon } from "@/components/shared/status-icon";

/**
 * List display for the board route: issues grouped by status, pre-filtered
 * by the caller. Mirrors the foundation team page's density.
 */
export function FilteredIssueList({
  issues,
  teamKey,
  hasActiveFilters,
}: {
  issues: Doc<"issues">[];
  teamKey: string;
  hasActiveFilters: boolean;
}) {
  const grouped = STATUSES.map((status) => ({
    status,
    issues: issues
      .filter((issue) => issue.status === status.value)
      .sort((a, b) => b.sortOrder - a.sortOrder),
  })).filter((group) => group.issues.length > 0);

  if (issues.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {hasActiveFilters
          ? "No issues match the current filters."
          : "No issues yet. Press C to create one."}
      </div>
    );
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      {grouped.map(({ status, issues: groupIssues }) => (
        <section key={status.value}>
          <div className="flex h-9 items-center gap-2 bg-muted/50 px-4 text-sm">
            <StatusIcon status={status.value} />
            <span className="font-medium">{status.label}</span>
            <span className="text-xs text-muted-foreground">
              {groupIssues.length}
            </span>
          </div>
          {groupIssues.map((issue) => (
            <IssueRow key={issue._id} issue={issue} teamKey={teamKey} />
          ))}
        </section>
      ))}
    </ScrollArea>
  );
}
