import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  QueryCtx,
} from "./_generated/server";
import { logActivity } from "./lib/activity";
import { orgAdminMutation, orgQuery } from "./lib/customFunctions";
import { createNotification } from "./notifications";

/**
 * GitHub integration. One record per org; the webhook endpoint in http.ts
 * verifies each delivery against `webhookSecret` and routes pull_request
 * events into `handlePullRequest`, which links PRs to issues by identifier
 * (ENG-42 in the branch name, title or body) and moves issue statuses:
 * PR opened → in_review, PR merged → done.
 */

async function getGithubIntegration(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">
): Promise<Doc<"integrations"> | null> {
  return await ctx.db
    .query("integrations")
    .withIndex("by_org", (q) => q.eq("orgId", orgId))
    .unique();
}

export const get = orgQuery({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("integrations"),
      orgId: v.id("organizations"),
      enabled: v.boolean(),
      connectedByName: v.string(),
      connectedAt: v.number(),
      /** Only revealed to org admins. */
      webhookSecret: v.optional(v.string()),
    })
  ),
  handler: async (ctx) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    if (!integration) {
      return null;
    }
    const connectedBy = await ctx.db.get(integration.connectedBy);
    const isAdmin = ctx.membership.role === "admin";
    return {
      _id: integration._id,
      orgId: integration.orgId,
      enabled: integration.enabled,
      connectedByName: connectedBy?.name ?? "Unknown user",
      connectedAt: integration._creationTime,
      webhookSecret: isAdmin ? integration.webhookSecret : undefined,
    };
  },
});

export const connect = orgAdminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const existing = await getGithubIntegration(ctx, ctx.org._id);
    if (existing) {
      throw new Error("GitHub is already connected");
    }
    await ctx.db.insert("integrations", {
      orgId: ctx.org._id,
      type: "github",
      enabled: true,
      webhookSecret: `ghs_${crypto.randomUUID().replaceAll("-", "")}`,
      connectedBy: ctx.user._id,
    });
    return null;
  },
});

export const setEnabled = orgAdminMutation({
  args: { enabled: v.boolean() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    if (!integration) {
      throw new Error("GitHub is not connected");
    }
    await ctx.db.patch(integration._id, { enabled: args.enabled });
    return null;
  },
});

/** Remove the integration. Linked PR records on issues are kept. */
export const disconnect = orgAdminMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const integration = await getGithubIntegration(ctx, ctx.org._id);
    if (integration) {
      await ctx.db.delete(integration._id);
    }
    return null;
  },
});

/** PRs linked to an issue, for the issue-detail panel. */
export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(
    v.object({
      _id: v.id("pullRequests"),
      repo: v.string(),
      number: v.number(),
      title: v.string(),
      url: v.string(),
      state: v.union(
        v.literal("open"),
        v.literal("merged"),
        v.literal("closed")
      ),
      authorLogin: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== ctx.org._id) {
      throw new Error("Issue not found");
    }
    const prs = await ctx.db
      .query("pullRequests")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return prs.map((pr) => ({
      _id: pr._id,
      repo: pr.repo,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      state: pr.state,
      authorLogin: pr.authorLogin,
    }));
  },
});

// ── Webhook internals ─────────────────────────────────────────────────────

export const getForWebhook = internalQuery({
  args: { orgId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      orgId: v.id("organizations"),
      enabled: v.boolean(),
      webhookSecret: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const orgId = ctx.db.normalizeId("organizations", args.orgId);
    if (!orgId) {
      return null;
    }
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org", (q) => q.eq("orgId", orgId))
      .unique();
    if (!integration) {
      return null;
    }
    return {
      orgId: integration.orgId,
      enabled: integration.enabled,
      webhookSecret: integration.webhookSecret,
    };
  },
});

/**
 * Process a verified pull_request event. Finds issue identifiers (ENG-42)
 * in the branch name / title / body, upserts PR links, and moves statuses:
 * open/reopened → in_review, merged → done.
 */
export const handlePullRequest = internalMutation({
  args: {
    orgId: v.id("organizations"),
    merged: v.boolean(),
    closed: v.boolean(),
    repo: v.string(),
    number: v.number(),
    title: v.string(),
    url: v.string(),
    authorLogin: v.string(),
    /** Branch name + title + body, scanned for issue identifiers. */
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .unique();
    if (!integration || !integration.enabled) {
      return null;
    }

    // "ENG-42" → team key + number. Team keys are short and alphabetic.
    const identifiers = new Map<string, number>();
    for (const match of args.text.matchAll(/\b([A-Za-z]{1,10})-(\d{1,6})\b/g)) {
      identifiers.set(match[1].toUpperCase(), Number(match[2]));
    }

    const state = args.merged ? "merged" : args.closed ? "closed" : "open";

    for (const [key, number] of identifiers) {
      const team = await ctx.db
        .query("teams")
        .withIndex("by_org_and_key", (q) =>
          q.eq("orgId", args.orgId).eq("key", key)
        )
        .unique();
      if (!team) {
        continue;
      }
      const issue = await ctx.db
        .query("issues")
        .withIndex("by_team_and_number", (q) =>
          q.eq("teamId", team._id).eq("number", number)
        )
        .unique();
      if (!issue) {
        continue;
      }

      // Upsert the PR link for this issue.
      const links = await ctx.db
        .query("pullRequests")
        .withIndex("by_org_repo_number", (q) =>
          q
            .eq("orgId", args.orgId)
            .eq("repo", args.repo)
            .eq("number", args.number)
        )
        .collect();
      const existing = links.find((link) => link.issueId === issue._id);
      if (existing) {
        await ctx.db.patch(existing._id, { title: args.title, state });
      } else {
        await ctx.db.insert("pullRequests", {
          orgId: args.orgId,
          issueId: issue._id,
          repo: args.repo,
          number: args.number,
          title: args.title,
          url: args.url,
          state,
          authorLogin: args.authorLogin,
        });
      }

      // Status transitions. Actor is whoever connected the integration —
      // there is no Cohere user for the GitHub actor.
      const nextStatus =
        state === "merged" &&
        issue.status !== "done" &&
        issue.status !== "canceled"
          ? ("done" as const)
          : state === "open" &&
              (issue.status === "backlog" ||
                issue.status === "todo" ||
                issue.status === "in_progress")
            ? ("in_review" as const)
            : null;
      if (!nextStatus) {
        continue;
      }

      await ctx.db.patch(issue._id, { status: nextStatus });
      await logActivity(ctx, {
        orgId: args.orgId,
        issueId: issue._id,
        actorId: integration.connectedBy,
        type: "status_changed",
        field: "status",
        oldValue: issue.status,
        newValue: nextStatus,
      });
      const recipients = new Set(
        [issue.creatorId, issue.assigneeId].filter(
          (id): id is NonNullable<typeof id> => id !== undefined
        )
      );
      for (const userId of recipients) {
        await createNotification(ctx, {
          orgId: args.orgId,
          userId,
          actorId: integration.connectedBy,
          issueId: issue._id,
          type: "status_changed",
          newValue: nextStatus,
        });
      }
    }
    return null;
  },
});
