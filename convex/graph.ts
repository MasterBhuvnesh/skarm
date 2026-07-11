import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { orgQuery } from "./lib/customFunctions";
import {
  issuePriorityValidator,
  issueStatusValidator,
} from "./schema";

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
  }),
  handler: async (ctx, args) => {
    let issues: Doc<"issues">[] = [];
    if (args.projectId) {
      const project = await ctx.db.get(args.projectId);
      if (!project || project.orgId !== ctx.org._id) {
        throw new Error("Project not found");
      }
      issues = await ctx.db
        .query("issues")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } else if (args.cycleId) {
      const cycle = await ctx.db.get(args.cycleId);
      if (!cycle || cycle.orgId !== ctx.org._id) {
        throw new Error("Cycle not found");
      }
      issues = await ctx.db
        .query("issues")
        .withIndex("by_cycle", (q) => q.eq("cycleId", args.cycleId))
        .collect();
    } else {
      return { nodes: [], edges: [] };
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

    return { nodes, edges };
  },
});
