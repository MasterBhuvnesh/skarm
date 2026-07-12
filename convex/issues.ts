import { v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { scheduleGithubIssueSync } from "./github/sync";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import {
  autoLinkFigmaUrls,
  scheduleFigmaDevSync,
} from "./lib/figmaLinks";
import { assertCanCreateIssue } from "./lib/limits";
import { createNotification } from "./notifications";
import {
  issuePriorityValidator,
  issueRelationTypeValidator,
  issueStatusValidator,
} from "./schema";

export const issueShape = {
  _id: v.id("issues"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  teamId: v.id("teams"),
  number: v.number(),
  title: v.string(),
  description: v.optional(v.string()),
  status: issueStatusValidator,
  priority: issuePriorityValidator,
  assigneeId: v.optional(v.id("users")),
  creatorId: v.id("users"),
  projectId: v.optional(v.id("projects")),
  cycleId: v.optional(v.id("cycles")),
  parentIssueId: v.optional(v.id("issues")),
  estimate: v.optional(v.number()),
  dueDate: v.optional(v.number()),
  sortOrder: v.number(),
  embedding: v.optional(v.array(v.float64())),
};

/** Verify an issue belongs to the caller's org before any read/write. */
export async function getOrgIssue(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  issueId: Id<"issues">
): Promise<Doc<"issues">> {
  const issue = await ctx.db.get(issueId);
  if (!issue || issue.orgId !== orgId) {
    throw new Error("Issue not found");
  }
  return issue;
}

export const listByTeam = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(v.object(issueShape)),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    return await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(500);
  },
});

export const get = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.union(v.object(issueShape), v.null()),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== ctx.org._id) {
      return null;
    }
    return issue;
  },
});

/** Look up an issue by its display identifier (team key + number, e.g. ENG-42). */
export const getByNumber = orgQuery({
  args: { teamId: v.id("teams"), number: v.number() },
  returns: v.union(v.object(issueShape), v.null()),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      return null;
    }
    return await ctx.db
      .query("issues")
      .withIndex("by_team_and_number", (q) =>
        q.eq("teamId", args.teamId).eq("number", args.number)
      )
      .unique();
  },
});

/**
 * Core issue creation shared by `issues.create` and recurring templates
 * (convex/issueTemplates.ts). Owns numbering, sort order, labels, and the
 * activity log — the only code path that claims issue numbers.
 */
export async function insertIssue(
  ctx: MutationCtx,
  args: {
    org: Doc<"organizations">;
    team: Doc<"teams">;
    creatorId: Id<"users">;
    title: string;
    description?: string;
    status?: Doc<"issues">["status"];
    priority?: Doc<"issues">["priority"];
    assigneeId?: Id<"users">;
    projectId?: Id<"projects">;
    cycleId?: Id<"cycles">;
    parentIssueId?: Id<"issues">;
    estimate?: number;
    dueDate?: number;
    labelIds?: Id<"labels">[];
  }
): Promise<Id<"issues">> {
  const { org, team } = args;
  await assertCanCreateIssue(ctx, org);

  // Resolve labels up front; skip any that were deleted since selection.
  const labels: Doc<"labels">[] = [];
  for (const labelId of args.labelIds ?? []) {
    const label = await ctx.db.get(labelId);
    if (!label) {
      continue;
    }
    if (label.orgId !== org._id) {
      throw new Error("Label not found");
    }
    labels.push(label);
  }

  // Claim the next per-team issue number (ENG-1, ENG-2, ...).
  const number = team.nextIssueNumber;
  await ctx.db.patch(team._id, { nextIssueNumber: number + 1 });

  // New issues sort to the top of their column.
  const newest = await ctx.db
    .query("issues")
    .withIndex("by_team", (q) => q.eq("teamId", team._id))
    .order("desc")
    .first();
  const sortOrder = (newest?.sortOrder ?? 0) + 1000;

  const issueId = await ctx.db.insert("issues", {
    orgId: org._id,
    teamId: team._id,
    number,
    title: args.title.trim(),
    description: args.description,
    status: args.status ?? "todo",
    priority: args.priority ?? "none",
    assigneeId: args.assigneeId,
    creatorId: args.creatorId,
    projectId: args.projectId,
    cycleId: args.cycleId,
    parentIssueId: args.parentIssueId,
    estimate: args.estimate,
    dueDate: args.dueDate,
    sortOrder,
  });

  for (const label of labels) {
    await ctx.db.insert("issueLabels", { issueId, labelId: label._id });
  }

  await logActivity(ctx, {
    orgId: org._id,
    issueId,
    actorId: args.creatorId,
    type: "created",
  });

  return issueId;
}

