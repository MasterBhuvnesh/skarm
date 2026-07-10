import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { getOrgIssue } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { createNotification } from "./notifications";

/** Comment enriched with author + mention display info for the feed. */
const enrichedCommentValidator = v.object({
  _id: v.id("comments"),
  _creationTime: v.number(),
  issueId: v.id("issues"),
  authorId: v.id("users"),
  body: v.string(),
  mentions: v.array(v.id("users")),
  authorName: v.string(),
  authorImageUrl: v.optional(v.string()),
  /** Resolved names for everyone @mentioned, for highlight rendering. */
  mentionedUsers: v.array(
    v.object({ userId: v.id("users"), name: v.string() })
  ),
});

/** Verify a comment belongs to the caller's org before any read/write. */
async function getOrgComment(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  commentId: Id<"comments">
): Promise<Doc<"comments">> {
  const comment = await ctx.db.get(commentId);
  if (!comment || comment.orgId !== orgId) {
    throw new Error("Comment not found");
  }
  return comment;
}

/** Keep only mentioned users that are actually members of the org. */
async function filterToOrgMembers(
  ctx: { db: QueryCtx["db"] },
  orgId: Id<"organizations">,
  userIds: Id<"users">[]
): Promise<Id<"users">[]> {
  const unique = [...new Set(userIds)];
  const valid: Id<"users">[] = [];
  for (const userId of unique) {
    const membership = await ctx.db
      .query("members")
      .withIndex("by_org_and_user", (q) =>
        q.eq("orgId", orgId).eq("userId", userId)
      )
      .unique();
    if (membership) {
      valid.push(userId);
    }
  }
  return valid;
}

export const listByIssue = orgQuery({
  args: { issueId: v.id("issues") },
  returns: v.array(enrichedCommentValidator),
  handler: async (ctx, args) => {
    await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const comments = await ctx.db
      .query("comments")
      .withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
      .collect();

    const userCache = new Map<Id<"users">, Doc<"users"> | null>();
    const getUser = async (userId: Id<"users">) => {
      if (!userCache.has(userId)) {
        userCache.set(userId, await ctx.db.get(userId));
      }
      return userCache.get(userId) ?? null;
    };

    const result = [];
    for (const comment of comments) {
      const author = await getUser(comment.authorId);
      const mentions = comment.mentions ?? [];
      const mentionedUsers = [];
      for (const userId of mentions) {
        const user = await getUser(userId);
        if (user) {
          mentionedUsers.push({ userId: user._id, name: user.name });
        }
      }
      result.push({
        _id: comment._id,
        _creationTime: comment._creationTime,
        issueId: comment.issueId,
        authorId: comment.authorId,
        body: comment.body,
        mentions,
        authorName: author?.name ?? "Unknown user",
        authorImageUrl: author?.imageUrl,
        mentionedUsers,
      });
    }
    return result;
  },
});

export const create = orgMutation({
  args: {
    issueId: v.id("issues"),
    body: v.string(),
    mentions: v.optional(v.array(v.id("users"))),
  },
  returns: v.id("comments"),
  handler: async (ctx, args) => {
    const issue = await getOrgIssue(ctx, ctx.org._id, args.issueId);

    const body = args.body.trim();
    if (!body) {
      throw new Error("Comment cannot be empty");
    }

    const mentions = await filterToOrgMembers(
      ctx,
      ctx.org._id,
      args.mentions ?? []
    );

    const commentId = await ctx.db.insert("comments", {
      orgId: ctx.org._id,
      issueId: issue._id,
      authorId: ctx.user._id,
      body,
      mentions,
    });

    await logActivity(ctx, {
      orgId: ctx.org._id,
      issueId: issue._id,
      actorId: ctx.user._id,
      type: "commented",
    });

    for (const userId of mentions) {
      await createNotification(ctx, {
        orgId: ctx.org._id,
        userId,
        actorId: ctx.user._id,
        issueId: issue._id,
        type: "mention",
        commentId,
      });
    }

    return commentId;
  },
});

export const update = orgMutation({
  args: {
    commentId: v.id("comments"),
    body: v.string(),
    mentions: v.optional(v.array(v.id("users"))),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await getOrgComment(ctx, ctx.org._id, args.commentId);
    if (comment.authorId !== ctx.user._id) {
      throw new Error("Only the author can edit a comment");
    }

    const body = args.body.trim();
    if (!body) {
      throw new Error("Comment cannot be empty");
    }

    const mentions =
      args.mentions !== undefined
        ? await filterToOrgMembers(ctx, ctx.org._id, args.mentions)
        : undefined;

    await ctx.db.patch(comment._id, {
      body,
      ...(mentions !== undefined ? { mentions } : {}),
    });
    return null;
  },
});

export const remove = orgMutation({
  args: { commentId: v.id("comments") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const comment = await getOrgComment(ctx, ctx.org._id, args.commentId);
    const isAuthor = comment.authorId === ctx.user._id;
    const isAdmin = ctx.membership.role === "admin";
    if (!isAuthor && !isAdmin) {
      throw new Error("Only the author or an admin can delete a comment");
    }
    await ctx.db.delete(comment._id);
    return null;
  },
});
