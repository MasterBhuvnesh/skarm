import { v } from "convex/values";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  MutationCtx,
} from "../_generated/server";
import { logActivity } from "../lib/activity";
import { getAuthContext } from "../lib/auth";
import { orgQuery } from "../lib/customFunctions";
import { createNotification } from "../notifications";

/**
 * Data half of the GitHub sync layer: everything that reads or writes the
 * Skarm database on behalf of GitHub automations. All timeline entries
 * written here use the `github` system actor so automated events are
 * clearly distinguished from user actions.
 *
 * convex/github/client.ts is the HTTP half; convex/integrations.ts owns the
 * install/webhook lifecycle.
 */

/**
 * Store the API-fetched repo list for an installation (called by
 * github/client.ts syncRepositories/refreshRepositories). Lives here rather
 * than integrations.ts to avoid an integrations ↔ client type-inference cycle.
 */
export const storeRepositories = internalMutation({
  args: {
    installationId: v.number(),
    repositories: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_installation", (q) =>
        q.eq("installationId", args.installationId)
      )
      .first();
    if (integration) {
      await ctx.db.patch(integration._id, {
        repositories: args.repositories,
      });
    }
    return null;
  },
});

/** Resolve the caller's org integration for API-backed actions. */
export const getAuthedInstallation = internalQuery({
  args: {},
  returns: v.object({ installationId: v.number() }),
  handler: async (ctx) => {
    const { org } = await getAuthContext(ctx);
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org_and_type", (q) =>
        q.eq("orgId", org._id).eq("type", "github")
      )
      .unique();
    if (!integration?.enabled || integration.installationId === undefined) {
      throw new Error("GitHub is not connected for this workspace");
    }
    return { installationId: integration.installationId };
  },
});

/** Everything the push actions need, or null if sync is no longer possible. */
export const getIssueForSync = internalQuery({
  args: { issueId: v.id("issues") },
  returns: v.union(
    v.null(),
    v.object({
      installationId: v.number(),
      orgId: v.id("organizations"),
      title: v.string(),
      description: v.optional(v.string()),
      status: v.string(),
      /** Display identifier, e.g. ENG-42. */
      identifier: v.string(),
      /** Linked GitHub issues to keep in sync. */
      links: v.array(v.object({ repo: v.string(), number: v.number() })),
    })
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue) {
      return null;
    }
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_org_and_type", (q) =>
        q.eq("orgId", issue.orgId).eq("type", "github")
      )
      .unique();
    if (!integration?.enabled || integration.installationId === undefined) {
      return null;
    }
    const team = await ctx.db.get(issue.teamId);
    const links = await ctx.db
      .query("githubIssues")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return {
      installationId: integration.installationId,
      orgId: issue.orgId,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      identifier: `${team?.key ?? "?"}-${issue.number}`,
      links: links.map((link) => ({ repo: link.repo, number: link.number })),
    };
  },
});

/**
 * Mutation-side hooks: schedule a push when (and only when) the issue has a
 * linked GitHub issue. Called after the local write, so the action reads the
 * committed state.
 */
export async function scheduleGithubIssueSync(
  ctx: MutationCtx,
  issueId: Id<"issues">
): Promise<void> {
  const link = await ctx.db
    .query("githubIssues")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .first();
  if (link) {
    await ctx.scheduler.runAfter(0, internal.github.client.pushIssueUpdate, {
      issueId,
    });
  }
}

export async function scheduleGithubAttachmentComment(
  ctx: MutationCtx,
  issueId: Id<"issues">,
  attachmentId: Id<"attachments">,
  fileName: string,
  storageId: Id<"_storage">
): Promise<void> {
  const link = await ctx.db
    .query("githubIssues")
    .withIndex("by_issue", (q) => q.eq("issueId", issueId))
    .first();
  if (!link) {
    return;
  }
  const url = await ctx.storage.getUrl(storageId);
  if (!url) {
    return;
  }
  await ctx.scheduler.runAfter(
    0,
    internal.github.client.pushAttachmentComment,
    { issueId, attachmentId, fileName, url }
  );
}

/** Delete the mirrored GitHub comments when an attachment is removed. */
export async function scheduleGithubAttachmentRemoval(
  ctx: MutationCtx,
  issueId: Id<"issues">,
  attachmentId: Id<"attachments">
): Promise<void> {
  const mappings = await ctx.db
    .query("githubAttachmentComments")
    .withIndex("by_attachment", (q) => q.eq("attachmentId", attachmentId))
    .collect();
  if (mappings.length === 0) {
    return;
  }
  for (const mapping of mappings) {
    await ctx.db.delete(mapping._id);
  }
  await ctx.scheduler.runAfter(
    0,
    internal.github.client.deleteAttachmentComments,
    {
      issueId,
      comments: mappings.map((m) => ({ repo: m.repo, commentId: m.commentId })),
    }
  );
}

export const recordAttachmentComment = internalMutation({
  args: {
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    attachmentId: v.id("attachments"),
    repo: v.string(),
    commentId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // The attachment may already be gone if it was removed while the push
    // action was in flight — delete the orphan comment right away.
    const attachment = await ctx.db.get(args.attachmentId);
    if (!attachment) {
      await ctx.scheduler.runAfter(
        0,
        internal.github.client.deleteAttachmentComments,
        {
          issueId: args.issueId,
          comments: [{ repo: args.repo, commentId: args.commentId }],
        }
      );
      return null;
    }
    await ctx.db.insert("githubAttachmentComments", {
      orgId: args.orgId,
      attachmentId: args.attachmentId,
      repo: args.repo,
      commentId: args.commentId,
    });
    return null;
  },
});