export const create = orgMutation({
  args: {
    teamId: v.id("teams"),
    title: v.string(),
    description: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    priority: v.optional(issuePriorityValidator),
    assigneeId: v.optional(v.id("users")),
    projectId: v.optional(v.id("projects")),
    cycleId: v.optional(v.id("cycles")),
    parentIssueId: v.optional(v.id("issues")),
    estimate: v.optional(v.number()),
    dueDate: v.optional(v.number()),
    labelIds: v.optional(v.array(v.id("labels"))),
    /** Also create this issue in a connected GitHub repo ("owner/name"). */
    githubRepo: v.optional(v.string()),
    /** Sub-issue titles to create under the new issue (AI drafting). */
    subIssues: v.optional(v.array(v.string())),
    /** Relations to existing issues to create alongside (AI drafting). */
    relations: v.optional(
      v.array(
        v.object({
          issueId: v.id("issues"),
          type: issueRelationTypeValidator,
        })
      )
    ),
  },
  returns: v.id("issues"),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }

    // Validate the GitHub sync request up front so a bad repo never
    // half-creates state; the actual API call runs async after commit.
    if (args.githubRepo) {
      if (!args.projectId) {
        throw new Error("Pick a project to create the issue on GitHub");
      }
      const project = await ctx.db.get(args.projectId);
      if (!project || project.orgId !== ctx.org._id) {
        throw new Error("Project not found");
      }
      if (!(project.githubRepos ?? []).includes(args.githubRepo)) {
        throw new Error(
          "That repository isn't connected to the selected project"
        );
      }
      const integration = await ctx.db
        .query("integrations")
        .withIndex("by_org_and_type", (q) =>
          q.eq("orgId", ctx.org._id).eq("type", "github")
        )
        .unique();
      if (!integration?.enabled || integration.installationId === undefined) {
        throw new Error("GitHub is not connected for this workspace");
      }
    }

    const { githubRepo, subIssues, relations, ...issueArgs } = args;
    const issueId = await insertIssue(ctx, {
      ...issueArgs,
      org: ctx.org,
      team,
      creatorId: ctx.user._id,
    });

    for (const title of subIssues ?? []) {
      if (!title.trim()) {
        continue;
      }
      await insertIssue(ctx, {
        org: ctx.org,
        team,
        creatorId: ctx.user._id,
        title,
        parentIssueId: issueId,
        projectId: args.projectId,
        cycleId: args.cycleId,
      });
    }

    // Relations from drafting. The issue is brand new, so no existing-link
    // dedupe is needed — just normalize blocked_by like issueRelations.create.
    const identifier = `${team.key}-${(await ctx.db.get(issueId))!.number}`;
    const linked = new Set<Id<"issues">>([issueId]);
    for (const relation of relations ?? []) {
      if (linked.has(relation.issueId)) {
        continue;
      }
      linked.add(relation.issueId);
      const related = await getOrgIssue(ctx, ctx.org._id, relation.issueId);
      const relatedTeam = await ctx.db.get(related.teamId);
      const relatedIdentifier = `${relatedTeam?.key ?? "?"}-${related.number}`;

      const inverted = relation.type === "blocked_by";
      await ctx.db.insert("issueRelations", {
        issueId: inverted ? related._id : issueId,
        relatedIssueId: inverted ? issueId : related._id,
        type: inverted ? "blocks" : relation.type,
      });
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId,
        actorId: ctx.user._id,
        type: "relation_added",
        field: relation.type,
        oldValue: undefined,
        newValue: relatedIdentifier,
      });
      const inverse: Record<string, string> = {
        blocks: "blocked_by",
        blocked_by: "blocks",
        related: "related",
        duplicate_of: "duplicated_by",
      };
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId: related._id,
        actorId: ctx.user._id,
        type: "relation_added",
        field: inverse[relation.type],
        newValue: identifier,
      });
    }

    if (githubRepo) {
      await ctx.scheduler.runAfter(0, internal.github.client.pushIssue, {
        issueId,
        repo: githubRepo,
      });
    }

    // Figma URLs pasted into the description attach to the Figma panel.
    await autoLinkFigmaUrls(ctx, {
      orgId: ctx.org._id,
      issueId,
      actorId: ctx.user._id,
      text: args.description,
    });
    return issueId;
  },
});

