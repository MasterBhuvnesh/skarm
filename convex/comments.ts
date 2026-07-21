import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { getOrgIssue } from "./issues";
import { logActivity } from "./lib/activity";
import { orgMutation, orgQuery } from "./lib/customFunctions";
import { autoLinkFigmaUrls } from "./lib/figmaLinks";
import { createNotification } from "./notifications";

/** Comment enriched with author + mention display info for the feed. */
const enrichedCommentValidator = v.object({
  _id: v.id("comments"),
  _creationTime: v.number(),
  issueId: v.id("issues"),
  authorId: v.optional(v.id("users")),
  /** Set on replies; points at the root comment (threads are one level deep). */
  parentId: v.optional(v.id("comments")),
  body: v.string(),
  mentions: v.array(v.id("users")),
  authorName: v.string(),
  authorImageUrl: v.optional(v.string()),
  /** True for comments mirrored from GitHub (externalAuthor set). */
  external: v.boolean(),
  /** Resolved names for everyone @mentioned, for highlight rendering. */
  mentionedUsers: v.array(
    v.object({ userId: v.id("users"), name: v.string() })
  ),
  /** Emoji reactions grouped by emoji, with reactor names for the tooltip. */
  reactions: v.array(
    v.object({
      emoji: v.string(),
      count: v.number(),
      reactedByMe: v.boolean(),
      names: v.array(v.string()),
    })
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
      const author = comment.authorId ? await getUser(comment.authorId) : null;
      const mentions = comment.mentions ?? [];
      const mentionedUsers = [];
      for (const userId of mentions) {
        const user = await getUser(userId);
        if (user) {
          mentionedUsers.push({ userId: user._id, name: user.name });
        }
      }

      // Group raw reactions by emoji (insertion order preserved).
      const grouped = new Map<
        string,
        { count: number; reactedByMe: boolean; names: string[] }
      >();
      for (const reaction of comment.reactions ?? []) {
        let group = grouped.get(reaction.emoji);
        if (!group) {
          group = { count: 0, reactedByMe: false, names: [] };
          grouped.set(reaction.emoji, group);
        }
        group.count += 1;
        if (reaction.userId === ctx.user._id) {
          group.reactedByMe = true;
        }
        const reactor = await getUser(reaction.userId);
        group.names.push(reactor?.name ?? "Unknown user");
      }
      const reactions = [...grouped.entries()].map(([emoji, group]) => ({
        emoji,
        ...group,
      }));

      result.push({
        _id: comment._id,
        _creationTime: comment._creationTime,
        issueId: comment.issueId,
        authorId: comment.authorId,
        parentId: comment.parentId,
        body: comment.body,
        mentions,
        authorName:
          comment.externalAuthor ?? author?.name ?? "Unknown user",
        authorImageUrl: author?.imageUrl,
        external: comment.externalAuthor !== undefined,
        mentionedUsers,
        reactions,
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
    /** Reply to this comment; flattened to the root if it is itself a reply. */
    parentId: v.optional(v.id("comments")),
    /** Also post this comment to the issue's linked Figma design(s). */
    postToFigma: v.optional(v.boolean()),
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

    // Resolve the thread root for replies (threads are one level deep).
    let parentId: Id<"comments"> | undefined;
    let replyRecipient: Id<"users"> | undefined;
    if (args.parentId) {
      const parent = await getOrgComment(ctx, ctx.org._id, args.parentId);
      if (parent.issueId !== issue._id) {
        throw new ConvexError("Parent comment is on a different issue");
      }
      if (parent.parentId) {
        // Flatten: attach to the parent's root and notify the root author.
        parentId = parent.parentId;
        const root = await getOrgComment(ctx, ctx.org._id, parent.parentId);
        replyRecipient = root.authorId;
      } else {
        parentId = parent._id;
        replyRecipient = parent.authorId;
      }
    }

    const commentId = await ctx.db.insert("comments", {
      orgId: ctx.org._id,
      issueId: issue._id,
      authorId: ctx.user._id,
      body,
      mentions,
      ...(parentId ? { parentId } : {}),
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

    // Notify the root author of a reply (createNotification skips self-replies).
    if (replyRecipient) {
      await createNotification(ctx, {
        orgId: ctx.org._id,
        userId: replyRecipient,
        actorId: ctx.user._id,
        issueId: issue._id,
        type: "reply",
        commentId,
      });
    }

    // Figma URLs pasted into comments attach to the Figma panel.
    await autoLinkFigmaUrls(ctx, {
      orgId: ctx.org._id,
      issueId: issue._id,
      actorId: ctx.user._id,
      text: body,
    });
    if (args.postToFigma) {
      await ctx.scheduler.runAfter(0, internal.figma.pushComment, {
        issueId: issue._id,
        authorName: ctx.user.name,
        body,
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

export const toggleReaction = orgMutation({
  args: { commentId: v.id("comments"), emoji: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.emoji.length > 8) {
      throw new ConvexError("Invalid emoji");
    }
    const comment = await getOrgComment(ctx, ctx.org._id, args.commentId);
    const reactions = comment.reactions ?? [];
    const mine = reactions.findIndex(
      (reaction) =>
        reaction.emoji === args.emoji && reaction.userId === ctx.user._id
    );
    const next =
      mine >= 0
        ? reactions.filter((_, index) => index !== mine)
        : [...reactions, { emoji: args.emoji, userId: ctx.user._id }];
    await ctx.db.patch(comment._id, { reactions: next });
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
    // Deleting a top-level comment removes its replies too.
    if (!comment.parentId) {
      const replies = await ctx.db
        .query("comments")
        .withIndex("by_parent", (q) => q.eq("parentId", comment._id))
        .collect();
      for (const reply of replies) {
        await ctx.db.delete(reply._id);
      }
    }
    await ctx.db.delete(comment._id);
    return null;
  },
});
