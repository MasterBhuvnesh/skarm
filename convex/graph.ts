import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import {
  issuePriorityValidator,
  issueStatusValidator,
} from "./schema";

const positionValidator = v.object({
  issueId: v.id("issues"),
  x: v.number(),
  y: v.number(),
});

/** Resolve and authorize a scope, returning its layout storage key. */
async function scopeKeyFor(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  args: { projectId?: Id<"projects">; cycleId?: Id<"cycles"> }
): Promise<string | null> {
  if (args.projectId) {
    const project = await ctx.db.get(args.projectId);
    if (!project || project.orgId !== orgId) {
      throw new Error("Project not found");
    }
    return `project:${args.projectId}`;
  }
  if (args.cycleId) {
    const cycle = await ctx.db.get(args.cycleId);
    if (!cycle || cycle.orgId !== orgId) {
      throw new Error("Cycle not found");
    }
    return `cycle:${args.cycleId}`;
  }
  return null;
}

/**
 * Dependency-graph data: the issues of one project or cycle as nodes, and
 * the relations BETWEEN those issues as edges. Relations are stored once
 * per pair (blocked_by normalized to blocks), so edges here are directed:
 * from blocks/duplicates/relates-to to.
 */
export const forScope = orgQuery({
  args: {
    projectId: v.optional(v.id("projects")),
    cycleId: v.optional(v.id("cycles")),
  },
  returns: v.object({
    nodes: v.array(
      v.object({
        issueId: v.id("issues"),
        identifier: v.string(),
        title: v.string(),
        status: issueStatusValidator,
        priority: issuePriorityValidator,
        estimate: v.optional(v.number()),
        assigneeName: v.optional(v.string()),
        assigneeImageUrl: v.optional(v.string()),
      })
    ),
    edges: v.array(
      v.object({
        relationId: v.id("issueRelations"),
        from: v.id("issues"),
        to: v.id("issues"),
        type: v.union(
          v.literal("blocks"),
          v.literal("related"),
          v.literal("duplicate_of")
        ),
      })
    ),
    /** Saved layout for this scope (empty when never arranged). */
    positions: v.array(positionValidator),
  }),
  handler: async (ctx, args) => {
    const scopeKey = await scopeKeyFor(ctx, ctx.org._id, args);
    if (!scopeKey) {
      return { nodes: [], edges: [], positions: [] };
    }
    let issues: Doc<"issues">[] = [];
    if (args.projectId) {
      issues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else if (args.cycleId) {
      issues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", args.cycleId))
        .collect();
    }
    issues = issues.filter((issue) => issue.orgId === ctx.org._id);
    const inScope = new Set<Id<"issues">>(issues.map((issue) => issue._id));

    const teamCache = new Map<Id<"teams">, Doc<"teams"> | null>();
    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const nodes = [];
    for (const issue of issues) {
      if (!teamCache.has(issue.teamId)) {
        teamCache.set(issue.teamId, await ctx.db.get(issue.teamId));
      }
      const team = teamCache.get(issue.teamId) ?? null;
      let assignee: Doc<"users"> | null = null;
      if (issue.assigneeId) {
        if (!userCache.has(issue.assigneeId)) {
          userCache.set(issue.assigneeId, await ctx.db.get(issue.assigneeId));
        }
        assignee = userCache.get(issue.assigneeId) ?? null;
      }
      nodes.push({
        issueId: issue._id,
        identifier: `${team?.key ?? "?"}-${issue.number}`,
        title: issue.title,
        status: issue.status,
        priority: issue.priority,
        estimate: issue.estimate,
        assigneeName: assignee?.name,
        assigneeImageUrl: assignee?.imageUrl,
      });
    }

    // Relations are stored once per pair, so outgoing rows cover everything.
    const edges = [];
    for (const issue of issues) {
      const outgoing = await ctx.db
        .query("issueRelations")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();
      for (const relation of outgoing) {
        if (!inScope.has(relation.relatedIssueId)) {
          continue;
        }
        edges.push({
          relationId: relation._id,
          from: relation.issueId,
          to: relation.relatedIssueId,
          // blocked_by never hits storage (normalized on write).
          type: relation.type as "blocks" | "related" | "duplicate_of",
        });
      }
    }

    const layout = await ctx.db
      .query("graphLayouts")
      .withIndex("by_org_scope", (q) =>
        q.eq("orgId", ctx.org._id).eq("scopeKey", scopeKey)
      )
      .unique();

    return { nodes, edges, positions: layout?.positions ?? [] };
  },
});

/** Persist the arrangement for a scope, replacing any previous layout. */
export const savePositions = orgMutation({
  args: {
    projectId: v.optional(v.id("projects")),
    cycleId: v.optional(v.id("cycles")),
    positions: v.array(positionValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scopeKey = await scopeKeyFor(ctx, ctx.org._id, args);
    if (!scopeKey) {
      throw new Error("Pick a project or cycle first");
    }
    const existing = await ctx.db
      .query("graphLayouts")
      .withIndex("by_org_scope", (q) =>
        q.eq("orgId", ctx.org._id).eq("scopeKey", scopeKey)
      )
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { positions: args.positions });
    } else {
      await ctx.db.insert("graphLayouts", {
        orgId: ctx.org._id,
        scopeKey,
        positions: args.positions,
      });
    }
    return null;
  },
});
