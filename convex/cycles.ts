import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { issueShape } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { progressShape } from "./projects";

export const cycleShape = {
  _id: v.id("cycles"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  teamId: v.id("teams"),
  number: v.number(),
  name: v.optional(v.string()),
  startDate: v.number(),
  endDate: v.number(),
};

/** Verify a cycle belongs to the caller's org before any read/write. */
async function getOrgCycle(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  cycleId: Id<"cycles">
): Promise<Doc<"cycles">> {
  const cycle = await ctx.db.get(cycleId);
  if (!cycle || cycle.orgId !== orgId) {
    throw new Error("Cycle not found");
  }
  return cycle;
}

/** Verify a team belongs to the caller's org. */
async function getOrgTeam(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  teamId: Id<"teams">
): Promise<Doc<"teams">> {
  const team = await ctx.db.get(teamId);
  if (!team || team.orgId !== orgId) {
    throw new Error("Team not found");
  }
  return team;
}

async function countProgress(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  cycleId: Id<"cycles">
) {
  const issues = await ctx.db
    .query("issues")
    .withIndex("by_cycle", (q) => q.eq("cycleId", cycleId))
    .collect();
  const progress = {
    total: 0,
    backlog: 0,
    todo: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
    canceled: 0,
  };
  for (const issue of issues) {
    if (issue.orgId !== orgId) {
      continue;
    }
    progress.total += 1;
    progress[issue.status] += 1;
  }
  return progress;
}

/** Cycles for one team, newest first (lightweight - for pickers). */
export const listByTeam = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(v.object(cycleShape)),
  handler: async (ctx, args) => {
    await getOrgTeam(ctx, ctx.org._id, args.teamId);
    return await ctx.db
      .query("cycles")
      .withIndex("by_team_and_number", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .collect();
  },
});

/**
 * Every cycle in the org with team info and per-status issue counts -
 * powers the cycles index page.
 */
export const listWithProgress = orgQuery({
  args: {},
  returns: v.array(
    v.object({
      ...cycleShape,
      teamName: v.string(),
      teamKey: v.string(),
      progress: progressShape,
    })
  ),
  handler: async (ctx) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
    const result = [];
    for (const team of teams) {
      const cycles = await ctx.db
        .query("cycles")
        .withIndex("by_team_and_number", (q) => q.eq("teamId", team._id))
        .order("desc")
        .collect();
      for (const cycle of cycles) {
        result.push({
          ...cycle,
          teamName: team.name,
          teamKey: team.key,
          progress: await countProgress(ctx, ctx.org._id, cycle._id),
        });
      }
    }
    return result;
  },
});

export const get = orgQuery({
  args: { cycleId: v.id("cycles") },
  returns: v.union(v.object(cycleShape), v.null()),
  handler: async (ctx, args) => {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.orgId !== ctx.org._id) {
      return null;
    }
    return cycle;
  },
});

/**
 * The team's current cycle - the active cycle (startDate ≤ now ≤ endDate)
 * with the most recent start, or null when no cycle is running.
 */
export const currentForTeam = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.union(v.object(cycleShape), v.null()),
  handler: async (ctx, args) => {
    await getOrgTeam(ctx, ctx.org._id, args.teamId);
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .collect();
    const now = Date.now();
    const active = cycles
      .filter((cycle) => cycle.startDate <= now && now <= cycle.endDate)
      .sort((a, b) => b.startDate - a.startDate);
    return active[0] ?? null;
  },
});

/** All issues scheduled into a cycle (detail page computes progress from this). */
export const listIssues = orgQuery({
  args: { cycleId: v.id("cycles") },
  returns: v.array(v.object(issueShape)),
  handler: async (ctx, args) => {
    await getOrgCycle(ctx, ctx.org._id, args.cycleId);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_cycle", (q) => q.eq("cycleId", args.cycleId))
      .collect();
    return issues.filter((issue) => issue.orgId === ctx.org._id);
  },
});

/**
 * Team issues NOT already in the given cycle - candidates for the
 * "add issues to cycle" picker. Assignment itself goes through
 * `issues.update` (cycleId arg).
 */
