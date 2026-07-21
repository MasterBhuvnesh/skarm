"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays } from "lucide-react";
import { Doc } from "@/convex/_generated/dataModel";
import { LabelChip } from "@/components/shared/label-chip";
import { PriorityIcon } from "@/components/shared/priority-icon";
import { UserAvatar } from "@/components/shared/user-avatar";
import { cn } from "@/lib/utils";

export type CardLabel = { labelId: string; name: string; color: string };
export type CardAssignee = { name: string; imageUrl?: string };

/**
 * Snapshot once per page load - overdue styling doesn't need to tick live,
 * and React Compiler forbids impure calls like Date.now() during render.
 */
const loadedAt = Date.now();

function formatDueDate(dueDate: number): string {
  return new Date(dueDate).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/** Pure card presentation, shared by the sortable card and the drag overlay. */
export function BoardCardContent({
  issue,
  teamKey,
  labels,
  assignee,
  overlay = false,
}: {
  issue: Doc<"issues">;
  teamKey: string;
  labels: CardLabel[];
  assignee?: CardAssignee;
  overlay?: boolean;
}) {
  const overdue = issue.dueDate !== undefined && issue.dueDate < loadedAt;

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border bg-card p-3 text-left shadow-xs transition-colors",
        overlay
          ? "border-primary/40 shadow-lg"
          : "hover:border-muted-foreground/30"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">
          {teamKey}-{issue.number}
        </span>
        {assignee ? (
          <UserAvatar name={assignee.name} imageUrl={assignee.imageUrl} />
        ) : (
          <span className="size-5 rounded-full border border-dashed border-muted-foreground/40" />
        )}
      </div>
      <p className="line-clamp-2 text-sm font-medium leading-snug">
        {issue.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <PriorityIcon priority={issue.priority} className="size-3.5" />
        {issue.estimate !== undefined ? (
          <span className="rounded border px-1 font-mono text-[10px] text-muted-foreground">
            {issue.estimate}
          </span>
        ) : null}
        {issue.dueDate !== undefined ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px]",
              overdue ? "text-red-500" : "text-muted-foreground"
            )}
          >
            <CalendarDays className="size-3" />
            {formatDueDate(issue.dueDate)}
          </span>
        ) : null}
        {labels.map((label) => (
          <LabelChip
            key={label.labelId}
            name={label.name}
            color={label.color}
            className="px-1.5 py-0 text-[10px]"
          />
        ))}
      </div>
    </div>
  );
}

/** Draggable + clickable Kanban card. */
export function BoardCard({
  issue,
  teamKey,
  labels,
  assignee,
  onOpen,
}: {
  issue: Doc<"issues">;
  teamKey: string;
  labels: CardLabel[];
  assignee?: CardAssignee;
  onOpen: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: issue._id, data: { type: "card" } });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className={cn(
        "cursor-pointer rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring [content-visibility:auto] [contain-intrinsic-size:auto_96px]",
        isDragging && "opacity-40"
      )}
    >
      <BoardCardContent
        issue={issue}
        teamKey={teamKey}
        labels={labels}
        assignee={assignee}
      />
    </div>
  );
}
