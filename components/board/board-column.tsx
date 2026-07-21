"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { IssueStatus } from "@/components/shared/issue-meta";
import { StatusIcon } from "@/components/shared/status-icon";
import { cn } from "@/lib/utils";
import { BoardCard, CardAssignee, CardLabel } from "./board-card";
import { QuickCreateCard } from "./quick-create-card";

export const COLUMN_ID_PREFIX = "column:";

export function BoardColumn({
  status,
  label,
  issues,
  teamId,
  teamKey,
  labelsByIssue,
  assigneesById,
  onOpenIssue,
  canLoadMore,
  isLoadingMore,
  onLoadMore,
}: {
  status: IssueStatus;
  label: string;
  issues: Doc<"issues">[];
  teamId: Id<"teams">;
  teamKey: string;
  labelsByIssue: Map<Id<"issues">, CardLabel[]>;
  assigneesById: Map<string, CardAssignee>;
  onOpenIssue: (issueId: Id<"issues">) => void;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${COLUMN_ID_PREFIX}${status}`,
    data: { type: "column", status },
  });
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <div className="flex max-h-full w-72 shrink-0 flex-col rounded-lg bg-muted/40">
      <div className="flex h-10 shrink-0 items-center gap-2 px-3">
        <StatusIcon status={status} />
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {issues.length}
          {canLoadMore || isLoadingMore ? "+" : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto size-6 text-muted-foreground"
          onClick={() => setComposerOpen(true)}
          aria-label={`New ${label} issue`}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>
      <SortableContext
        items={issues.map((issue) => issue._id)}
        strategy={verticalListSortingStrategy}
      >
        <div
          ref={setNodeRef}
          className={cn(
            "flex min-h-16 flex-1 flex-col gap-2 overflow-y-auto rounded-b-lg p-2 pt-0 transition-colors",
            isOver && "bg-accent/40"
          )}
        >
          {composerOpen ? (
            <QuickCreateCard
              teamId={teamId}
              status={status}
              onClose={() => setComposerOpen(false)}
            />
          ) : null}
          {issues.map((issue) => (
            <BoardCard
              key={issue._id}
              issue={issue}
              teamKey={teamKey}
              labels={labelsByIssue.get(issue._id) ?? []}
              assignee={
                issue.assigneeId
                  ? assigneesById.get(issue.assigneeId)
                  : undefined
              }
              onOpen={() => onOpenIssue(issue._id)}
            />
          ))}
          {canLoadMore || isLoadingMore ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-full text-xs text-muted-foreground"
              onClick={onLoadMore}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Load more"
              )}
            </Button>
          ) : null}
          {issues.length === 0 &&
          !composerOpen &&
          !canLoadMore &&
          !isLoadingMore ? (
            <button
              onClick={() => setComposerOpen(true)}
              className="flex h-14 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground/70 transition-colors hover:border-muted-foreground/40 hover:text-muted-foreground"
            >
              Drop issues here or click to add
            </button>
          ) : null}
        </div>
      </SortableContext>
    </div>
  );
}