export const candidateIssues = orgQuery({
  args: { cycleId: v.id("cycles") },
  returns: v.array(v.object(issueShape)),
  handler: async (ctx, args) => {
    const cycle = await getOrgCycle(ctx, ctx.org._id, args.cycleId);
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", cycle.teamId))
      .order("desc")
      .take(500);
    return issues
      .filter(
        (issue) => issue.orgId === ctx.org._id && issue.cycleId !== args.cycleId
      )
      .slice(0, 200);
  },
});

/** Create a cycle for a team. Cycles are auto-numbered per team (Cycle 1, 2, …). */
export const create = orgMutation({
  args: {
    teamId: v.id("teams"),
    name: v.optional(v.string()),
    startDate: v.number(),
    endDate: v.number(),
  },
  returns: v.id("cycles"),
  handler: async (ctx, args) => {
    await getOrgTeam(ctx, ctx.org._id, args.teamId);
    if (args.endDate <= args.startDate) {
      throw new Error("Cycle end date must be after its start date");
    }

    // Claim the next per-team cycle number.
    const latest = await ctx.db
      .query("cycles")
      .withIndex("by_team_and_number", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .first();
    const number = (latest?.number ?? 0) + 1;

    const name = args.name?.trim();
    return await ctx.db.insert("cycles", {
      orgId: ctx.org._id,
      teamId: args.teamId,
      number,
      name: name ? name : undefined,
      startDate: args.startDate,
      endDate: args.endDate,
    });
  },
});

export const update = orgMutation({
  args: {
    cycleId: v.id("cycles"),
    name: v.optional(v.union(v.string(), v.null())),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await getOrgCycle(ctx, ctx.org._id, args.cycleId);

    const startDate = args.startDate ?? cycle.startDate;
    const endDate = args.endDate ?? cycle.endDate;
    if (endDate <= startDate) {
      throw new Error("Cycle end date must be after its start date");
    }

    const updates: Partial<Doc<"cycles">> = {};
    if (args.name !== undefined) {
      const name = args.name?.trim();
      updates.name = name ? name : undefined;
    }
    if (args.startDate !== undefined) {
      updates.startDate = args.startDate;
    }
    if (args.endDate !== undefined) {
      updates.endDate = args.endDate;
    }

    await ctx.db.patch(cycle._id, updates);
    return null;
  },
});

/** Delete a cycle and unschedule its issues (issues themselves are kept). */
export const remove = orgMutation({
  args: { cycleId: v.id("cycles") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const cycle = await getOrgCycle(ctx, ctx.org._id, args.cycleId);

    const issues = await ctx.db
      .query("issues")
      .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
      .collect();
    for (const issue of issues) {
      if (issue.orgId !== ctx.org._id) {
        continue;
      }
      await ctx.db.patch(issue._id, { cycleId: undefined });
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId: issue._id,
        actorId: ctx.user._id,
        type: "cycle_changed",
        field: "cycle",
        oldValue: cycle.name ?? `Cycle ${cycle.number}`,
        newValue: undefined,
      });
    }

    await ctx.db.delete(cycle._id);
    return null;
  },
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Issues without an estimate count as 1 point everywhere below. */
function issuePoints(issue: { estimate?: number }): number {
  return issue.estimate ?? 1;
}

/**
 * Burndown, velocity, and scope-change analytics for one cycle.
 *
 * Entry/completion times are reconstructed from the activity log
 * (`cycle_changed` values are cycle ids, logged by issues.update; data
 * predating that logging falls back to issue creation time), so charts are
 * best-effort for cycles planned before analytics shipped.
 */
export const analytics = orgQuery({
  args: { cycleId: v.id("cycles") },
  returns: v.object({
    days: v.array(v.object({ date: v.number(), remaining: v.number() })),
    startScope: v.number(),
    addedPoints: v.number(),
    removedPoints: v.number(),
    completedPoints: v.number(),
    totalPoints: v.number(),
    velocity: v.array(
      v.object({
        label: v.string(),
        points: v.number(),
        current: v.boolean(),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const cycle = await getOrgCycle(ctx, ctx.org._id, args.cycleId);
    const now = Date.now();

    const inCycle = (
      await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", cycle._id))
        .collect()
    ).filter((issue) => issue.orgId === ctx.org._id);

    // Reconstruct when each issue entered the cycle and when it finished.
    type Lifecycle = { entered: number; completed: number | null; pts: number };
    const lifecycles: Lifecycle[] = [];
    let completedPoints = 0;
    for (const issue of inCycle) {
      const acts = await ctx.db
        .query("activity")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();
      const entries = acts.filter(
        (a) => a.field === "cycle" && a.newValue === cycle._id
      );
      const entered =
        entries.length > 0
          ? Math.max(...entries.map((a) => a._creationTime))
          : issue._creationTime;
      let completed: number | null = null;
      if (issue.status === "done" || issue.status === "canceled") {
        const transitions = acts.filter(
          (a) => a.type === "status_changed" && a.newValue === issue.status
        );
        completed =
          transitions.length > 0
            ? Math.max(...transitions.map((a) => a._creationTime))
            : issue._creationTime;
        if (issue.status === "done") {
          completedPoints += issuePoints(issue);
        }
      }
      lifecycles.push({ entered, completed, pts: issuePoints(issue) });
    }

    // Scope removed: issues whose cycle_changed left this cycle and that
    // never came back. ponytail: org-wide activity scan capped at the 2000
    // newest entries - add an activity-by-field index if orgs outgrow this.
    const orgActs = await ctx.db
      .query("activity")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .order("desc")
      .take(2000);
    const stillIn = new Set<string>(inCycle.map((issue) => issue._id));
    const removedAt = new Map<string, number>();
    for (const act of orgActs) {
      if (
        act.field === "cycle" &&
        act.oldValue === cycle._id &&
        !stillIn.has(act.issueId) &&
        !removedAt.has(act.issueId)
      ) {
        removedAt.set(act.issueId, act._creationTime);
      }
    }
    let removedPoints = 0;
    const removals: { time: number; pts: number }[] = [];
    for (const [issueId, time] of removedAt) {
      const issue = await ctx.db.get(issueId as Id<"issues">);
      if (!issue || issue.orgId !== ctx.org._id) {
        continue;
      }
      removedPoints += issuePoints(issue);
      removals.push({ time, pts: issuePoints(issue) });
    }

    /** Open scope at time t: entered, not yet completed, not yet removed. */
    const remainingAt = (t: number) => {
      let remaining = 0;
      for (const item of lifecycles) {
        if (
          item.entered <= t &&
          !(item.completed !== null && item.completed <= t)
        ) {
          remaining += item.pts;
        }
      }
      for (const removal of removals) {
        if (removal.time > t) {
          remaining += removal.pts;
        }
      }
      return remaining;
    };

    const seriesEnd = Math.min(now, cycle.endDate);
    const days: { date: number; remaining: number }[] = [];
    for (let t = cycle.startDate; t <= seriesEnd; t += DAY_MS) {
      days.push({ date: t, remaining: remainingAt(t) });
    }
    if (days.length === 0 || days[days.length - 1].date < seriesEnd) {
      days.push({ date: seriesEnd, remaining: remainingAt(seriesEnd) });
    }

    const totalPoints = lifecycles.reduce((sum, item) => sum + item.pts, 0);
    const addedPoints = lifecycles
      .filter((item) => item.entered > cycle.startDate)
      .reduce((sum, item) => sum + item.pts, 0);

    // Velocity: done points across this team's recent cycles.
    const teamCycles = await ctx.db
      .query("cycles")
      .withIndex("by_team", (q) => q.eq("teamId", cycle.teamId))
      .collect();
    const recent = teamCycles
      .filter((c) => c.startDate <= now)
      .sort((a, b) => a.number - b.number)
      .slice(-6);
    const velocity = [];
    for (const c of recent) {
      const cycleIssues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", c._id))
        .collect();
      velocity.push({
        label: `C${c.number}`,
        points: cycleIssues
          .filter(
            (issue) => issue.orgId === ctx.org._id && issue.status === "done"
          )
          .reduce((sum, issue) => sum + issuePoints(issue), 0),
        current: c._id === cycle._id,
      });
    }

    return {
      days,
      startScope: remainingAt(cycle.startDate),
      addedPoints,
      removedPoints,
      completedPoints,
      totalPoints,
      velocity,
    };
  },
});
