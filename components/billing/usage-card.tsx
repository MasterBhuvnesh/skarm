"use client";

import { useQueries, useQuery } from "convex/react";
import { TriangleAlert } from "lucide-react";
import { useMemo } from "react";
import { api } from "@/convex/_generated/api";
import { Doc } from "@/convex/_generated/dataModel";
import { Skeleton } from "@/components/ui/skeleton";
import { FREE_PLAN_DISPLAY_LIMITS, planForOrg } from "@/lib/plans";
import { cn } from "@/lib/utils";

function UsageRow({
  label,
  count,
  cap,
}: {
  label: string;
  /** null while loading */
  count: number | null;
  /** null means unlimited */
  cap: number | null;
}) {
  const ratio = cap !== null && count !== null ? count / cap : 0;
  const atLimit = cap !== null && count !== null && count >= cap;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {count === null ? (
          <Skeleton className="h-3 w-12" />
        ) : (
          <span
            className={cn(
              "font-medium tabular-nums",
              atLimit && "text-destructive"
            )}
          >
            {count}
            <span className="font-normal text-muted-foreground">
              {" "}
              / {cap === null ? "Unlimited" : cap}
            </span>
          </span>
        )}
      </div>
      {cap !== null && (
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full bg-primary transition-[width]",
              ratio >= 0.8 && "bg-amber-500",
              ratio >= 1 && "bg-destructive"
            )}
            style={{ width: `${Math.min(100, Math.round(ratio * 100))}%` }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Live usage against the free-tier caps enforced by convex/lib/limits.ts.
 * Paid plans show their seat allowance and unlimited usage.
 */
export function UsageCard({ org }: { org: Doc<"organizations"> }) {
  const plan = planForOrg(org.plan);
  const isFree = org.plan === "free";
  // On a seat-based plan the Seats card above owns members: it reports them
  // against seats actually bought, which is the number Clerk enforces, rather
  // than against the plan ceiling. Showing a second, looser members bar here
  // would contradict it.
  const seatsShownAbove =
    plan.perSeatPrice !== undefined && plan.maxSeats !== null;

  const members = useQuery(api.organizations.listMembers);
  const teams = useQuery(api.teams.list, isFree ? {} : "skip");

  // Free orgs are capped at 100 issues, so summing the per-team lists is
  // cheap and avoids needing a dedicated Convex module for this track.
  const issueQueries = useMemo(() => {
    if (!isFree || !teams) {
      return {};
    }
    return Object.fromEntries(
      teams.map((team) => [
        team._id,
        { query: api.issues.listByTeam, args: { teamId: team._id } },
      ])
    );
  }, [isFree, teams]);
  const issueResults = useQueries(issueQueries);

  let issueCount: number | null = 0;
  if (!teams) {
    issueCount = null;
  } else {
    for (const team of teams) {
      const result: unknown = issueResults[team._id];
      if (Array.isArray(result)) {
        issueCount += result.length;
      } else {
        issueCount = null;
        break;
      }
    }
  }

  const memberCount = members ? members.length : null;
  const seatLimitReached =
    plan.maxSeats !== null &&
    memberCount !== null &&
    memberCount >= plan.maxSeats;
  const issueLimitReached =
    isFree &&
    issueCount !== null &&
    issueCount >= FREE_PLAN_DISPLAY_LIMITS.issues;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-medium">Usage</h2>
        <p className="text-xs text-muted-foreground">
          {isFree
            ? "What this workspace has used of the Free plan limits."
            : `Usage on the ${plan.name} plan.`}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
        {!seatsShownAbove && (
          <UsageRow label="Members" count={memberCount} cap={plan.maxSeats} />
        )}
        {isFree && (
          <UsageRow
            label="Issues"
            count={issueCount}
            cap={FREE_PLAN_DISPLAY_LIMITS.issues}
          />
        )}
        {!isFree && (
          <p className="text-[11px] text-muted-foreground">
            Issues and projects are unlimited on {plan.name}.
          </p>
        )}
        {isFree && (
          <p className="text-[11px] text-muted-foreground">
            Free workspaces also include up to{" "}
            {FREE_PLAN_DISPLAY_LIMITS.projects} projects. Pro removes every
            limit.
          </p>
        )}

        {(seatLimitReached || issueLimitReached) && isFree && (
          <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600 dark:text-amber-400">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {issueLimitReached && seatLimitReached
                ? "You've reached the Free plan issue and seat limits."
                : issueLimitReached
                  ? "You've reached the Free plan issue limit."
                  : "You've reached the Free plan seat limit."}{" "}
              Upgrade below to keep your team moving.
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
