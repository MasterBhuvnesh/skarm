"use client";

import {
  closestCorners,
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  UniqueIdentifier,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { IssueStatus, STATUSES } from "@/components/shared/issue-meta";
import { BoardCardContent, CardAssignee, CardLabel } from "./board-card";
import { BoardColumn, COLUMN_ID_PREFIX } from "./board-column";

type Columns = Record<IssueStatus, Id<"issues">[]>;

const STATUS_SET = new Set<string>(STATUSES.map((s) => s.value));

function emptyColumns(): Columns {
  return {
    backlog: [],
    todo: [],
    in_progress: [],
    in_review: [],
    done: [],
    canceled: [],
  };
}

function statusFromDroppableId(id: UniqueIdentifier): IssueStatus | null {
  if (typeof id !== "string" || !id.startsWith(COLUMN_ID_PREFIX)) {
    return null;
  }
  const status = id.slice(COLUMN_ID_PREFIX.length);
  return STATUS_SET.has(status) ? (status as IssueStatus) : null;
}

function findContainer(
  columns: Columns,
  id: UniqueIdentifier
): IssueStatus | null {
  for (const { value } of STATUSES) {
    if (columns[value].includes(id as Id<"issues">)) {
      return value;
    }
  }
  return null;
}

/** Gap used when an issue is dropped at the top or bottom of a column. */
const SORT_GAP = 1000;

/**
 * Kanban board: one column per status, drag-and-drop via @dnd-kit. Drops
 * persist through `issues.update` with a fractional sortOrder between the
 * new neighbors, applied optimistically so the realtime query never
 * flickers.
 */
export type ColumnPagination = {
  canLoadMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
};

export function BoardView({
  issues,
  teamId,
  teamKey,
  orgSlug,
  labelsByIssue,
  assigneesById,
  pagination,
}: {
  issues: Doc<"issues">[];
  teamId: Id<"teams">;
  teamKey: string;
  orgSlug: string;
  labelsByIssue: Map<Id<"issues">, CardLabel[]>;
  assigneesById: Map<string, CardAssignee>;
  pagination: Record<IssueStatus, ColumnPagination>;
}) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Board columns each subscribe to their own paginated query, so an
  // optimistic move must edit the loaded pages directly: drop the issue from
  // wherever it sits and prepend it to the target column's head page. Display
  // re-sorts by sortOrder, so the exact bucket doesn't matter until the server
  // reconciles the real pages.
  const updateIssue = useMutation(api.issues.update).withOptimisticUpdate(
    (localStore, args) => {
      const pages = localStore.getAllQueries(
        api.issues.listByTeamStatusPaginated
      );
      type LoadedIssue = NonNullable<
        (typeof pages)[number]["value"]
      >["page"][number];

      let moving: LoadedIssue | undefined;
      for (const { args: qArgs, value } of pages) {
        if (!value || qArgs.teamId !== teamId) {
          continue;
        }
        const found = value.page.find((issue) => issue._id === args.issueId);
        if (found) {
          moving = found;
          break;
        }
      }
      if (!moving) {
        return;
      }
      const updated: LoadedIssue = {
        ...moving,
        ...(args.status !== undefined ? { status: args.status } : {}),
        ...(args.sortOrder !== undefined ? { sortOrder: args.sortOrder } : {}),
      };

      for (const { args: qArgs, value } of pages) {
        if (!value || qArgs.teamId !== teamId) {
          continue;
        }
        const hadIssue = value.page.some(
          (issue) => issue._id === args.issueId
        );
        const isTargetHead =
          qArgs.status === updated.status &&
          qArgs.paginationOpts.cursor === null;
        if (!hadIssue && !isTargetHead) {
          continue;
        }
        let page = value.page.filter((issue) => issue._id !== args.issueId);
        if (isTargetHead) {
          page = [updated, ...page];
        }
        localStore.setQuery(api.issues.listByTeamStatusPaginated, qArgs, {
          ...value,
          page,
        });
      }
    }
  );

  const issueById = useMemo(
    () => new Map(issues.map((issue) => [issue._id, issue])),
    [issues]
  );

  const serverColumns = useMemo(() => {
    const columns = emptyColumns();
    for (const issue of [...issues].sort(
      (a, b) => b.sortOrder - a.sortOrder
    )) {
      columns[issue.status].push(issue._id);
    }
    return columns;
  }, [issues]);

  const [dragState, setDragState] = useState<{
    activeId: Id<"issues">;
    columns: Columns;
  } | null>(null);

  // Suppresses the click that browsers fire right after a drop, so dropping
  // a card doesn't navigate to the issue page. Plain clicks never activate
  // the drag sensor (4px constraint), so they are unaffected.
  const suppressClickRef = useRef(false);

  const columns = dragState?.columns ?? serverColumns;
  const activeIssue = dragState ? issueById.get(dragState.activeId) : undefined;

  const openIssue = (issueId: Id<"issues">) => {
    if (suppressClickRef.current) {
      return;
    }
    router.push(`/${orgSlug}/issue/${issueId}`);
  };

  const handleDragStart = (event: DragStartEvent) => {
    suppressClickRef.current = true;
    setDragState({
      activeId: event.active.id as Id<"issues">,
      columns: serverColumns,
    });
  };

  const releaseClickSuppression = () => {
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 120);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) {
      return;
    }
    const activeId = active.id as Id<"issues">;
    setDragState((prev) => {
      if (!prev) {
        return prev;
      }
      const activeContainer = findContainer(prev.columns, activeId);
      const overStatus = statusFromDroppableId(over.id);
      const overContainer = overStatus ?? findContainer(prev.columns, over.id);
      if (
        !activeContainer ||
        !overContainer ||
        activeContainer === overContainer
      ) {
        return prev;
      }

      // Move the card into the hovered column at the hovered position.
      const overItems = prev.columns[overContainer];
      let newIndex = overItems.length;
      if (!overStatus) {
        const overIndex = overItems.indexOf(over.id as Id<"issues">);
        const isBelowOverItem =
          active.rect.current.translated !== null &&
          active.rect.current.translated !== undefined &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;
        newIndex = overIndex >= 0 ? overIndex + (isBelowOverItem ? 1 : 0) : overItems.length;
      }

      return {
        ...prev,
        columns: {
          ...prev.columns,
          [activeContainer]: prev.columns[activeContainer].filter(
            (id) => id !== activeId
          ),
          [overContainer]: [
            ...overItems.slice(0, newIndex),
            activeId,
            ...overItems.slice(newIndex),
          ],
        },
      };
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    const state = dragState;
    setDragState(null);
    releaseClickSuppression();
    if (!state || !over) {
      return;
    }

    const activeId = active.id as Id<"issues">;
    let workingColumns = state.columns;
    const activeContainer = findContainer(workingColumns, activeId);
    if (!activeContainer) {
      return;
    }

    // Same-column reorder: cross-column moves already happened in onDragOver.
    const overStatus = statusFromDroppableId(over.id);
    if (!overStatus && over.id !== activeId) {
      const overContainer = findContainer(workingColumns, over.id);
      if (overContainer === activeContainer) {
        const items = workingColumns[activeContainer];
        const oldIndex = items.indexOf(activeId);
        const newIndex = items.indexOf(over.id as Id<"issues">);
        if (oldIndex !== -1 && newIndex !== -1) {
          workingColumns = {
            ...workingColumns,
            [activeContainer]: arrayMove(items, oldIndex, newIndex),
          };
        }
      }
    }

    const issue = issueById.get(activeId);
    const items = workingColumns[activeContainer];
    const index = items.indexOf(activeId);
    if (!issue || index === -1) {
      return;
    }

    // Fractional ordering between the new neighbors (columns sort
    // descending: top of column = highest sortOrder).
    const above = index > 0 ? issueById.get(items[index - 1]) : undefined;
    const below =
      index < items.length - 1 ? issueById.get(items[index + 1]) : undefined;
    let sortOrder: number;
    if (above && below) {
      sortOrder = (above.sortOrder + below.sortOrder) / 2;
    } else if (above) {
      sortOrder = above.sortOrder - SORT_GAP;
    } else if (below) {
      sortOrder = below.sortOrder + SORT_GAP;
    } else {
      sortOrder = issue.sortOrder;
    }

    const statusChanged = activeContainer !== issue.status;
    const orderChanged = sortOrder !== issue.sortOrder;
    if (!statusChanged && !orderChanged) {
      return;
    }

    updateIssue({
      issueId: activeId,
      ...(statusChanged ? { status: activeContainer } : {}),
      ...(orderChanged ? { sortOrder } : {}),
    }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to move issue"
      );
    });
  };

  const handleDragCancel = () => {
    setDragState(null);
    releaseClickSuppression();
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="flex min-h-0 flex-1 items-stretch gap-3 overflow-x-auto p-3">
        {STATUSES.map(({ value, label }) => (
          <BoardColumn
            key={value}
            status={value}
            label={label}
            issues={columns[value]
              .map((id) => issueById.get(id))
              .filter((issue): issue is Doc<"issues"> => issue !== undefined)}
            teamId={teamId}
            teamKey={teamKey}
            labelsByIssue={labelsByIssue}
            assigneesById={assigneesById}
            onOpenIssue={openIssue}
            canLoadMore={pagination[value].canLoadMore}
            isLoadingMore={pagination[value].isLoadingMore}
            onLoadMore={pagination[value].loadMore}
          />
        ))}
      </div>
      <DragOverlay>
        {activeIssue ? (
          <BoardCardContent
            issue={activeIssue}
            teamKey={teamKey}
            labels={labelsByIssue.get(activeIssue._id) ?? []}
            assignee={
              activeIssue.assigneeId
                ? assigneesById.get(activeIssue.assigneeId)
                : undefined
            }
            overlay
          />
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