export const recordGithubIssue = internalMutation({
  args: {
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    repo: v.string(),
    number: v.number(),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("githubIssues", args);
    await logActivity(ctx, {
      orgId: args.orgId,
      issueId: args.issueId,
      systemActor: "github",
      type: "github_issue_created",
      newValue: `${args.repo}#${args.number}`,
    });
    return null;
  },
});

export const recordSyncFailure = internalMutation({
  args: {
    orgId: v.id("organizations"),
    issueId: v.id("issues"),
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await logActivity(ctx, {
      orgId: args.orgId,
      issueId: args.issueId,
      systemActor: "github",
      type: "github_sync_failed",
      newValue: args.reason.slice(0, 140),
    });
    return null;
  },
});

/** Our own sync footer, stripped from bodies that come back from GitHub. */
// Matches both current (Skarm) and pre-rename (Cohere) footers — GitHub
// issues created before the rebrand still carry the old text.
const SYNC_FOOTER = /\n*---\n_Synced from (?:Skarm|Cohere) issue \*\*.+?\*\*\._\s*$/;

/**
 * GitHub → Skarm: apply a change made on the linked GitHub issue. Bot
 * events are filtered in http.ts, so by the time we're here a human edited,
 * closed, reopened, or commented on GitHub. All writes use the github
 * system actor and never schedule an outbound push (no echo loops).
 */
export const applyGithubIssueEvent = internalMutation({
  args: {
    installationId: v.number(),
    repo: v.string(),
    number: v.number(),
    action: v.union(
      v.literal("edited"),
      v.literal("closed"),
      v.literal("reopened"),
      v.literal("commented")
    ),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    /** GitHub state_reason when closing ("completed" | "not_planned"). */
    stateReason: v.optional(v.string()),
    /** For comments: the GitHub login + comment body. */
    commentAuthor: v.optional(v.string()),
    commentBody: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("integrations")
      .withIndex("by_installation", (q) =>
        q.eq("installationId", args.installationId)
      )
      .first();
    if (!integration || !integration.enabled) {
      return null;
    }
    const link = await ctx.db
      .query("githubIssues")
      .withIndex("by_org_repo_number", (q) =>
        q
          .eq("orgId", integration.orgId)
          .eq("repo", args.repo)
          .eq("number", args.number)
      )
      .first();
    if (!link) {
      return null; // not a synced issue
    }
    const issue = await ctx.db.get(link.issueId);
    if (!issue) {
      return null;
    }
    const orgId = integration.orgId;

    const notifyStatusChange = async (newStatus: string) => {
      const recipients = new Set(
        [issue.creatorId, issue.assigneeId].filter(
          (id): id is NonNullable<typeof id> => id !== undefined
        )
      );
      for (const userId of recipients) {
        await createNotification(ctx, {
          orgId,
          userId,
          systemActor: "github",
          issueId: issue._id,
          type: "status_changed",
          newValue: newStatus,
        });
      }
    };

    switch (args.action) {
      case "edited": {
        const title = args.title?.trim();
        if (title && title !== issue.title) {
          await ctx.db.patch(issue._id, { title });
          await logActivity(ctx, {
            orgId,
            issueId: issue._id,
            systemActor: "github",
            type: "title_changed",
            field: "title",
            oldValue: issue.title,
            newValue: title,
          });
        }
        if (args.body !== undefined) {
          const description = args.body.replace(SYNC_FOOTER, "").trim();
          if (description !== (issue.description ?? "")) {
            await ctx.db.patch(issue._id, {
              description: description || undefined,
            });
          }
        }
        break;
      }
      case "closed": {
        const next = args.stateReason === "not_planned" ? "canceled" : "done";
        if (issue.status !== next) {
          await ctx.db.patch(issue._id, { status: next });
          await logActivity(ctx, {
            orgId,
            issueId: issue._id,
            systemActor: "github",
            type: "status_changed",
            field: "status",
            oldValue: issue.status,
            newValue: next,
          });
          await notifyStatusChange(next);
        }
        break;
      }
      case "reopened": {
        if (issue.status === "done" || issue.status === "canceled") {
          await ctx.db.patch(issue._id, { status: "todo" });
          await logActivity(ctx, {
            orgId,
            issueId: issue._id,
            systemActor: "github",
            type: "status_changed",
            field: "status",
            oldValue: issue.status,
            newValue: "todo",
          });
          await notifyStatusChange("todo");
        }
        break;
      }
      case "commented": {
        if (!args.commentBody?.trim()) {
          break;
        }
        await ctx.db.insert("comments", {
          orgId,
          issueId: issue._id,
          externalAuthor: args.commentAuthor ?? "GitHub user",
          body: args.commentBody.trim(),
        });
        await logActivity(ctx, {
          orgId,
          issueId: issue._id,
          systemActor: "github",
          type: "commented",
        });
        break;
      }
    }
    return null;
  },
});

/** GitHub issues linked to a Skarm issue, for the issue-detail panel. */
export const linksByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(
    v.object({
      _id: v.id("githubIssues"),
      repo: v.string(),
      number: v.number(),
      url: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const issue = await ctx.db.get(args.issueId);
    if (!issue || issue.orgId !== ctx.org._id) {
      throw new Error("Issue not found");
    }
    const links = await ctx.db
      .query("githubIssues")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();
    return links.map((link) => ({
      _id: link._id,
      repo: link.repo,
      number: link.number,
      url: link.url,
    }));
  },
});