export const update = orgMutation({
  args: {
    issueId: v.id("issues"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(issueStatusValidator),
    priority: v.optional(issuePriorityValidator),
    assigneeId: v.optional(v.union(v.id("users"), v.null())),
    projectId: v.optional(v.union(v.id("projects"), v.null())),
    cycleId: v.optional(v.union(v.id("cycles"), v.null())),
    estimate: v.optional(v.union(v.number(), v.null())),
    dueDate: v.optional(v.union(v.number(), v.null())),
    sortOrder: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const updates: Partial<Doc<"issues">> = {};
    const changes: { field: string; oldValue?: string; newValue?: string }[] =
      [];

    if (args.title !== undefined && args.title !== issue.title) {
      updates.title = args.title.trim();
      changes.push({ field: "title", oldValue: issue.title, newValue: args.title });
    }
    if (args.description !== undefined) {
      updates.description = args.description;
    }
    if (args.status !== undefined && args.status !== issue.status) {
      updates.status = args.status;
      changes.push({ field: "status", oldValue: issue.status, newValue: args.status });
    }
    if (args.priority !== undefined && args.priority !== issue.priority) {
      updates.priority = args.priority;
      changes.push({
        field: "priority",
        oldValue: issue.priority,
        newValue: args.priority,
      });
    }
    if (args.assigneeId !== undefined) {
      updates.assigneeId = args.assigneeId ?? undefined;
      changes.push({
        field: "assignee",
        oldValue: issue.assigneeId,
        newValue: args.assigneeId ?? undefined,
      });
    }
    if (args.projectId !== undefined) {
      updates.projectId = args.projectId ?? undefined;
    }
    if (
      args.cycleId !== undefined &&
      (args.cycleId ?? undefined) !== issue.cycleId
    ) {
      updates.cycleId = args.cycleId ?? undefined;
      // Logged so cycle analytics can reconstruct scope changes over time.
      changes.push({
        field: "cycle",
        oldValue: issue.cycleId,
        newValue: args.cycleId ?? undefined,
      });
    }
    if (args.estimate !== undefined) {
      updates.estimate = args.estimate ?? undefined;
    }
    if (args.dueDate !== undefined) {
      updates.dueDate = args.dueDate ?? undefined;
    }
    if (args.sortOrder !== undefined) {
      updates.sortOrder = args.sortOrder;
    }

    await ctx.db.patch(issue._id, updates);

    for (const change of changes) {
      await logActivity(ctx, {
        orgId: ctx.org._id,
        issueId: issue._id,
        actorId: ctx.user._id,
        type: `${change.field}_changed`,
        field: change.field,
        oldValue: change.oldValue,
        newValue: change.newValue,
      });
    }

    // In-app notifications (createNotification skips the actor themselves).
    const newAssignee = args.assigneeId ?? undefined;
    if (newAssignee && newAssignee !== issue.assigneeId) {
      await createNotification(ctx, {
        orgId: ctx.org._id,
        userId: newAssignee,
        actorId: ctx.user._id,
        issueId: issue._id,
        type: "assigned",
      });
    }
    if (updates.status) {
      const recipients = new Set(
        [issue.creatorId, newAssignee ?? issue.assigneeId].filter(
          (id): id is Id<"users"> => id !== undefined
        )
      );
      for (const userId of recipients) {
        await createNotification(ctx, {
          orgId: ctx.org._id,
          userId,
          actorId: ctx.user._id,
          issueId: issue._id,
          type: "status_changed",
          newValue: updates.status,
        });
      }
    }

    // Mirror content/state changes onto the linked GitHub issue, if any.
    if (
      args.title !== undefined ||
      args.description !== undefined ||
      updates.status !== undefined
    ) {
      await scheduleGithubIssueSync(ctx, issue._id);
    }
    if (args.description !== undefined) {
      await autoLinkFigmaUrls(ctx, {
        orgId: ctx.org._id,
        issueId: issue._id,
        actorId: ctx.user._id,
        text: args.description,
      });
    }
    // Keep pushed Figma Dev Mode resources ("ENG-42 · Status · Title") fresh.
    if (updates.title !== undefined || updates.status !== undefined) {
      await scheduleFigmaDevSync(ctx, issue._id);
    }
    return null;
  },
});

export const remove = orgMutation({
  args: { issueId: v.id("issues") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const labelLinks = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();
    for (const link of labelLinks) {
      await ctx.db.delete(link._id);
    }

    await ctx.db.delete(issue._id);
    return null;
  },
});
