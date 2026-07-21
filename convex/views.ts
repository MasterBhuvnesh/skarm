import { v } from "convex/values";
import { orgMutation, orgQuery } from "./lib/customFunctions";

const viewShape = {
  _id: v.id("views"),
  _creationTime: v.number(),
  orgId: v.id("organizations"),
  creatorId: v.id("users"),
  name: v.string(),
  /** JSON-serialized filter configuration (see components/views/filters.ts) */
  filters: v.string(),
  shared: v.boolean(),
};

const MAX_FILTERS_LENGTH = 4096;

/** Reject payloads that aren't valid JSON before they hit the table. */
function assertValidFilters(filters: string): void {
  if (filters.length > MAX_FILTERS_LENGTH) {
    throw new Error("View filters are too large");
  }
  try {
    JSON.parse(filters);
  } catch {
    throw new Error("View filters must be valid JSON");
  }
}

/**
 * Saved views visible to the caller: every shared view in the org plus the
 * caller's own private views.
 */
export const list = orgQuery({
  args: {},
  returns: v.array(v.object(viewShape)),
  handler: async (ctx) => {
    const views = await ctx.db
      .query("views")
      .withIndex("by_org", (q) => q.eq("orgId", ctx.org._id))
      .collect();
    return views
      .filter((view) => view.shared || view.creatorId === ctx.user._id)
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = orgMutation({
  args: {
    name: v.string(),
    filters: v.string(),
    shared: v.boolean(),
  },
  returns: v.id("views"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) {
      throw new Error("View name is required");
    }
    assertValidFilters(args.filters);
    return await ctx.db.insert("views", {
      orgId: ctx.org._id,
      creatorId: ctx.user._id,
      name,
      filters: args.filters,
      shared: args.shared,
    });
  },
});

export const update = orgMutation({
  args: {
    viewId: v.id("views"),
    name: v.optional(v.string()),
    filters: v.optional(v.string()),
    shared: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view || view.orgId !== ctx.org._id) {
      throw new Error("View not found");
    }
    if (view.creatorId !== ctx.user._id && ctx.membership.role !== "admin") {
      throw new Error("Only the view's creator or an admin can edit it");
    }

    const updates: { name?: string; filters?: string; shared?: boolean } = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) {
        throw new Error("View name is required");
      }
      updates.name = name;
    }
    if (args.filters !== undefined) {
      assertValidFilters(args.filters);
      updates.filters = args.filters;
    }
    if (args.shared !== undefined) {
      updates.shared = args.shared;
    }
    await ctx.db.patch(view._id, updates);
    return null;
  },
});

export const remove = orgMutation({
  args: { viewId: v.id("views") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const view = await ctx.db.get(args.viewId);
    if (!view || view.orgId !== ctx.org._id) {
      throw new Error("View not found");
    }
    if (view.creatorId !== ctx.user._id && ctx.membership.role !== "admin") {
      throw new Error("Only the view's creator or an admin can delete it");
    }
    await ctx.db.delete(view._id);
    return null;
  },
});

/**
 * Label assignments for every issue in a team - one round trip powering both
 * label chips on board cards and client-side label filtering.
 */
export const teamIssueLabels = orgQuery({
  args: { teamId: v.id("teams") },
  returns: v.array(
    v.object({
      issueId: v.id("issues"),
      labelId: v.id("labels"),
      name: v.string(),
      color: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const team = await ctx.db.get(args.teamId);
    if (!team || team.orgId !== ctx.org._id) {
      throw new Error("Team not found");
    }
    const issues = await ctx.db
      .query("issues")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .order("desc")
      .take(500);

    const labelCache = new Map<
      string,
      { _id: string; name: string; color: string } | null
    >();
    const result = [];
    for (const issue of issues) {
      const links = await ctx.db
        .query("issueLabels")
        .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
        .collect();
      for (const link of links) {
        let label = labelCache.get(link.labelId);
        if (label === undefined) {
          const doc = await ctx.db.get(link.labelId);
          label =
            doc && doc.orgId === ctx.org._id
              ? { _id: doc._id, name: doc.name, color: doc.color }
              : null;
          labelCache.set(link.labelId, label);
        }
        if (label) {
          result.push({
            issueId: issue._id,
            labelId: link.labelId,
            name: label.name,
            color: label.color,
          });
        }
      }
    }
    return result;
  },
});
