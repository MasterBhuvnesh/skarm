import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Doc, Id } from "../_generated/dataModel";
import {
  MutationCtx,
  QueryCtx,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { logActivity } from "../lib/activity";
import { getAuthContext } from "../lib/auth";
import { assertCanCreateIssue, hasAiAccess } from "../lib/limits";
import { getOrgIssue } from "../issues";
import {
  issuePriorityValidator,
  issueStatusValidator,
  planValidator,
} from "../schema";

/**
 * Internal data layer for the AI agent (Track D).
 *
 * Every function takes an explicit, server-supplied `orgId` (resolved from the
 * authenticated context by the public entry points - NEVER from model output)
 * and re-verifies that every loaded document belongs to that org.
 */

// ── Shared shapes ──────────────────────────────────────────────────────────

export const issueSummaryValidator = v.object({
  issueId: v.id("issues"),
  identifier: v.string(),
  title: v.string(),
  status: issueStatusValidator,
  priority: issuePriorityValidator,
  assigneeName: v.union(v.string(), v.null()),
});

type IssueSummary = {
  issueId: Id<"issues">;
  identifier: string;
  title: string;
  status: Doc<"issues">["status"];
  priority: Doc<"issues">["priority"];
  assigneeName: string | null;
};

async function summarizeIssue(
  ctx: QueryCtx | MutationCtx,
  issue: Doc<"issues">,
  teamKeys: Map<Id<"teams">, string>
): Promise<IssueSummary> {
  let key = teamKeys.get(issue.teamId);
  if (key === undefined) {
    const team = await ctx.db.get(issue.teamId);
    key = team?.key ?? "?";
    teamKeys.set(issue.teamId, key);
  }
  let assigneeName: string | null = null;
  if (issue.assigneeId) {
    const assignee = await ctx.db.get(issue.assigneeId);
    assigneeName = assignee?.name ?? null;
  }
  return {
    issueId: issue._id,
    identifier: `${key}-${issue.number}`,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    assigneeName,
  };
}

async function getOrgTeamByKey(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  teamKey: string
): Promise<Doc<"teams">> {
  const team = await ctx.db
    .query("teams")
    .withIndex("by_org_and_key", (q) =>
      q.eq("orgId", orgId).eq("key", teamKey.toUpperCase().trim())
    )
    .unique();
  if (!team) {
    throw new Error(
      `No team with key "${teamKey}" in this workspace. Use the listTeams tool to see available teams.`
    );
  }
  return team;
}

async function resolveMemberByEmail(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
  email: string
): Promise<Doc<"users">> {
  const members = await ctx.db
    .query("members")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .collect();
  for (const member of members) {
    const user = await ctx.db.get(member.userId);
    if (user && user.email.toLowerCase() === email.toLowerCase().trim()) {
      return user;
    }
  }
  throw new Error(
    `No workspace member with email "${email}". Use the listMembers tool to see members.`
  );
}

function issueText(issue: { title: string; description?: string }): string {
  return issue.description
    ? `${issue.title}\n\n${issue.description}`
    : issue.title;
}

// ── Authorization ──────────────────────────────────────────────────────────

/**
 * Resolve + gate the caller for AI actions. Uses the JWT-backed auth context
 * (never client input) and enforces the plan gate server-side.
 */
export const authorizeAi = internalQuery({
  args: {},
  returns: v.object({
    orgId: v.id("organizations"),
    userId: v.id("users"),
    plan: planValidator,
    orgName: v.string(),
    userName: v.string(),
  }),
  handler: async (ctx) => {
    const { user, org } = await getAuthContext(ctx);
    if (!hasAiAccess(org)) {
      throw new Error(
        "The AI agent requires a Pro or Enterprise plan. Upgrade to unlock it."
      );
    }
    return {
      orgId: org._id,
      userId: user._id,
      plan: org.plan,
      orgName: org.name,
      userName: user.name,
    };
  },
});

/**
 * Context for scheduled actions (no auth identity propagates through the
 * scheduler). Only callable internally with ids our own mutations produced.
 */
export const actorContext = internalQuery({
  args: { orgId: v.id("organizations"), userId: v.id("users") },
  returns: v.object({
    orgName: v.string(),
    userName: v.string(),
    plan: planValidator,
  }),
  handler: async (ctx, args) => {
    const org = await ctx.db.get(args.orgId);
    const user = await ctx.db.get(args.userId);
    if (!org || !user) {
      throw new Error("Organization or user not found");
    }
    return { orgName: org.name, userName: user.name, plan: org.plan };
  },
});

// ── Workspace lookups (read-only tools) ────────────────────────────────────

export const listTeamsForOrg = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.array(
    v.object({
      teamId: v.id("teams"),
      name: v.string(),
      key: v.string(),
      issueCount: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const teams = await ctx.db
      .query("teams")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return teams.map((team) => ({
      teamId: team._id,
      name: team.name,
      key: team.key,
      issueCount: team.nextIssueNumber - 1,
    }));
  },
});

export const listMembersForOrg = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.array(
    v.object({
      name: v.string(),
      email: v.string(),
      role: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const result = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (user) {
        result.push({ name: user.name, email: user.email, role: member.role });
      }
    }
    return result;
  },
});

