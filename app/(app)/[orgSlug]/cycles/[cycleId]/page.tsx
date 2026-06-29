"use client";

import { useMutation, useQuery } from "convex/react";
import { ChevronRight, Loader2, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  cycleDisplayName,
  cycleStatus,
  daysRemaining,
  daysUntilStart,
} from "@/components/cycles/cycle-meta";
import { CycleStatusBadge } from "@/components/cycles/cycle-status-badge";
import { EditCycleDialog } from "@/components/cycles/edit-cycle-dialog";
import { AddIssuesPopover } from "@/components/projects/add-issues-popover";
import { formatDateRange } from "@/components/projects/dates";
import { GroupedIssueList } from "@/components/projects/grouped-issue-list";
import {
  completionPercent,
  progressFromIssues,
} from "@/components/projects/project-meta";
import { IssueProgressBar } from "@/components/projects/progress-bar";

/** Cycle detail — Track B. Time-box header, progress, and scheduled issues. */
export default function CycleDetailPage() {
  const params = useParams<{ orgSlug: string; cycleId: string }>();
  const cycleId = params.cycleId as Id<"cycles">;
  const cycle = useQuery(api.cycles.get, { cycleId });
  const team = useQuery(
    api.teams.get,
    cycle ? { teamId: cycle.teamId } : "skip"
  );

  if (cycle === undefined || (cycle && team === undefined)) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (cycle === null || !team) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Cycle not found.
      </div>
    );
  }

  return <CycleDetail cycle={cycle} team={team} orgSlug={params.orgSlug} />;
}

function CycleDetail({
  cycle,
  team,
  orgSlug,
}: {
  cycle: Doc<"cycles">;
  team: Doc<"teams">;
  orgSlug: string;
}) {
  const router = useRouter();
  const issues = useQuery(api.cycles.listIssues, { cycleId: cycle._id });
  const candidates = useQuery(api.cycles.candidateIssues, {
    cycleId: cycle._id,
  });
  const updateIssue = useMutation(api.issues.update);
  const removeCycle = useMutation(api.cycles.remove);
  const [editOpen, setEditOpen] = useState(false);

  const status = cycleStatus(cycle);
  const progress = progressFromIssues(issues ?? []);

  const addIssue = (issueId: Id<"issues">) => {
    updateIssue({ issueId, cycleId: cycle._id }).catch((error: unknown) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to add issue"
      );
    });
  };

  const handleDelete = async () => {
    try {
      await removeCycle({ cycleId: cycle._id });
      toast.success("Cycle deleted");
      router.push(`/${orgSlug}/cycles`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete cycle"
      );
    }
  };

  const timing =
    status === "current"
      ? `${daysRemaining(cycle)} days left`
      : status === "upcoming"
        ? `starts in ${daysUntilStart(cycle)} days`
        : "ended";

  return (
    <>
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4 text-sm">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href={`/${orgSlug}/cycles`}
            className="text-muted-foreground hover:text-foreground"
          >
            Cycles
          </Link>
          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="font-mono text-xs text-muted-foreground">
            {team.key}
          </span>
          <span className="truncate font-medium">
            {cycleDisplayName(cycle)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <AddIssuesPopover
            candidates={candidates}
            teamKeyFor={() => team.key}
            onAdd={addIssue}
            emptyText="Every team issue is already in this cycle."
          />
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={() => setEditOpen(true)}
            aria-label="Edit cycle"
          >
            <Pencil className="size-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="size-8 text-destructive hover:text-destructive"
                aria-label="Delete cycle"
              >
                <Trash2 className="size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {cycleDisplayName(cycle)}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  The cycle will be permanently deleted. Its issues are kept
                  and simply unscheduled.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => void handleDelete()}
                  className="bg-destructive text-white hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 border-b px-4 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              {cycleDisplayName(cycle)}
            </h1>
            <CycleStatusBadge status={status} />
            <span className="text-xs text-muted-foreground">
              {formatDateRange(cycle.startDate, cycle.endDate)} · {timing}
            </span>
          </div>
          <div className="flex max-w-xl items-center gap-3">
            <IssueProgressBar progress={progress} className="flex-1" />
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {progress.done} of {progress.total - progress.canceled} done ·{" "}
              {completionPercent(progress)}%
            </span>
          </div>
        </div>

        {issues === undefined ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <GroupedIssueList
            issues={issues}
            teamKeyFor={() => team.key}
            emptyState={
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <p className="text-sm text-muted-foreground">
                  No issues scheduled into this cycle yet. Use{" "}
                  <span className="font-medium text-foreground">
                    Add issues
                  </span>{" "}
                  to plan it.
                </p>
              </div>
            }
          />
        )}
      </ScrollArea>

      {editOpen && (
        <EditCycleDialog
          cycle={cycle}
          open={editOpen}
          onOpenChange={setEditOpen}
        />
      )}
    </>
  );
}
