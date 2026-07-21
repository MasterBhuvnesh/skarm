"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { IssueRow } from "@/components/issues/issue-row";
import { IssueStatus, STATUSES } from "@/components/shared/issue-meta";
import { StatusIcon } from "@/components/shared/status-icon";

const CLOSED_STATUSES = new Set<IssueStatus>(["done", "canceled"]);

/**
 * Workspace home — a "My Issues" dashboard of everything assigned to and
 * created by the current user, or the empty state nudging team creation
 * (the sidebar has the create button).
 */
export default function WorkspaceHomePage() {
  const teams = useQuery(api.teams.list);
  const { has } = useAuth();
  const isAdmin = has?.({ role: "org:admin" }) ?? false;

  const seedDemoData = useMutation(api.seed.demoData);
  const [seeding, setSeeding] = useState(false);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const result = await seedDemoData({});
      toast.success(
        `Demo workspace ready - ${result.teams} teams, ${result.issues} issues, ${result.projects} projects.`
      );
      // Keep the spinner on; the reactive teams query swaps this view to the
      // My Issues dashboard once the seed lands.
    } catch (error) {
      setSeeding(false);
      toast.error(
        error instanceof Error ? error.message : "Seeding demo data failed."
      );
    }
  };

  if (teams === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (teams.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <h2 className="text-lg font-medium">Welcome to Skarm</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Create your first team from the sidebar to start tracking issues.
        </p>
        {isAdmin && (
          <>
            <Button
              size="sm"
              className="mt-3"
              onClick={handleSeed}
              disabled={seeding}
            >
              {seeding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {seeding ? "Seeding…" : "Seed demo data"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Populates 3 teams with issues, projects, cycles and labels.
            </p>
          </>
        )}
      </div>
    );
  }

  return <MyIssuesDashboard />;
}

function MyIssuesDashboard() {
  const data = useQuery(api.issues.myIssues);
  const [showClosed, setShowClosed] = useState(false);
  const [createdOverride, setCreatedOverride] = useState<boolean | null>(null);

  const assigned = data?.assigned ?? [];
  const created = data?.created ?? [];

  const visibleStatuses = showClosed
    ? STATUSES
    : STATUSES.filter((status) => !CLOSED_STATUSES.has(status.value));
  const groupedAssigned = visibleStatuses
    .map((status) => ({
      status,
      issues: assigned
        .filter((issue) => issue.status === status.value)
        .sort((a, b) => b.sortOrder - a.sortOrder),
    }))
    .filter((group) => group.issues.length > 0);

  const hasClosedAssigned = assigned.some((issue) =>
    CLOSED_STATUSES.has(issue.status)
  );
  const createdExpanded = createdOverride ?? created.length <= 10;

  return (
    <>
      <header className="flex h-12 shrink-0 items-center border-b px-4">
        <span className="text-sm font-medium">My Issues</span>
      </header>
      <ScrollArea className="min-h-0 flex-1">
        {data === undefined ? (
          <div className="flex items-center justify-center py-32">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : assigned.length === 0 && created.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-32 text-center">
            <p className="text-sm text-muted-foreground">
              Nothing assigned to you yet.
            </p>
          </div>
        ) : (
          <>
            <section>
              <div className="flex h-9 items-center justify-between gap-2 border-b bg-muted/30 px-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Assigned to me
                </span>
                {hasClosedAssigned ? (
                  <button
                    onClick={() => setShowClosed((value) => !value)}
                    className="text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {showClosed ? "Hide closed" : "Show closed"}
                  </button>
                ) : null}
              </div>
              {groupedAssigned.length === 0 ? (
                <div className="px-4 py-6 text-sm text-muted-foreground">
                  No open issues assigned to you.
                </div>
              ) : (
                groupedAssigned.map(({ status, issues: groupIssues }) => (
                  <section key={status.value}>
                    <div className="flex h-9 items-center gap-2 bg-muted/50 px-4 text-sm">
                      <StatusIcon status={status.value} />
                      <span className="font-medium">{status.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {groupIssues.length}
                      </span>
                    </div>
                    {groupIssues.map((issue) => (
                      <IssueRow
                        key={issue._id}
                        issue={issue}
                        teamKey={issue.teamKey}
                      />
                    ))}
                  </section>
                ))
              )}
            </section>

            {created.length > 0 ? (
              <section>
                <button
                  onClick={() => setCreatedOverride(!createdExpanded)}
                  className="flex h-9 w-full items-center gap-2 border-b bg-muted/30 px-4 text-left"
                >
                  {createdExpanded ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Created by me
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {created.length}
                  </span>
                </button>
                {createdExpanded
                  ? created.map((issue) => (
                      <IssueRow
                        key={issue._id}
                        issue={issue}
                        teamKey={issue.teamKey}
                      />
                    ))
                  : null}
              </section>
            ) : null}
          </>
        )}
      </ScrollArea>
    </>
  );
}
