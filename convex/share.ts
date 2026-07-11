import { v } from "convex/values";
import { query } from "./_generated/server";
import { getOrgIssue } from "./issues";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { issuePriorityValidator, issueStatusValidator } from "./schema";

/**
 * Public read-only issue sharing. A share is a single unguessable token; the
 * public page and OG image read through `getByToken` (a PUBLIC query — no
 * auth, so it must only ever look up by token and return sanitized fields).
 */

/** The share link for an issue, for the share popover (members only). */
export const getForIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const share = await ctx.db
      .query("issueShares")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .unique();
    return share?.token ?? null;
  },
});

/** Create (or return the existing) share link for an issue. */
export const create = orgMutation({
  args: { issueId: v.id("issues") },
  returns: v.string(),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const existing = await ctx.db
      .query("issueShares")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .unique();
    if (existing) {
      return existing.token;
    }
    const token = crypto.randomUUID().replaceAll("-", "");
    await ctx.db.insert("issueShares", {
      orgId: ctx.org._id,
      issueId: issue._id,
      token,
      createdBy: ctx.user._id,
    });
    return token;
  },
});

/** Revoke an issue's share link; the public URL stops resolving instantly. */
export const revoke = orgMutation({
  args: { issueId: v.id("issues") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);
    const share = await ctx.db
      .query("issueShares")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .unique();
    if (share) {
      await ctx.db.delete(share._id);
    }
    return null;
  },
});

const publicIssueValidator = v.object({
  /** Display identifier, e.g. ENG-42. */
  identifier: v.string(),
  title: v.string(),
  description: v.optional(v.string()),
  status: issueStatusValidator,
  priority: issuePriorityValidator,
  estimate: v.optional(v.number()),
  labels: v.array(v.object({ name: v.string(), color: v.string() })),
  createdAt: v.number(),
  teamName: v.string(),
  orgName: v.string(),
});

/**
 * PUBLIC: resolve a share token to a sanitized read-only issue view.
 * No auth on purpose — the token is the entire capability. Never expose
 * assignees, comments, attachments, or raw ids here.
 */
export const getByToken = query({
  args: { token: v.string() },
  returns: v.union(v.null(), publicIssueValidator),
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("issueShares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!share) {
      return null;
    }
    const issue = await ctx.db.get(share.issueId);
    if (!issue) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const org = await ctx.db.get(issue.orgId);

    const links = await ctx.db
      .query("issueLabels")
      .withIndex("by_issue", (q) => q.eq("issueId", issue._id))
      .collect();
    const labels = [];
    for (const link of links) {
      const label = await ctx.db.get(link.labelId);
      if (label) {
        labels.push({ name: label.name, color: label.color });
      }
    }

    return {
      identifier: `${team?.key ?? "?"}-${issue.number}`,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      priority: issue.priority,
      estimate: issue.estimate,
      labels,
      createdAt: issue._creationTime,
      teamName: team?.name ?? "Team",
      orgName: org?.name ?? "a Cohere workspace",
    };
  },
});