export const listProjectStatus = internalQuery({
  args: { orgId: v.id("organizations") },
  returns: v.array(
    v.object({
      name: v.string(),
      status: v.string(),
      leadName: v.union(v.string(), v.null()),
      targetDate: v.union(v.string(), v.null()),
      totalIssues: v.number(),
      doneIssues: v.number(),
      inProgressIssues: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("projects")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const result = [];
    for (const project of projects) {
      const issues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", project._id))
        .collect();
      const orgIssues = issues.filter((issue) => issue.orgId === args.orgId);
      let leadName: string | null = null;
      if (project.leadId) {
        const lead = await ctx.db.get(project.leadId);
        leadName = lead?.name ?? null;
      }
      result.push({
        name: project.name,
        status: project.status,
        leadName,
        targetDate: project.targetDate
          ? new Date(project.targetDate).toISOString().slice(0, 10)
          : null,
        totalIssues: orgIssues.length,
        doneIssues: orgIssues.filter((issue) => issue.status === "done").length,
        inProgressIssues: orgIssues.filter(
          (issue) => issue.status === "in_progress"
        ).length,
      });
    }
    return result;
  },
});

export const searchIssues = internalQuery({
  args: {
    orgId: v.id("organizations"),
    query: v.string(),
    teamKey: v.optional(v.string()),
  },
  returns: v.array(issueSummaryValidator),
  handler: async (ctx, args) => {
    let teamId: Id<"teams"> | undefined;
    if (args.teamKey) {
      teamId = (await getOrgTeamByKey(ctx, args.orgId, args.teamKey))._id;
    }
    const matches = await ctx.db
      .query("issues")
      .withSearchIndex("search_title", (q) => {
        const base = q.search("title", args.query).eq("orgId", args.orgId);
        return teamId ? base.eq("teamId", teamId) : base;
      })
      .take(12);
    const teamKeys = new Map<Id<"teams">, string>();
    const summaries = [];
    for (const issue of matches) {
      summaries.push(await summarizeIssue(ctx, issue, teamKeys));
    }
    return summaries;
  },
});

export const issueSummariesByIds = internalQuery({
  args: {
    orgId: v.id("organizations"),
    issueIds: v.array(v.id("issues")),
  },
  returns: v.array(issueSummaryValidator),
  handler: async (ctx, args) => {
    const teamKeys = new Map<Id<"teams">, string>();
    const summaries = [];
    for (const issueId of args.issueIds) {
      const issue = await ctx.db.get(issueId);
      // Silently skip anything outside the caller's org (defense in depth -
      // vector search is already filtered by orgId).
      if (!issue || issue.orgId !== args.orgId) {
        continue;
      }
      summaries.push(await summarizeIssue(ctx, issue, teamKeys));
    }
    return summaries;
  },
});

// ── Issue writes (agent tools) ─────────────────────────────────────────────

export const createIssueForAgent = internalMutation({
  args: {
    orgId: v.id("organizations"),
    actorUserId: v.id("users"),
    teamKey: v.string(),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    priority: v.optional(issuePriorityValidator),
    assigneeEmail: v.optional(v.string()),
  },
  returns: v.object({
    issueId: v.id("issues"),
    identifier: v.string(),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ issueId: Id<"issues">; identifier: string }> => {
    const org = await ctx.db.get(args.orgId);
    if (!org) {
      throw new Error("Organization not found");
    }
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", args.orgId).eq("userId", args.actorUserId)
      )
      .unique();
    if (!membership) {
      throw new Error("Not a member of this organization");
    }
    const team = await getOrgTeamByKey(ctx, args.orgId, args.teamKey);
    await assertCanCreateIssue(ctx, org);

    const assignee = args.assigneeEmail
      ? await resolveMemberByEmail(ctx, args.orgId, args.assigneeEmail)
      : undefined;

    // Claim the next per-team issue number (mirrors issues.create).
    const number = team.nextIssueNumber;
    await ctx.db.patch(team._id, { nextIssueNumber: number + 1 });

    const newest = await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .order("desc")
      .first();
    const sortOrder = (newest?.sortOrder ?? 0) + 1000;

    const issueId = await ctx.db.insert("issues", {
      orgId: args.orgId,
      teamId: team._id,
      number,
      title: args.title.trim(),
      description: args.description,
      status: args.status ?? "todo",
      priority: args.priority ?? "none",
      assigneeId: assignee?._id,
      creatorId: args.actorUserId,
      sortOrder,
    });

    await logActivity(ctx, {
      orgId: args.orgId,
      issueId,
      actorId: args.actorUserId,
      type: "created",
    });

    // Fill the semantic-search embedding asynchronously.
    await ctx.scheduler.runAfter(0, internal.agent.embeddings.embedIssue, {
      issueId,
    });

    return { issueId, identifier: `${team.key}-${number}` };
  },
});

export const updateIssueForAgent = internalMutation({
  args: {
    orgId: v.id("organizations"),
    actorUserId: v.id("users"),
    teamKey: v.string(),
    number: v.number(),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    priority: v.optional(issuePriorityValidator),
    /** Email of the member to assign, or null to unassign. */
    assigneeEmail: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.object({
    identifier: v.string(),
    changedFields: v.array(v.string()),
  }),
  handler: async (
    ctx,
    args
  ): Promise<{ identifier: string; changedFields: string[] }> => {
    const team = await getOrgTeamByKey(ctx, args.orgId, args.teamKey);
    const found = await ctx.db
      .query("issues")
      .withIndex("by_team_and_number", (q) =>
        q.eq("teamId", team._id).eq("number", args.number)
      )
      .unique();
    if (!found) {
      throw new Error(`Issue ${team.key}-${args.number} not found`);
    }
    const issue = await getOrgIssue(ctx, args.orgId, found._id);

    const updates: Partial<Doc<"issues">> = {};
    const changes: { field: string; oldValue?: string; newValue?: string }[] =
      [];

    if (args.title !== undefined && args.title.trim() !== issue.title) {
      updates.title = args.title.trim();
      changes.push({
        field: "title",
        oldValue: issue.title,
        newValue: args.title.trim(),
      });
    }
    if (
      args.description !== undefined &&
      args.description !== issue.description
    ) {
      updates.description = args.description;
      changes.push({ field: "description" });
    }
    if (args.status !== undefined && args.status !== issue.status) {
      updates.status = args.status;
      changes.push({
        field: "status",
        oldValue: issue.status,
        newValue: args.status,
      });
    }
    if (args.priority !== undefined && args.priority !== issue.priority) {
      updates.priority = args.priority;
      changes.push({
        field: "priority",
        oldValue: issue.priority,
        newValue: args.priority,
      });
    }
    if (args.assigneeEmail !== undefined) {
      const assignee =
        args.assigneeEmail === null
          ? undefined
          : await resolveMemberByEmail(ctx, args.orgId, args.assigneeEmail);
      if (assignee?._id !== issue.assigneeId) {
        updates.assigneeId = assignee?._id;
        changes.push({
          field: "assignee",
          oldValue: issue.assigneeId,
          newValue: assignee?._id,
        });
      }
    }

    if (changes.length === 0) {
      return { identifier: `${team.key}-${issue.number}`, changedFields: [] };
    }

    await ctx.db.patch(issue._id, updates);

    for (const change of changes) {
      await logActivity(ctx, {
        orgId: args.orgId,
        issueId: issue._id,
        actorId: args.actorUserId,
        type: `${change.field}_changed`,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }

    if (updates.title !== undefined || updates.description !== undefined) {
      await ctx.scheduler.runAfter(0, internal.agent.embeddings.embedIssue, {
        issueId: issue._id,
      });
    }

    return {
      identifier: `${team.key}-${issue.number}`,
      changedFields: changes.map((change) => change.field),
    };
  },
});

// ── Embeddings support ─────────────────────────────────────────────────────

export const issueEmbeddingSource = internalQuery({
  args: { issueId: v.id("issues") },
  returns: v.union(
    v.object({ orgId: v.id("organizations"), text: v.string() }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      return null;
    }
    return { orgId: issue.orgId, text: issueText(issue) };
  },
});

export const issuesMissingEmbeddings = internalQuery({
  args: { orgId: v.id("organizations"), limit: v.number() },
  returns: v.array(
    v.object({ issueId: v.id("issues"), text: v.string() })
  ),
  handler: async (ctx, args) => {
    // The frozen schema has no "missing embedding" index; this org-scoped
    // scan stops early thanks to take().
    const missing = await ctx.db
      .query("issues")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      // eslint-disable-next-line @convex-dev/no-filter-in-query
      .filter((q) => q.eq(q.field("embedding"), undefined))
      .take(args.limit);
    return missing.map((issue) => ({
      issueId: issue._id,
      text: issueText(issue),
    }));
  },
});

export const saveIssueEmbeddings = internalMutation({
  args: {
    orgId: v.id("organizations"),
    items: v.array(
      v.object({
        issueId: v.id("issues"),
        embedding: v.array(v.float64()),
      })
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    for (const item of args.items) {
      const issue = await ctx.db.get(item.issueId);
      // Embeddings are internal search metadata, not a user-visible edit, so
      // this intentionally does not write to the activity feed.
      if (issue && issue.orgId === args.orgId) {
        await ctx.db.patch(item.issueId, { embedding: item.embedding });
      }
    }
    return null;
  },
});

// ── Triage assist ──────────────────────────────────────────────────────────

export const issueTriageContext = internalQuery({
  args: { orgId: v.id("organizations"), issueId: v.id("issues") },
  returns: v.object({
    identifier: v.string(),
    title: v.string(),
    description: v.union(v.string(), v.null()),
    status: issueStatusValidator,
    priority: issuePriorityValidator,
    teamName: v.string(),
    orgLabels: v.array(
      v.object({
        labelId: v.id("labels"),
        name: v.string(),
        color: v.string(),
      })
    ),
    appliedLabelIds: v.array(v.id("labels")),
    hasEmbedding: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, args.orgId, args.issueId);
    const team = await ctx.db.get(issue.teamId);
    if (!team || team.orgId !== args.orgId) {
      throw new Error("Team not found");
    }
    const orgLabels = await ctx.db
      .query("labels")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const links = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();
    return {
      identifier: `${team.key}-${issue.number}`,
      title: issue.title,
      description: issue.description ?? null,
      status: issue.status,
      priority: issue.priority,
      teamName: team.name,
      orgLabels: orgLabels.map((label) => ({
        labelId: label._id,
        name: label.name,
        color: label.color,
      })),
      appliedLabelIds: links.map((link) => link.labelId),
      hasEmbedding: issue.embedding !== undefined,
    };
  },
});

// ── Reports ────────────────────────────────────────────────────────────────

export const cycleSummaryForTeam = internalQuery({
  args: { orgId: v.id("organizations"), teamKey: v.string() },
  returns: v.object({
    teamName: v.string(),
    teamKey: v.string(),
    cycle: v.union(
      v.object({
        name: v.string(),
        startDate: v.string(),
        endDate: v.string(),
        daysRemaining: v.number(),
      }),
      v.null()
    ),
    counts: v.object({
      total: v.number(),
      done: v.number(),
      inProgress: v.number(),
      inReview: v.number(),
      todo: v.number(),
      backlog: v.number(),
      canceled: v.number(),
    }),
    issues: v.array(issueSummaryValidator),
  }),
  handler: async (ctx, args) => {
    const team = await getOrgTeamByKey(ctx, args.orgId, args.teamKey);
    const cycles = await ctx.db
      .query("cycles")
      .withIndex("by_team", (q) => q.eq("teamId", team._id))
      .collect();
    const now = Date.now();
    const current =
      cycles.find((c) => c.startDate <= now && now <= c.endDate) ??
      cycles
        .filter((c) => c.startDate <= now)
        .sort((a, b) => b.startDate - a.startDate)[0] ??
      null;

    const empty = {
      total: 0,
      done: 0,
      inProgress: 0,
      inReview: 0,
      todo: 0,
      backlog: 0,
      canceled: 0,
    };
    if (!current) {
      return {
        teamName: team.name,
        teamKey: team.key,
        cycle: null,
        counts: empty,
        issues: [],
      };
    }

    const cycleIssues = await ctx.db
      .query("issues")
      .withIndex("by_cycle", (q) => q.eq("cycleId", current._id))
      .collect();
    const orgIssues = cycleIssues.filter(
      (issue) => issue.orgId === args.orgId
    );

    const counts = { ...empty, total: orgIssues.length };
    for (const issue of orgIssues) {
      if (issue.status === "done") counts.done += 1;
      else if (issue.status === "in_progress") counts.inProgress += 1;
      else if (issue.status === "in_review") counts.inReview += 1;
      else if (issue.status === "todo") counts.todo += 1;
      else if (issue.status === "backlog") counts.backlog += 1;
      else if (issue.status === "canceled") counts.canceled += 1;
    }

    const teamKeys = new Map<Id<"teams">, string>([[team._id, team.key]]);
    const issues = [];
    for (const issue of orgIssues.slice(0, 30)) {
      issues.push(await summarizeIssue(ctx, issue, teamKeys));
    }

    return {
      teamName: team.name,
      teamKey: team.key,
      cycle: {
        name: current.name ?? `Cycle ${current.number}`,
        startDate: new Date(current.startDate).toISOString().slice(0, 10),
        endDate: new Date(current.endDate).toISOString().slice(0, 10),
        daysRemaining: Math.max(
          0,
          Math.ceil((current.endDate - now) / (24 * 60 * 60 * 1000))
        ),
      },
      counts,
      issues,
    };
  },
});

export const standupForOrg = internalQuery({
  args: {
    orgId: v.id("organizations"),
    teamKey: v.optional(v.string()),
    sinceHours: v.number(),
  },
  returns: v.object({
    sinceHours: v.number(),
    entries: v.array(
      v.object({
        memberName: v.string(),
        inProgress: v.array(issueSummaryValidator),
        completed: v.array(issueSummaryValidator),
        created: v.array(issueSummaryValidator),
      })
    ),
  }),
  handler: async (ctx, args) => {
    const teamId = args.teamKey
      ? (await getOrgTeamByKey(ctx, args.orgId, args.teamKey))._id
      : undefined;
    const since = Date.now() - args.sinceHours * 60 * 60 * 1000;

    const inTeam = (issue: Doc<"issues">) =>
      teamId === undefined || issue.teamId === teamId;

    // Recent activity → completed / created issue ids per actor.
    const recentActivity = (
      await ctx.db
        .query("activity")
        .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
        .order("desc")
        .take(500)
    ).filter((entry) => entry._creationTime >= since);

    const completedBy = new Map<Id<"users">, Set<Id<"issues">>>();
    const createdBy = new Map<Id<"users">, Set<Id<"issues">>>();
    for (const entry of recentActivity) {
      if (!entry.actorId) {
        continue; // automated events (GitHub) don't count toward member stats
      }
      if (entry.type === "created") {
        const set = createdBy.get(entry.actorId) ?? new Set();
        set.add(entry.issueId);
        createdBy.set(entry.actorId, set);
      } else if (entry.type === "status_changed" && entry.newValue === "done") {
        const set = completedBy.get(entry.actorId) ?? new Set();
        set.add(entry.issueId);
        completedBy.set(entry.actorId, set);
      }
    }

    const members = await ctx.db
      .query("members")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    const teamKeys = new Map<Id<"teams">, string>();
    const summarizeIds = async (ids: Set<Id<"issues">> | undefined) => {
      const result = [];
      for (const issueId of ids ?? []) {
        const issue = await ctx.db.get(issueId);
        if (issue && issue.orgId === args.orgId && inTeam(issue)) {
          result.push(await summarizeIssue(ctx, issue, teamKeys));
        }
        if (result.length >= 10) break;
      }
      return result;
    };

    const entries = [];
    for (const member of members) {
      const user = await ctx.db.get(member.userId);
      if (!user) continue;

      const assigned = await ctx.db
        .query("issues")
        .withIndex("by_assignee", (q) =>
          q.eq("orgId", args.orgId).eq("assigneeId", user._id)
        )
        .collect();
      const wip = assigned.filter(
        (issue) =>
          inTeam(issue) &&
          (issue.status === "in_progress" || issue.status === "in_review")
      );
      const inProgress = [];
      for (const issue of wip.slice(0, 10)) {
        inProgress.push(await summarizeIssue(ctx, issue, teamKeys));
      }

      const completed = await summarizeIds(completedBy.get(user._id));
      const created = await summarizeIds(createdBy.get(user._id));

      if (inProgress.length || completed.length || created.length) {
        entries.push({
          memberName: user.name,
          inProgress,
          completed,
          created,
        });
      }
    }

    return { sinceHours: args.sinceHours, entries };
  },
});
